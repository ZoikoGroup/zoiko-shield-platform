import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsArray, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Closed allowlist — pricing/entitlement/commercial-authority scopes can
 * never be added here. "Partner discounts must not directly change
 * runtime entitlement" is enforced structurally: there is no scope that
 * grants it, not a runtime check that might be bypassed.
 */
export const ALLOWED_DELEGATION_SCOPES = [
  'VIEW_USAGE',
  'VIEW_INVOICES',
  'VIEW_TICKETS',
  'MANAGE_SUPPORT_CASES',
  'VIEW_ENTITLEMENTS',
] as const;

export class GrantDelegationDto {
  @IsString()
  partnerId!: string;

  @IsString()
  commercialAccountId!: string;

  @IsArray()
  scope!: string[];

  @IsString()
  grantedBy!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: Date;
}

@Injectable()
export class PartnerDelegationService {
  private readonly logger = new Logger(PartnerDelegationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async grantDelegation(dto: GrantDelegationDto) {
    const invalidScopes = dto.scope.filter(
      (s) => !ALLOWED_DELEGATION_SCOPES.includes(s as any),
    );
    if (invalidScopes.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'SCOPE_NOT_DELEGABLE',
        message: `Scope(s) [${invalidScopes.join(', ')}] cannot be delegated — operational access never implies commercial/pricing authority`,
      });
    }

    return this.prisma.partnerDelegation.create({
      data: {
        partner_id: dto.partnerId,
        commercial_account_id: dto.commercialAccountId,
        scope: JSON.stringify(dto.scope),
        granted_by: dto.grantedBy,
        expires_at: dto.expiresAt,
        status: 'ACTIVE',
      },
    });
  }

  async getDelegationById(id: string) {
    const delegation = await this.prisma.partnerDelegation.findUnique({
      where: { id },
    });
    if (!delegation) {
      throw new NotFoundException(`Partner delegation '${id}' not found`);
    }
    return delegation;
  }

  async revoke(id: string) {
    const delegation = await this.getDelegationById(id);
    if (delegation.status !== 'ACTIVE') {
      throw new ConflictException(
        `Delegation '${id}' is '${delegation.status}', not ACTIVE`,
      );
    }
    return this.prisma.partnerDelegation.update({
      where: { id },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });
  }

  /**
   * Fail-closed, tenant-scoped, dynamically-expiring check. Never returns
   * true for a delegation belonging to a different commercial account
   * (non-transitive) or one whose expires_at has passed, even before a
   * sweeper runs.
   */
  async checkDelegation(
    partnerId: string,
    commercialAccountId: string,
    requiredScope: string,
  ): Promise<boolean> {
    const delegation = await this.prisma.partnerDelegation.findFirst({
      where: {
        partner_id: partnerId,
        commercial_account_id: commercialAccountId,
        status: 'ACTIVE',
      },
      orderBy: { created_at: 'desc' },
    });

    if (!delegation) {
      return false;
    }

    if (delegation.expires_at && delegation.expires_at < new Date()) {
      await this.prisma.partnerDelegation.update({
        where: { id: delegation.id },
        data: { status: 'EXPIRED' },
      });
      return false;
    }

    const scope: string[] = JSON.parse(delegation.scope);
    return scope.includes(requiredScope);
  }
}
