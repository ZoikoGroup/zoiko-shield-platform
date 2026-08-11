import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { assertTransition } from '../commerce/state-machine.util';

/** ZS-COM-BILL-001 Part 5/6 coverage lifecycle. */
const COVERAGE_TRANSITIONS: Record<string, string[]> = {
  DISCOVERED: ['REVIEW_REQUIRED', 'EXCLUDED', 'IGNORED'],
  REVIEW_REQUIRED: ['COVERED', 'EXCLUDED', 'IGNORED'],
  COVERED: ['BILLABLE', 'STALE', 'EXCLUDED'],
  BILLABLE: ['STALE', 'EXCLUDED'],
  STALE: ['COVERED', 'REMOVED'],
  EXCLUDED: ['REVIEW_REQUIRED'],
  IGNORED: ['REVIEW_REQUIRED'],
  REMOVED: [],
};

export class RecordObservationDto {
  @IsString()
  tenantId!: string;

  @IsString()
  resourceType!: string;

  @IsString()
  sourceConnectorId!: string;

  @IsObject()
  identityAttributes!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  environmentId?: string;
}

@Injectable()
export class ResourceObservationService {
  private readonly logger = new Logger(ResourceObservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly definitionService: ProtectedResourceDefinitionService,
  ) {}

  /**
   * Deterministic canonical identity from the approved definition's
   * identity_key_spec — the same physical resource observed through
   * different connectors must resolve to the same canonical id.
   */
  private computeCanonicalResourceId(
    resourceType: string,
    identityKeySpec: string,
    attributes: Record<string, unknown>,
  ): string {
    const spec = JSON.parse(identityKeySpec) as { keys: string[] };
    const keys = spec.keys && spec.keys.length > 0 ? spec.keys : Object.keys(attributes).sort();
    const parts = keys.map((k) => `${k}=${String(attributes[k] ?? '')}`);
    return crypto.createHash('sha256').update(`${resourceType}|${parts.join('|')}`).digest('hex');
  }

  /**
   * Principle 3: discovered != billable. New canonical resources always
   * start DISCOVERED / NON_BILLABLE. A resource re-observed through a
   * second connector is a dedup — it updates last_seen_at on the existing
   * row rather than creating a second billable unit.
   */
  async recordObservation(dto: RecordObservationDto) {
    const definition = await this.definitionService.getActiveDefinition(dto.resourceType);
    if (!definition) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_RESOURCE_DEFINITION',
        message: `No approved resource definition for type '${dto.resourceType}'; observation cannot be identified or deduplicated`,
      });
    }

    const canonicalResourceId = this.computeCanonicalResourceId(
      dto.resourceType,
      definition.identity_key_spec,
      dto.identityAttributes,
    );

    const existing = await this.prisma.resourceObservation.findUnique({
      where: {
        tenant_id_canonical_resource_id_resource_type: {
          tenant_id: dto.tenantId,
          canonical_resource_id: canonicalResourceId,
          resource_type: dto.resourceType,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.resourceObservation.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date() },
      });
      return { observation: updated, deduped: true };
    }

    const created = await this.prisma.resourceObservation.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId || 'default-env',
        canonical_resource_id: canonicalResourceId,
        resource_type: dto.resourceType,
        source_connector_id: dto.sourceConnectorId,
        coverage_state: 'DISCOVERED',
        billable_state: 'NON_BILLABLE',
      },
    });
    return { observation: created, deduped: false };
  }

  async getObservationById(id: string) {
    const observation = await this.prisma.resourceObservation.findUnique({ where: { id } });
    if (!observation) {
      throw new NotFoundException(`Resource observation '${id}' not found`);
    }
    return observation;
  }

  async listByTenant(tenantId: string) {
    return this.prisma.resourceObservation.findMany({
      where: { tenant_id: tenantId },
      orderBy: { last_seen_at: 'desc' },
    });
  }

  /**
   * Guarded coverage transition. billable_state is derived, never set
   * independently: it can only be BILLABLE while coverage_state is
   * BILLABLE, otherwise it is forced back to NON_BILLABLE.
   */
  async updateCoverageState(observationId: string, targetState: string, exclusionReason?: string) {
    const observation = await this.getObservationById(observationId);
    assertTransition(COVERAGE_TRANSITIONS, observation.coverage_state, targetState, 'protected resource coverage');

    return this.prisma.resourceObservation.update({
      where: { id: observationId },
      data: {
        coverage_state: targetState,
        billable_state: targetState === 'BILLABLE' ? 'BILLABLE' : 'NON_BILLABLE',
        exclusion_reason: targetState === 'EXCLUDED' ? exclusionReason : null,
      },
    });
  }
}
