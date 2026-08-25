import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { requireEnvironmentId } from '../../tenant-context';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { ResourceCoverageService } from './resource-coverage.service';
import type { ResourceObservation } from '@prisma/client';

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

  @IsOptional()
  @IsISO8601()
  observedFrom?: Date;

  @IsOptional()
  @IsISO8601()
  observedTo?: Date;
}

type IdentitySpec = {
  keys: string[];
  physicalKeys?: string[];
  physicalNamespace?: string;
};

/**
 * Category C observation intake. It stores source windows and produces a
 * canonical ID per metric family without ever accepting billing authority.
 */
@Injectable()
export class ResourceObservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly definitionService: ProtectedResourceDefinitionService,
    private readonly coverageService: ResourceCoverageService,
  ) {}

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private normalizedIdentityBasis(
    keys: string[],
    attributes: Record<string, unknown>,
  ) {
    return keys.map((key) => {
      const value = attributes[key];
      if (
        value === undefined ||
        value === null ||
        !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'string' && !value.trim())
      ) {
        throw new BadRequestException(
          `Approved identity attribute '${key}' must be supplied as a non-empty scalar`,
        );
      }
      const normalized =
        typeof value === 'string' ? value.trim().toLowerCase() : String(value);
      return `${key}=${normalized}`;
    });
  }

  private identity(definition: {
    metric_family: string;
    identity_key_spec: string;
  }, attributes: Record<string, unknown>) {
    let spec: IdentitySpec;
    try {
      spec = JSON.parse(definition.identity_key_spec) as IdentitySpec;
    } catch {
      throw new ConflictException(
        'Approved resource definition has an invalid identity key specification',
      );
    }
    if (!Array.isArray(spec.keys) || spec.keys.length === 0) {
      throw new ConflictException(
        'Approved resource definition has no identity keys',
      );
    }
    const physicalKeys =
      Array.isArray(spec.physicalKeys) && spec.physicalKeys.length > 0
        ? spec.physicalKeys
        : spec.keys;
    const identityBasis = this.normalizedIdentityBasis(spec.keys, attributes);
    const physicalBasis = this.normalizedIdentityBasis(
      physicalKeys,
      attributes,
    );
    // Hash physical values under a controlled namespace, rather than source
    // attribute names. Two approved definitions can therefore disclose that
    // deviceId and assetId identify the same physical object.
    const physicalValues = physicalBasis.map((part) =>
      part.slice(part.indexOf('=') + 1),
    );
    const physicalResourceId = this.hash(
      `${spec.physicalNamespace ?? 'UNSCOPED'}|${physicalValues.join('|')}`,
    );
    return {
      identityBasisHash: this.hash(identityBasis.join('|')),
      physicalResourceId,
      canonicalResourceId: this.hash(
        `${definition.metric_family}|${physicalResourceId}`,
      ),
    };
  }

  private observationWindow(dto: RecordObservationDto) {
    const now = new Date();
    const observedFrom = dto.observedFrom
      ? new Date(dto.observedFrom)
      : dto.observedTo
        ? new Date(dto.observedTo)
        : now;
    const observedTo = dto.observedTo
      ? new Date(dto.observedTo)
      : dto.observedFrom
        ? new Date(dto.observedFrom)
        : now;
    if (
      Number.isNaN(observedFrom.getTime()) ||
      Number.isNaN(observedTo.getTime()) ||
      observedTo < observedFrom
    ) {
      throw new BadRequestException(
        'observedTo must be at or after a valid observedFrom',
      );
    }
    return { observedFrom, observedTo };
  }

  private sources(existing: string, next: string) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      const current = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
      return JSON.stringify([...new Set([...current, next])]);
    } catch {
      return JSON.stringify([next]);
    }
  }

  private async appendObservationWindow(
    existing: ResourceObservation,
    sourceConnectorId: string,
    observedFrom: Date,
    observedTo: Date,
    rawBasisHash: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.resourceObservationWindow.create({
        data: {
          observation_id: existing.id,
          source_connector_id: sourceConnectorId,
          observed_at: new Date(),
          observed_from: observedFrom,
          observed_to: observedTo,
          raw_basis_hash: rawBasisHash,
        },
      });
      return tx.resourceObservation.update({
        where: { id: existing.id },
        data: {
          first_seen_at:
            existing.first_seen_at < observedFrom
              ? existing.first_seen_at
              : observedFrom,
          last_seen_at:
            existing.last_seen_at > observedTo
              ? existing.last_seen_at
              : observedTo,
          source_connectors: this.sources(
            existing.source_connectors,
            sourceConnectorId,
          ),
        },
      });
    });
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  /**
   * First sight creates DISCOVERED/NON_BILLABLE, records its raw source
   * window, then routes it to REVIEW_REQUIRED. A second source only appends a
   * window and alias; it cannot create another unit in the metric family.
   */
  async recordObservation(dto: RecordObservationDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);
    const definition = await this.definitionService.getActiveDefinition(
      dto.resourceType,
    );
    if (!definition) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_RESOURCE_DEFINITION',
        message: `No complete approved resource definition for type '${dto.resourceType}'; observation cannot be classified or deduplicated`,
      });
    }
    const identity = this.identity(definition, dto.identityAttributes);
    const window = this.observationWindow(dto);
    const rawBasisHash = this.hash(
      JSON.stringify({
        tenantId: dto.tenantId,
        environmentId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        sourceConnectorId: dto.sourceConnectorId,
        identityBasisHash: identity.identityBasisHash,
        observedFrom: window.observedFrom.toISOString(),
        observedTo: window.observedTo.toISOString(),
      }),
    );

    const existing = await this.prisma.resourceObservation.findUnique({
      where: {
        tenant_id_metric_family_canonical_resource_id: {
          tenant_id: dto.tenantId,
          metric_family: definition.metric_family,
          canonical_resource_id: identity.canonicalResourceId,
        },
      },
    });
    if (existing) {
      const result = await this.appendObservationWindow(
        existing,
        dto.sourceConnectorId,
        window.observedFrom,
        window.observedTo,
        rawBasisHash,
      );
      return { observation: result, deduped: true, notice: null };
    }

    let created: ResourceObservation;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const observation = await tx.resourceObservation.create({
          data: {
            tenant_id: dto.tenantId,
            environment_id: environmentId,
            resource_definition_id: definition.id,
            canonical_resource_id: identity.canonicalResourceId,
            physical_resource_id: identity.physicalResourceId,
            identity_basis_hash: identity.identityBasisHash,
            resource_type: dto.resourceType,
            resource_family: definition.resource_family,
            metric_family: definition.metric_family,
            source_connector_id: dto.sourceConnectorId,
            source_connectors: JSON.stringify([dto.sourceConnectorId]),
            first_seen_at: window.observedFrom,
            last_seen_at: window.observedTo,
            coverage_state: 'DISCOVERED',
            billable_state: 'NON_BILLABLE',
            auto_enrollment_status: 'NOT_EVALUATED',
          },
        });
        await tx.resourceObservationWindow.create({
          data: {
            observation_id: observation.id,
            source_connector_id: dto.sourceConnectorId,
            observed_at: new Date(),
            observed_from: window.observedFrom,
            observed_to: window.observedTo,
            raw_basis_hash: rawBasisHash,
          },
        });
        await tx.resourceCoverageDecision.create({
          data: {
            tenant_id: dto.tenantId,
            observation_id: observation.id,
            from_state: 'NONE',
            to_state: 'DISCOVERED',
            decision_type: 'DISCOVERY',
            reason: `Observed through approved source '${dto.sourceConnectorId}'`,
            actor_id: `connector:${dto.sourceConnectorId}`,
          },
        });
        return observation;
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      // Another connector won the canonical insert race. Resolve to that row
      // and retain this source window instead of leaking a duplicate/error.
      const winner = await this.prisma.resourceObservation.findUnique({
        where: {
          tenant_id_metric_family_canonical_resource_id: {
            tenant_id: dto.tenantId,
            metric_family: definition.metric_family,
            canonical_resource_id: identity.canonicalResourceId,
          },
        },
      });
      if (!winner) throw error;
      const result = await this.appendObservationWindow(
        winner,
        dto.sourceConnectorId,
        window.observedFrom,
        window.observedTo,
        rawBasisHash,
      );
      return { observation: result, deduped: true, notice: null };
    }
    const routed = await this.coverageService.routeDiscoveredObservation(
      created,
    );
    return { ...routed, deduped: false };
  }

  async getObservationById(
    tenantId: string,
    environmentId: string,
    id: string,
  ) {
    const observation = await this.prisma.resourceObservation.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: {
        resourceDefinition: true,
        coveragePolicy: true,
        windows: { orderBy: { observed_at: 'desc' }, take: 100 },
      },
    });
    if (!observation) {
      throw new NotFoundException(`Resource observation '${id}' not found`);
    }
    return observation;
  }

  async listByTenant(tenantId: string, environmentId: string) {
    return this.prisma.resourceObservation.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      include: { resourceDefinition: true, coveragePolicy: true },
      orderBy: { last_seen_at: 'desc' },
    });
  }
}
