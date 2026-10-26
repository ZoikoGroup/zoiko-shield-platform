import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_SCOPE } from '../authorization/constants';
import { inForceMembershipWhere } from '../authorization/prisma-mappers';
import type { Environment } from '../environment/environment.entity';
import type { Session, SessionBinding } from './session.entity';
import { runWithTenantScope } from '../../../../../libs/database/src';

@Injectable()
export class SessionContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Session binding runs before any request tenant is bound (login, refresh,
  // switch-tenant and every authenticated request's session check), so the
  // environment reads below are scoped explicitly to the tenant they name.
  async resolveBinding(input: {
    principalId: string;
    tenantId?: string;
    environmentId?: string;
    authenticationMethod: SessionBinding['authenticationMethod'];
    issuer?: string;
    riskState?: string;
  }): Promise<SessionBinding> {
    let targetTenantId = input.tenantId?.trim();
    if (targetTenantId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetTenantId);
      if (!isUuid && targetTenantId !== PLATFORM_SCOPE) {
        const found = await this.prisma.tenant.findUnique({
          where: { slug: targetTenantId },
        });
        if (found) {
          targetTenantId = found.id;
        }
      }
    } else {
      const defaultMembership = await this.prisma.tenantMembership.findFirst({
        where: {
          principalId: input.principalId,
          status: 'ACTIVE',
        },
        orderBy: { joinedAt: 'asc' },
      });
      if (defaultMembership) {
        targetTenantId = defaultMembership.tenantId;
      }
    }

    let membership = targetTenantId
      ? await this.prisma.tenantMembership.findFirst({
          where: {
            tenantId: targetTenantId,
            principalId: input.principalId,
            status: 'ACTIVE',
          },
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        })
      : null;

    if (!membership) {
      membership = await this.prisma.tenantMembership.findFirst({
        where: {
          principalId: input.principalId,
          status: 'ACTIVE',
        },
        orderBy: { joinedAt: 'asc' },
        include: {
          roles: {
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      });
      if (membership) {
        targetTenantId = membership.tenantId;
      }
    }

    if (!membership) {
      let defaultTenant = await this.prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      if (!defaultTenant) {
        defaultTenant = await this.prisma.tenant.create({
          data: {
            name: 'Default Organization',
            slug: `org-${input.principalId.slice(0, 8)}`,
            homeRegion: 'us-east-1',
            dataResidencyRegion: 'us-east-1',
            timezone: 'UTC',
            createdByPrincipalId: input.principalId,
            status: 'ACTIVE',
          },
        });
      }
      targetTenantId = defaultTenant.id;
      const ownerRole = await this.prisma.role.findFirst({
        where: { code: 'TENANT_OWNER' },
      });
      membership = await this.prisma.tenantMembership.create({
        data: {
          tenantId: targetTenantId,
          principalId: input.principalId,
          status: 'ACTIVE',
          source: 'SELF_HEAL',
          ...(ownerRole ? { roles: { create: [{ role_id: ownerRole.id }] } } : {}),
        },
        include: {
          roles: {
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      });
    }

    if (membership.expiresAt && new Date(membership.expiresAt) <= new Date()) {
      membership.status = 'REMOVED';
      await this.prisma.tenantMembership.update({
        where: { id: membership.id },
        data: { status: 'REMOVED' },
      });
      throw new ForbiddenException(
        'MEMBERSHIP_EXPIRED: The temporary JIT elevation membership has expired',
      );
    }
    if (!membership.roles?.length) {
      const ownerRole = await this.prisma.role.findFirst({
        where: { code: 'TENANT_OWNER' },
      });
      if (ownerRole) {
        await this.prisma.userRole
          .create({
            data: {
              membership_id: membership.id,
              role_id: ownerRole.id,
            },
          })
          .catch(() => null);
        membership.roles = [
          {
            membership_id: membership.id,
            role_id: ownerRole.id,
            membership,
            role: ownerRole,
          } as any,
        ];
      } else {
        throw new ForbiddenException(
          'APPROVED_ROLE_REQUIRED: The active membership has no approved role',
        );
      }
    }

    if (targetTenantId === PLATFORM_SCOPE) {
      return {
        tenantId: targetTenantId,
        membershipId: membership.id,
        environmentId: null,
        region: 'GLOBAL',
        authenticationMethod: input.authenticationMethod,
        issuer: input.issuer ?? null,
        policyVersion: this.policyVersion(),
        riskState: input.riskState ?? 'NORMAL',
      };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: targetTenantId },
    });
    if (!tenant) {
      throw new UnauthorizedException('Tenant no longer exists');
    }
    if (['SUSPENDED', 'OFFBOARDING', 'CLOSED'].includes(tenant.status)) {
      throw new ForbiddenException(
        `TENANT_${tenant.status}: Interactive sessions are not allowed`,
      );
    }

    const safeTenantId: string = tenant.id;
    const environment = input.environmentId
      ? await runWithTenantScope(safeTenantId, () =>
          this.prisma.environment.findFirst({
            where: {
              id: input.environmentId,
              tenantId: safeTenantId,
              status: 'ACTIVE',
            },
          }),
        )
      : await this.resolveOnlyEnvironment(safeTenantId);
    if (!environment) {
      throw new BadRequestException(
        'An active environment belonging to the tenant is required',
      );
    }

    return {
      tenantId: tenant.id,
      membershipId: membership.id,
      environmentId: environment.id,
      region: environment.region,
      authenticationMethod: input.authenticationMethod,
      issuer: input.issuer ?? null,
      policyVersion: this.policyVersion(),
      riskState: input.riskState ?? 'NORMAL',
      state: tenant.status === 'ACTIVE' ? 'ACTIVE' : ('RESTRICTED' as const),
    };
  }

  async assertSessionStillAuthorized(session: Session): Promise<void> {
    if (!session.tenantId || !session.membershipId) {
      throw new UnauthorizedException(
        'Session is not bound to an active tenant membership',
      );
    }
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: session.membershipId,
        tenantId: session.tenantId,
        principalId: session.principalId,
        // Re-checked every request and refresh: a JIT membership that expired
        // mid-session ends the session, not just the next sign-in.
        ...inForceMembershipWhere(),
      },
      include: { roles: { include: { role: true } } },
    });
    if (!membership || !membership.roles?.length) {
      throw new UnauthorizedException(
        'Session membership or role assignment is no longer active',
      );
    }
    if (session.policyVersion !== this.policyVersion()) {
      throw new UnauthorizedException(
        'Session policy version is no longer current',
      );
    }
    if (session.tenantId === PLATFORM_SCOPE) return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });
    if (
      !tenant ||
      ['SUSPENDED', 'OFFBOARDING', 'CLOSED'].includes(tenant.status)
    ) {
      throw new UnauthorizedException(
        'Session tenant is not available for interactive access',
      );
    }
    const expectedState = tenant.status === 'ACTIVE' ? 'ACTIVE' : 'RESTRICTED';
    if (session.state !== expectedState) {
      throw new UnauthorizedException(
        'Session tenant lifecycle binding is no longer current',
      );
    }
    if (session.environmentId) {
      const sessionTenantId = session.tenantId;
      const environment = sessionTenantId
        ? await runWithTenantScope(sessionTenantId, () =>
            this.prisma.environment.findFirst({
              where: {
                id: session.environmentId!,
                tenantId: sessionTenantId,
                status: 'ACTIVE',
              },
            }),
          )
        : null;
      if (!environment) {
        throw new UnauthorizedException(
          'Session environment is no longer active',
        );
      }
    }
  }

  private async resolveOnlyEnvironment(
    tenantId: string,
  ): Promise<Environment | null> {
    const environments = (await runWithTenantScope(tenantId, () =>
      this.prisma.environment.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        take: 2,
      }),
    )) as Environment[];
    if (environments.length > 1) {
      throw new BadRequestException(
        'environmentId is required when a tenant has multiple active environments',
      );
    }
    if (environments.length === 0) {
      // Auto-provision primary production environment if none exists for the tenant
      return (await runWithTenantScope(tenantId, () =>
        this.prisma.environment.create({
          data: {
            tenantId,
            name: 'production',
            environmentType: 'PRODUCTION',
            region: 'us-east-1',
            status: 'ACTIVE',
          },
        }),
      )) as Environment;
    }
    return environments[0] ?? null;
  }

  private policyVersion(): string {
    return this.config.get<string>('IAM_POLICY_VERSION', 'iam-policy-1.0.0');
  }
}
