import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export type RetentionBasis = 'CONTRACTUAL' | 'STATUTORY' | 'PLATFORM_DEFAULT';

export interface ResolvedRetention {
  policyId: string | null;
  basis: RetentionBasis;
  authority: string;
  periodDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Retention eligibility is a hard gate that is NOT the same thing as approval
 * (ZS-ENG-OFF-DEL-001 §3.1). Approval authorizes the destruction; this decides
 * when it may actually happen.
 *
 * That standard deliberately does not set the schedule — jurisdictional and
 * contractual rules do — so this resolves an authoritative recorded policy and
 * fails closed when there is none, rather than inventing a duration. A
 * configured platform default is accepted as a basis of last resort, but it
 * has to be configured deliberately; an absent policy never silently means
 * "delete immediately".
 */
@Injectable()
export class RetentionPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string): Promise<ResolvedRetention> {
    const now = new Date();
    const policy = await this.prisma.tenantRetentionPolicy.findFirst({
      where: {
        tenant_id: tenantId,
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gt: now } }],
      },
      orderBy: { effective_from: 'desc' },
    });
    if (policy) {
      return {
        policyId: policy.id,
        basis: policy.basis as RetentionBasis,
        authority: policy.authority,
        periodDays: policy.period_days,
      };
    }

    const configured = process.env.TENANT_RETENTION_DEFAULT_DAYS;
    const days = Number(configured);
    if (
      configured === undefined ||
      configured === '' ||
      !Number.isInteger(days) ||
      days < 0
    ) {
      throw new ConflictException(
        `Tenant '${tenantId}' has no authoritative retention policy and no platform default is configured — deletion eligibility cannot be established, so deletion must not proceed`,
      );
    }
    return {
      policyId: null,
      basis: 'PLATFORM_DEFAULT',
      authority:
        process.env.TENANT_RETENTION_DEFAULT_AUTHORITY ??
        'Platform default configured via TENANT_RETENTION_DEFAULT_DAYS',
      periodDays: days,
    };
  }

  /** The retention clock runs from access removal, not from approval. */
  expiryFrom(clockStartedAt: Date, periodDays: number): Date {
    return new Date(clockStartedAt.getTime() + periodDays * MS_PER_DAY);
  }

  async record(input: {
    tenantId: string;
    basis: RetentionBasis;
    authority: string;
    periodDays: number;
    createdBy: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
  }) {
    if (!Number.isInteger(input.periodDays) || input.periodDays < 0) {
      throw new ConflictException(
        'A retention period must be a whole number of days',
      );
    }
    return this.prisma.tenantRetentionPolicy.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        basis: input.basis,
        authority: input.authority,
        period_days: input.periodDays,
        effective_from: input.effectiveFrom ?? new Date(),
        effective_to: input.effectiveTo,
        created_by: input.createdBy,
      },
    });
  }

  async listForTenant(tenantId: string) {
    return this.prisma.tenantRetentionPolicy.findMany({
      where: { tenant_id: tenantId },
      orderBy: { effective_from: 'desc' },
    });
  }
}
