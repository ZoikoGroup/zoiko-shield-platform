import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../identity-adapter/session.service';

/** Operational-only allowlist. Commercial, pricing and entitlement authority is absent by design. */
export const ALLOWED_DELEGATION_SCOPES = [
  'VIEW_USAGE',
  'VIEW_INVOICES',
  'VIEW_TICKETS',
  'MANAGE_SUPPORT_CASES',
  'VIEW_ENTITLEMENTS',
] as const;
export type DelegationScope = (typeof ALLOWED_DELEGATION_SCOPES)[number];

function isDelegationScope(scope: string): scope is DelegationScope {
  return (ALLOWED_DELEGATION_SCOPES as readonly string[]).includes(scope);
}

export class GrantDelegationDto {
  @IsString()
  @IsNotEmpty()
  partnerId!: string;

  @IsString()
  @IsNotEmpty()
  managingOrganizationId!: string;

  @IsString()
  @IsNotEmpty()
  partnerPrincipalId!: string;

  @IsString()
  @IsNotEmpty()
  commercialAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scope!: string[];

  @IsISO8601()
  expiresAt!: string;
}

export class RevokeDelegationDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

@Injectable()
export class PartnerDelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  async grantDelegation(
    tenantId: string,
    environmentId: string | null,
    actorId: string,
    dto: GrantDelegationDto,
  ) {
    const environment = this.requireEnvironment(environmentId);
    const expiresAt = new Date(dto.expiresAt);
    this.assertExpiry(expiresAt);
    const scope = [...new Set(dto.scope)];
    const invalidScopes = scope.filter((item) => !isDelegationScope(item));
    if (invalidScopes.length) {
      throw new ConflictException({
        statusCode: 409,
        error: 'SCOPE_NOT_DELEGABLE',
        message: `Scope(s) [${invalidScopes.join(', ')}] cannot be delegated — operational access never implies commercial/pricing authority`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // A principal operating through a delegation can never re-delegate,
      // even if a customer role is accidentally broadened later.
      const actorDelegation = await tx.partnerDelegation.findFirst({
        where: {
          tenant_id: tenantId,
          partner_principal_id: actorId,
          status: 'ACTIVE',
          expires_at: { gt: now },
        },
        select: { id: true },
      });
      if (actorDelegation) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'DELEGATION_NON_TRANSITIVE',
          message:
            'A delegated partner principal cannot grant another delegation',
        });
      }

      const [partner, principalContext, binding, activeBindingCount] =
        await Promise.all([
          tx.partner.findFirst({
            where: {
              id: dto.partnerId,
              managing_organization_id: dto.managingOrganizationId,
              partner_type: { in: ['MSP', 'MSSP'] },
              status: 'ACTIVE',
            },
            select: { id: true },
          }),
          tx.partnerPrincipalContext.findFirst({
            where: {
              partner_id: dto.partnerId,
              principal_id: dto.partnerPrincipalId,
              managing_organization_id: dto.managingOrganizationId,
              status: 'ACTIVE',
            },
            select: { id: true },
          }),
          tx.commercialAccountTenantBinding.findFirst({
            where: {
              commercial_account_id: dto.commercialAccountId,
              tenant_id: tenantId,
              environment_id: environment,
              status: 'ACTIVE',
              effective_from: { lte: now },
              OR: [{ effective_to: null }, { effective_to: { gt: now } }],
            },
            select: { id: true },
          }),
          tx.commercialAccountTenantBinding.count({
            where: {
              tenant_id: tenantId,
              environment_id: environment,
              status: 'ACTIVE',
              effective_from: { lte: now },
              OR: [{ effective_to: null }, { effective_to: { gt: now } }],
            },
          }),
        ]);
      if (!partner) {
        throw new NotFoundException(
          `Active MSP/MSSP partner '${dto.partnerId}' not found`,
        );
      }
      if (!binding) {
        throw new NotFoundException(
          `Commercial account '${dto.commercialAccountId}' not found`,
        );
      }
      if (!principalContext) {
        throw new ConflictException({
          statusCode: 409,
          error: 'AUTHORITATIVE_PARTNER_PRINCIPAL_REQUIRED',
          message:
            'The delegated principal must have an active identity context for this partner and managing organization',
        });
      }
      if (activeBindingCount !== 1) {
        throw new ConflictException({
          statusCode: 409,
          error: 'DELEGATION_CUSTOMER_BOUNDARY_AMBIGUOUS',
          message:
            'Delegated operations require exactly one active commercial account for the tenant and environment boundary',
        });
      }

      const duplicate = await tx.partnerDelegation.findFirst({
        where: {
          partner_id: dto.partnerId,
          managing_organization_id: dto.managingOrganizationId,
          partner_principal_id: dto.partnerPrincipalId,
          partner_principal_context_id: principalContext.id,
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environment,
          status: 'ACTIVE',
          expires_at: { gt: now },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException({
          statusCode: 409,
          error: 'ACTIVE_DELEGATION_EXISTS',
          message:
            'An active delegation already exists for this partner principal and customer boundary',
        });
      }

      const delegation = await tx.partnerDelegation.create({
        data: {
          partner_id: dto.partnerId,
          managing_organization_id: dto.managingOrganizationId,
          partner_principal_id: dto.partnerPrincipalId,
          partner_principal_context_id: principalContext.id,
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environment,
          scope: JSON.stringify(scope),
          customer_visible: true,
          granted_by: actorId,
          expires_at: expiresAt,
          status: 'ACTIVE',
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_delegation.granted',
          tenant_id: tenantId,
          actor: actorId,
          idempotency_key: `partner-delegation-granted-${delegation.id}`,
          payload: JSON.stringify({
            delegationId: delegation.id,
            partnerId: dto.partnerId,
            managingOrganizationId: dto.managingOrganizationId,
            partnerPrincipalId: dto.partnerPrincipalId,
            commercialAccountId: dto.commercialAccountId,
            environmentId: environment,
            scope,
            expiresAt: expiresAt.toISOString(),
          }),
        },
      });
      return this.view(delegation);
    });
  }

  async listForCustomer(
    tenantId: string,
    environmentId: string | null,
    commercialAccountId?: string,
  ) {
    const environment = this.requireEnvironment(environmentId);
    await this.materializeExpiredDelegations({
      tenant_id: tenantId,
      environment_id: environment,
    });
    const delegations = await this.prisma.partnerDelegation.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environment,
        customer_visible: true,
        ...(commercialAccountId
          ? { commercial_account_id: commercialAccountId }
          : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return delegations.map((delegation) => this.view(delegation));
  }

  async revoke(
    id: string,
    tenantId: string,
    environmentId: string | null,
    actorId: string,
    reason: string,
  ) {
    const environment = this.requireEnvironment(environmentId);
    const revoked = await this.prisma.$transaction(async (tx) => {
      const delegation = await tx.partnerDelegation.findFirst({
        where: {
          id,
          tenant_id: tenantId,
          environment_id: environment,
          customer_visible: true,
        },
      });
      if (!delegation) {
        throw new NotFoundException(`Partner delegation '${id}' not found`);
      }
      if (delegation.status !== 'ACTIVE') {
        throw new ConflictException(
          `Delegation '${id}' is '${delegation.status}', not ACTIVE`,
        );
      }
      const revoked = await tx.partnerDelegation.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revoked_at: new Date(),
          revoked_by: actorId,
          revocation_reason: reason,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_delegation.revoked',
          tenant_id: tenantId,
          actor: actorId,
          idempotency_key: `partner-delegation-revoked-${id}`,
          payload: JSON.stringify({ delegationId: id, reason }),
        },
      });
      return revoked;
    });
    await this.sessionService.revokeForPrincipalTenant(
      revoked.partner_principal_id,
      tenantId,
      'PARTNER_DELEGATION_REVOKED',
    );
    return this.view(revoked);
  }

  /**
   * Authoritative identity-, tenant-, environment-, account- and
   * managing-organization-bound resolution used by every partner operation.
   */
  async requireActiveDelegation(input: {
    tenantId: string;
    environmentId: string | null;
    partnerPrincipalId: string;
    managingOrganizationId: string;
    commercialAccountId: string;
    requiredScope: string;
  }) {
    if (!isDelegationScope(input.requiredScope)) {
      throw new ForbiddenException('The requested partner scope is invalid');
    }
    const environment = this.requireEnvironment(input.environmentId);
    const principalContext =
      await this.prisma.partnerPrincipalContext.findUnique({
        where: { principal_id: input.partnerPrincipalId },
      });
    if (
      !principalContext ||
      principalContext.status !== 'ACTIVE' ||
      principalContext.managing_organization_id !== input.managingOrganizationId
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'ACTIVE_PARTNER_PRINCIPAL_CONTEXT_REQUIRED',
        message:
          'The authenticated principal has no active identity context for this managing organization',
      });
    }
    const delegation = await this.prisma.partnerDelegation.findFirst({
      where: {
        partner_principal_context_id: principalContext.id,
        partner_principal_id: input.partnerPrincipalId,
        managing_organization_id: input.managingOrganizationId,
        commercial_account_id: input.commercialAccountId,
        tenant_id: input.tenantId,
        environment_id: environment,
        status: 'ACTIVE',
        customer_visible: true,
      },
      orderBy: { created_at: 'desc' },
    });
    if (!delegation) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'ACTIVE_PARTNER_DELEGATION_REQUIRED',
        message:
          'No customer-visible active delegation matches this customer boundary',
      });
    }
    if (delegation.expires_at <= new Date()) {
      await this.materializeExpiredDelegations({ id: delegation.id });
      throw new ForbiddenException({
        statusCode: 403,
        error: 'PARTNER_DELEGATION_EXPIRED',
        message: 'The customer delegation has expired',
      });
    }
    if (!this.parseScope(delegation.scope).includes(input.requiredScope)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'PARTNER_DELEGATION_SCOPE_REQUIRED',
        message: `The customer delegation does not grant '${input.requiredScope}'`,
      });
    }

    const now = new Date();
    const [binding, activeBindingCount] = await Promise.all([
      this.prisma.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: input.commercialAccountId,
          tenant_id: input.tenantId,
          environment_id: environment,
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
        select: { id: true },
      }),
      this.prisma.commercialAccountTenantBinding.count({
        where: {
          tenant_id: input.tenantId,
          environment_id: environment,
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
      }),
    ]);
    if (!binding || activeBindingCount !== 1) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'PARTNER_CUSTOMER_BOUNDARY_INVALID',
        message:
          'The delegated commercial-account boundary is no longer uniquely active',
      });
    }
    return this.view(delegation);
  }

  /** Identity-, tenant-, environment-, account- and managing-org-bound check. */
  async checkDelegation(input: {
    tenantId: string;
    environmentId: string | null;
    partnerPrincipalId: string;
    managingOrganizationId: string;
    commercialAccountId: string;
    requiredScope: string;
  }): Promise<boolean> {
    try {
      await this.requireActiveDelegation(input);
      return true;
    } catch {
      return false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireElapsedDelegations(): Promise<number> {
    return this.materializeExpiredDelegations({});
  }

  private async materializeExpiredDelegations(boundary: {
    id?: string;
    tenant_id?: string;
    environment_id?: string;
  }): Promise<number> {
    const now = new Date();
    const elapsed = await this.prisma.partnerDelegation.findMany({
      where: {
        ...boundary,
        status: 'ACTIVE',
        expires_at: { lte: now },
      },
      select: {
        id: true,
        tenant_id: true,
        partner_principal_id: true,
      },
    });
    if (!elapsed.length) return 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.partnerDelegation.updateMany({
        where: {
          id: { in: elapsed.map((delegation) => delegation.id) },
          status: 'ACTIVE',
        },
        data: { status: 'EXPIRED' },
      });
      await tx.commercialEvent.createMany({
        data: elapsed.map((delegation) => ({
          event_type: 'partner_delegation.expired',
          tenant_id: delegation.tenant_id,
          actor: 'system:partner-delegation-expiry',
          idempotency_key: `partner-delegation-expired-${delegation.id}`,
          payload: JSON.stringify({ delegationId: delegation.id }),
        })),
        skipDuplicates: true,
      });
    });

    const sessionBoundaries = new Map<string, (typeof elapsed)[number]>();
    for (const delegation of elapsed) {
      sessionBoundaries.set(
        `${delegation.partner_principal_id}:${delegation.tenant_id}`,
        delegation,
      );
    }
    await Promise.all(
      [...sessionBoundaries.values()].map((delegation) =>
        this.sessionService.revokeForPrincipalTenant(
          delegation.partner_principal_id,
          delegation.tenant_id,
          'PARTNER_DELEGATION_EXPIRED',
        ),
      ),
    );
    return elapsed.length;
  }

  private assertExpiry(expiresAt: Date) {
    const now = Date.now();
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    const maxExpiry = now + 366 * 24 * 60 * 60 * 1000;
    if (expiresAt.getTime() > maxExpiry) {
      throw new BadRequestException(
        'expiresAt cannot exceed 366 days; renew the explicit grant instead',
      );
    }
  }

  private requireEnvironment(environmentId: string | null) {
    if (!environmentId) {
      throw new BadRequestException(
        'An environment-bound session is required for partner delegation',
      );
    }
    return environmentId;
  }

  private view<T extends Record<string, any>>(delegation: T) {
    return { ...delegation, scope: this.parseScope(delegation.scope) };
  }

  private parseScope(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string');
    }
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
