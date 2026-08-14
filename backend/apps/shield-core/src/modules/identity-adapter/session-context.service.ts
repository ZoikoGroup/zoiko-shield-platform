import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantMembership } from '../authorization/entities/tenant-membership.entity';
import { PLATFORM_SCOPE } from '../authorization/constants';
import { Environment } from '../environment/environment.entity';
import { Tenant } from '../tenant/tenant.entity';
import { Session, SessionBinding } from './session.entity';

@Injectable()
export class SessionContextService {
  constructor(
    @InjectRepository(TenantMembership)
    private readonly memberships: Repository<TenantMembership>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(Environment)
    private readonly environments: Repository<Environment>,
    private readonly config: ConfigService,
  ) {}

  async resolveBinding(input: {
    principalId: string;
    tenantId: string;
    environmentId?: string;
    authenticationMethod: SessionBinding['authenticationMethod'];
    issuer?: string;
    riskState?: string;
  }): Promise<SessionBinding> {
    const membership = await this.memberships.findOne({
      where: {
        tenantId: input.tenantId,
        principalId: input.principalId,
        status: 'ACTIVE',
      },
      relations: { roles: { permissions: true } },
    });
    if (!membership) {
      throw new ForbiddenException(
        'ACTIVE_TENANT_MEMBERSHIP_REQUIRED: No active membership exists for this tenant',
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

    const tenant = await this.tenants.findOne({
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
      ? await this.environments.findOne({
          where: {
            id: input.environmentId,
            tenantId: input.tenantId,
            status: 'ACTIVE',
          },
        })
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
    const membership = await this.memberships.findOne({
      where: {
        id: session.membershipId,
        tenantId: session.tenantId,
        principalId: session.principalId,
        status: 'ACTIVE',
      },
      relations: { roles: true },
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
    const tenant = await this.tenants.findOne({
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
      const environment = await this.environments.findOne({
        where: {
          id: session.environmentId,
          tenantId: session.tenantId,
          status: 'ACTIVE',
        },
      });
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
    const environments = await this.environments.find({
      where: { tenantId, status: 'ACTIVE' },
      order: { createdAt: 'ASC' },
      take: 2,
    });
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
