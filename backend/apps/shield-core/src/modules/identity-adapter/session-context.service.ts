import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_SCOPE } from '../authorization/constants';
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
    tenantId: string;
    environmentId?: string;
    authenticationMethod: SessionBinding['authenticationMethod'];
    issuer?: string;
    riskState?: string;
  }): Promise<SessionBinding> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId: input.tenantId,
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
    });
    if (!membership) {
      throw new ForbiddenException(
        'ACTIVE_TENANT_MEMBERSHIP_REQUIRED: No active membership exists for this tenant',
      );
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
      throw new ForbiddenException(
        'APPROVED_ROLE_REQUIRED: The active membership has no approved role',
      );
    }

    if (input.tenantId === PLATFORM_SCOPE) {
      return {
        tenantId: input.tenantId,
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
      where: { id: input.tenantId },
    });
    if (!tenant) {
      throw new UnauthorizedException('Tenant no longer exists');
    }
    if (['SUSPENDED', 'OFFBOARDING', 'CLOSED'].includes(tenant.status)) {
      throw new ForbiddenException(
        `TENANT_${tenant.status}: Interactive sessions are not allowed`,
      );
    }

    const environment = input.environmentId
      ? await runWithTenantScope(input.tenantId, () =>
          this.prisma.environment.findFirst({
            where: {
              id: input.environmentId,
              tenantId: input.tenantId,
              status: 'ACTIVE',
            },
          }),
        )
      : await this.resolveOnlyEnvironment(input.tenantId);
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
        status: 'ACTIVE',
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
    return environments[0] ?? null;
  }

  private policyVersion(): string {
    return this.config.get<string>('IAM_POLICY_VERSION', 'iam-policy-1.0.0');
  }
}
