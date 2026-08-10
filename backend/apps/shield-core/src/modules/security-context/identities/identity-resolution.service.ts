import { Injectable, Logger } from '@nestjs/common';
import { IdentityRepository } from './identity.repository';
import { ResolveIdentityInput, ResolvedIdentity } from './identity.types';

const RESOLVER_VERSION = '1.0';

/**
 * Tenant-scoped identity resolution (spec §8/§9). External vendor IDs are
 * never the canonical primary key — every resolution goes through
 * IdentityAlias first. Same email alone is never sufficient to merge two
 * aliases from different source systems; a fresh alias always creates its
 * own IdentityEntity unless an exact (tenant, sourceSystem, sourceAccountId,
 * externalType, externalId) alias already exists.
 */
@Injectable()
export class IdentityResolutionService {
  private readonly logger = new Logger(IdentityResolutionService.name);

  constructor(private readonly repo: IdentityRepository) {}

  async resolve(input: ResolveIdentityInput): Promise<ResolvedIdentity> {
    const observedAt = input.observedAt ?? new Date();

    const existingAlias = await this.repo.findAliasByKey(
      input.tenantId,
      input.sourceSystem,
      input.sourceAccountId,
      input.externalType,
      input.externalId,
    );

    if (existingAlias) {
      await this.repo.touchAlias(existingAlias.id, observedAt);
      await this.repo.touchIdentity(existingAlias.identity_entity_id, observedAt);
      await this.repo.recordDecision({
        tenantId: input.tenantId,
        entityType: 'IDENTITY',
        sourceSystem: input.sourceSystem,
        externalId: input.externalId,
        resolvedEntityId: existingAlias.identity_entity_id,
        decision: 'MATCHED',
        confidence: 1.0,
        reason: 'Exact trusted alias match on (tenant, sourceSystem, sourceAccountId, externalType, externalId)',
      });
      return { identityEntityId: existingAlias.identity_entity_id, decision: 'MATCHED' };
    }

    // No trusted alias found — create a brand-new canonical identity rather
    // than guessing a merge off email/displayName alone (spec §9: those are
    // never auto-merge signals without an explicit controlled policy, which
    // does not exist yet).
    const identity = await this.repo.createIdentity({
      tenantId: input.tenantId,
      email: input.email?.toLowerCase(),
      externalId: input.externalId,
      displayName: input.displayName || input.email || input.externalId,
      identityType: input.identityType || 'UNKNOWN',
    });

    await this.repo.createAlias({
      tenantId: input.tenantId,
      identityEntityId: identity.id,
      sourceSystem: input.sourceSystem,
      sourceAccountId: input.sourceAccountId,
      externalType: input.externalType,
      externalId: input.externalId,
      normalizedValue: input.email?.toLowerCase(),
      observedAt,
    });

    await this.repo.recordDecision({
      tenantId: input.tenantId,
      entityType: 'IDENTITY',
      sourceSystem: input.sourceSystem,
      externalId: input.externalId,
      resolvedEntityId: identity.id,
      decision: 'CREATED',
      confidence: 1.0,
      reason: 'No existing alias for this (tenant, sourceSystem, externalType, externalId) — created new canonical identity',
    });

    this.logger.log(`Created identity ${identity.id} for tenant ${input.tenantId} (resolver v${RESOLVER_VERSION})`);
    return { identityEntityId: identity.id, decision: 'CREATED' };
  }

  async markRemoved(tenantId: string, externalId: string): Promise<void> {
    const identity = await this.repo.findByExternalId(tenantId, externalId);
    if (!identity) {
      this.logger.debug(`markRemoved: no identity for external_id ${externalId} in tenant ${tenantId}`);
      return;
    }
    await this.repo.markRemoved(identity.id);
  }
}
