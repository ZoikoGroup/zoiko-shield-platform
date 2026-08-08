import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateSuppressionRuleInput {
  tenantId: string;
  detectionDefinitionId?: string;
  identityId?: string;
  assetId?: string;
  condition?: Record<string, any>;
  reason: string;
  startsAt?: Date;
  expiresAt?: Date;
  approvedBy: string;
}

/**
 * Explicit, time-bound, owned suppression (spec §6) — a detection is never
 * silently dropped; a suppressed result is recorded by the caller
 * (AlertCreationService) rather than this service quietly returning
 * nothing.
 */
@Injectable()
export class AlertSuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSuppressionRuleInput) {
    return this.prisma.alertSuppressionRule.create({
      data: {
        tenant_id: input.tenantId,
        detection_definition_id: input.detectionDefinitionId,
        identity_id: input.identityId,
        asset_id: input.assetId,
        condition: JSON.stringify(input.condition ?? {}),
        reason: input.reason,
        starts_at: input.startsAt ?? new Date(),
        expires_at: input.expiresAt,
        approved_by: input.approvedBy,
        status: 'ACTIVE',
      },
    });
  }

  /** Returns the first currently-active, in-window suppression rule matching the given scope, or null. */
  async findActiveMatch(params: {
    tenantId: string;
    detectionDefinitionId: string;
    identityId?: string;
    assetId?: string;
  }): Promise<{ id: string; reason: string } | null> {
    const now = new Date();

    const rules = await this.prisma.alertSuppressionRule.findMany({
      where: {
        tenant_id: params.tenantId,
        status: 'ACTIVE',
        starts_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
    });

    const match = rules.find((rule) => {
      const matchesDefinition = !rule.detection_definition_id || rule.detection_definition_id === params.detectionDefinitionId;
      const matchesIdentity = !rule.identity_id || rule.identity_id === params.identityId;
      const matchesAsset = !rule.asset_id || rule.asset_id === params.assetId;
      return matchesDefinition && matchesIdentity && matchesAsset;
    });

    return match ? { id: match.id, reason: match.reason } : null;
  }
}
