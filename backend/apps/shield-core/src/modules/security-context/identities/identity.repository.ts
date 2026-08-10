import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAliasByKey(tenantId: string, sourceSystem: string, sourceAccountId: string | undefined, externalType: string, externalId: string) {
    return this.prisma.identityAlias.findUnique({
      where: {
        tenant_id_source_system_source_account_id_external_type_external_id: {
          tenant_id: tenantId,
          source_system: sourceSystem,
          source_account_id: sourceAccountId ?? null,
          external_type: externalType,
          external_id: externalId,
        } as any,
      },
      include: { identityEntity: true },
    });
  }

  findIdentityByEmail(tenantId: string, email: string) {
    return this.prisma.identityEntity.findFirst({ where: { tenant_id: tenantId, email } });
  }

  createIdentity(data: {
    tenantId: string;
    email?: string;
    externalId?: string;
    displayName?: string;
    identityType: string;
  }) {
    return this.prisma.identityEntity.create({
      data: {
        tenant_id: data.tenantId,
        email: data.email,
        external_id: data.externalId,
        display_name: data.displayName,
        identity_type: data.identityType,
        status: 'ACTIVE',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      },
    });
  }

  touchIdentity(id: string, observedAt: Date) {
    return this.prisma.identityEntity.update({
      where: { id },
      data: { last_seen_at: observedAt, status: 'ACTIVE' },
    });
  }

  createAlias(data: {
    tenantId: string;
    identityEntityId: string;
    sourceSystem: string;
    sourceAccountId?: string;
    externalType: string;
    externalId: string;
    normalizedValue?: string;
    observedAt: Date;
  }) {
    return this.prisma.identityAlias.create({
      data: {
        tenant_id: data.tenantId,
        identity_entity_id: data.identityEntityId,
        source_system: data.sourceSystem,
        source_account_id: data.sourceAccountId,
        external_type: data.externalType,
        external_id: data.externalId,
        normalized_value: data.normalizedValue,
        first_seen_at: data.observedAt,
        last_seen_at: data.observedAt,
      },
    });
  }

  touchAlias(id: string, observedAt: Date) {
    return this.prisma.identityAlias.update({ where: { id }, data: { last_seen_at: observedAt } });
  }

  findByExternalId(tenantId: string, externalId: string) {
    return this.prisma.identityEntity.findFirst({ where: { tenant_id: tenantId, external_id: externalId } });
  }

  markRemoved(id: string) {
    return this.prisma.identityEntity.update({ where: { id }, data: { status: 'REMOVED' } });
  }

  recordDecision(data: {
    tenantId: string;
    entityType: string;
    sourceSystem: string;
    externalId: string;
    resolvedEntityId?: string;
    decision: string;
    confidence: number;
    reason: string;
  }) {
    return this.prisma.resolutionDecision.create({
      data: {
        tenant_id: data.tenantId,
        entity_type: data.entityType,
        source_system: data.sourceSystem,
        external_id: data.externalId,
        resolved_entity_id: data.resolvedEntityId,
        decision: data.decision,
        confidence: data.confidence,
        reason: data.reason,
      },
    });
  }
}
