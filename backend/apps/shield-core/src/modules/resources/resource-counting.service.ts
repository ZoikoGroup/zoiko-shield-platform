import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { IsArray, IsISO8601 } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateResourceCountPreviewDto {
  @IsArray()
  policyIds!: string[];

  @IsISO8601()
  windowStart!: Date;

  @IsISO8601()
  windowEnd!: Date;
}

type Interval = { start: number; end: number };

/** Category C2/C3 bundle validator and retained resource-count preview. */
@Injectable()
export class ResourceCountingService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private parseStringArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private mergeIntervals(intervals: Interval[]): Interval[] {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Interval[] = [];
    for (const interval of sorted) {
      const previous = merged.at(-1);
      if (!previous || interval.start > previous.end) {
        merged.push({ ...interval });
      } else {
        previous.end = Math.max(previous.end, interval.end);
      }
    }
    return merged;
  }

  private durationSeconds(intervals: Interval[]) {
    return (
      this.mergeIntervals(intervals).reduce(
        (sum, interval) => sum + Math.max(0, interval.end - interval.start),
        0,
      ) / 1000
    );
  }

  private highWater(intervals: Interval[]) {
    const events = intervals.flatMap((interval) => [
      { at: interval.start, delta: 1 },
      { at: interval.end, delta: -1 },
    ]);
    // Starts sort before ends at the same instant, so point-in-time source
    // observations still contribute to high-water without inflating duration.
    events.sort((a, b) => a.at - b.at || b.delta - a.delta);
    let active = 0;
    let maximum = 0;
    for (const event of events) {
      active += event.delta;
      maximum = Math.max(maximum, active);
    }
    return maximum;
  }

  private reconciliationInput(preview: {
    tenantId: string;
    environmentId: string;
    policyIds: string;
    meterVersions: string;
    windowStart: Date;
    windowEnd: Date;
    metricResults: string;
    overlaps: string;
    exclusions: string;
    rawBasis: string;
    validationStatus: string;
  }) {
    return [
      preview.tenantId,
      preview.environmentId,
      preview.policyIds,
      preview.meterVersions,
      preview.windowStart.toISOString(),
      preview.windowEnd.toISOString(),
      preview.metricResults,
      preview.overlaps,
      preview.exclusions,
      preview.rawBasis,
      preview.validationStatus,
    ].join('|');
  }

  async createPreview(
    tenantId: string,
    environmentId: string,
    generatedBy: string,
    dto: CreateResourceCountPreviewDto,
  ) {
    const policyIds = [
      ...new Set(
        (dto.policyIds ?? []).filter(
          (id) => typeof id === 'string' && id.trim(),
        ),
      ),
    ];
    if (policyIds.length === 0) {
      throw new BadRequestException(
        'policyIds must contain at least one coverage policy',
      );
    }
    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);
    if (
      Number.isNaN(windowStart.getTime()) ||
      Number.isNaN(windowEnd.getTime()) ||
      windowEnd <= windowStart
    ) {
      throw new BadRequestException('windowEnd must be after windowStart');
    }

    const policies = await this.prisma.resourceCoveragePolicy.findMany({
      where: {
        id: { in: policyIds },
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: { resourceDefinition: true, meterDefinition: true },
    });
    if (policies.length !== policyIds.length) {
      throw new NotFoundException(
        'One or more resource coverage policies were not found in this tenant/environment',
      );
    }
    for (const policy of policies) {
      if (
        policy.status !== 'APPROVED' ||
        policy.resourceDefinition.status !== 'APPROVED' ||
        policy.meterDefinition.status !== 'APPROVED' ||
        policy.effective_from > windowStart ||
        (policy.effective_to && policy.effective_to < windowEnd) ||
        policy.meterDefinition.effective_from > windowStart ||
        (policy.meterDefinition.effective_to &&
          policy.meterDefinition.effective_to < windowEnd)
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'PREVIEW_POLICY_WINDOW_NOT_GOVERNED',
          message: `Policy '${policy.id}' and its definitions must be approved and effective for the complete preview window`,
        });
      }
    }

    const metricFamilies = [...new Set(policies.map((p) => p.metric_family))];
    const observations = await this.prisma.resourceObservation.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        metric_family: { in: metricFamilies },
        first_seen_at: { lte: windowEnd },
        last_seen_at: { gte: windowStart },
      },
      include: {
        windows: {
          where: {
            observed_from: { lte: windowEnd },
            observed_to: { gte: windowStart },
          },
          orderBy: { observed_from: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    const exclusions: Array<Record<string, unknown>> = [];
    const rawResources: Array<Record<string, unknown>> = [];
    const metricResults = policies
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((policy) => {
        const resources = observations.filter(
          (observation) =>
            observation.resource_definition_id ===
              policy.resource_definition_id &&
            observation.metric_family === policy.metric_family,
        );
        const billableIntervals: Interval[] = [];
        let observedQuantity = 0;
        let coveredQuantity = 0;
        let billableResourceQuantity = 0;

        for (const resource of resources) {
          const intervals = resource.windows.map((window) => ({
            start: Math.max(windowStart.getTime(), window.observed_from.getTime()),
            end: Math.min(windowEnd.getTime(), window.observed_to.getTime()),
          }));
          const duration = this.durationSeconds(intervals);
          const meetsMinimum = duration >= policy.minimum_duration_seconds;
          observedQuantity += 1;
          const covered = ['COVERED', 'BILLABLE'].includes(
            resource.coverage_state,
          );
          const billable =
            resource.coverage_policy_id === policy.id &&
            resource.coverage_state === 'BILLABLE' &&
            resource.billable_state === 'BILLABLE' &&
            meetsMinimum;
          if (covered && meetsMinimum) coveredQuantity += 1;
          if (billable) {
            billableResourceQuantity += 1;
            // Multiple connectors may report overlapping windows for the same
            // canonical resource; merge them before the metric sweep so source
            // aliases cannot inflate high-water or average quantity.
            billableIntervals.push(...this.mergeIntervals(intervals));
          }
          const exclusionReason = !meetsMinimum
            ? 'MINIMUM_DURATION_NOT_MET'
            : resource.coverage_state === 'EXCLUDED'
              ? resource.exclusion_reason || 'EXCLUDED_BY_SCOPE_DECISION'
              : !billable
                ? 'NOT_BILLABLE_UNDER_POLICY'
                : null;
          if (exclusionReason) {
            exclusions.push({
              policyId: policy.id,
              observationId: resource.id,
              canonicalResourceId: resource.canonical_resource_id,
              reason: exclusionReason,
            });
          }
          rawResources.push({
            policyId: policy.id,
            observationId: resource.id,
            physicalResourceId: resource.physical_resource_id,
            canonicalResourceId: resource.canonical_resource_id,
            resourceDefinitionId: resource.resource_definition_id,
            resourceDefinitionVersion: policy.resourceDefinition.version,
            metricFamily: resource.metric_family,
            coverageState: resource.coverage_state,
            billableState: resource.billable_state,
            durationSeconds: duration,
            minimumDurationSeconds: policy.minimum_duration_seconds,
            included: billable,
            windows: resource.windows.map((window) => ({
              id: window.id,
              sourceConnectorId: window.source_connector_id,
              observedFrom: window.observed_from.toISOString(),
              observedTo: window.observed_to.toISOString(),
              rawBasisHash: window.raw_basis_hash,
            })),
          });
        }

        const windowSeconds =
          (windowEnd.getTime() - windowStart.getTime()) / 1000;
        const average =
          windowSeconds > 0
            ? Number(
                (
                  billableIntervals.reduce(
                    (sum, interval) =>
                      sum + Math.max(0, interval.end - interval.start) / 1000,
                    0,
                  ) / windowSeconds
                ).toFixed(4),
              )
            : 0;
        const highWater = this.highWater(billableIntervals);
        const aggregatedQuantity =
          policy.coverage_outcome !== 'BILLABLE'
            ? 0
            : policy.aggregation_method === 'AVERAGE'
              ? average
              : policy.aggregation_method === 'COMMITTED'
                ? policy.committed_quantity ?? 0
                : highWater;
        return {
          policyId: policy.id,
          policyKey: policy.policy_key,
          policyVersion: policy.version,
          resourceDefinitionId: policy.resource_definition_id,
          resourceDefinitionVersion: policy.resourceDefinition.version,
          meterDefinitionId: policy.meter_definition_id,
          meterKey: policy.meterDefinition.meter_key,
          meterVersion: policy.meterDefinition.version,
          resourceFamily: policy.resource_family,
          metricFamily: policy.metric_family,
          aggregationMethod: policy.aggregation_method,
          observationWindow: policy.observation_window,
          minimumDurationSeconds: policy.minimum_duration_seconds,
          observedQuantity,
          coveredQuantity,
          billableResourceQuantity,
          highWaterQuantity: highWater,
          averageQuantity: average,
          committedQuantity: policy.committed_quantity,
          billingPreviewQuantity: aggregatedQuantity,
          unit: policy.meterDefinition.unit,
        };
      });

    // Validate selected metrics against every concurrently billable metric for
    // the same physical resource, so omitting a policy cannot hide overlap.
    const overlapCandidates =
      await this.prisma.resourceObservation.findMany({
        where: {
          tenant_id: tenantId,
          environment_id: environmentId,
          coverage_state: 'BILLABLE',
          billable_state: 'BILLABLE',
          first_seen_at: { lte: windowEnd },
          last_seen_at: { gte: windowStart },
        },
        include: { coveragePolicy: true },
        orderBy: { id: 'asc' },
      });
    const selectedPhysicalIds = new Set(
      rawResources
        .filter((resource) => resource.included === true)
        .map((resource) => String(resource.physicalResourceId)),
    );
    const byPhysical = new Map<string, typeof overlapCandidates>();
    for (const candidate of overlapCandidates) {
      if (!selectedPhysicalIds.has(candidate.physical_resource_id)) continue;
      const current = byPhysical.get(candidate.physical_resource_id) ?? [];
      current.push(candidate);
      byPhysical.set(candidate.physical_resource_id, current);
    }
    const overlaps: Array<Record<string, unknown>> = [];
    let blockedOverlap = false;
    for (const [physicalResourceId, candidates] of byPhysical) {
      const metrics = [...new Set(candidates.map((c) => c.metric_family))];
      if (metrics.length < 2) continue;
      for (let left = 0; left < candidates.length; left += 1) {
        for (let right = left + 1; right < candidates.length; right += 1) {
          const a = candidates[left];
          const b = candidates[right];
          if (a.metric_family === b.metric_family) continue;
          const aDisclosed = a.coveragePolicy
            ? this.parseStringArray(
                a.coveragePolicy.disclosed_metric_families,
              )
            : [];
          const bDisclosed = b.coveragePolicy
            ? this.parseStringArray(
                b.coveragePolicy.disclosed_metric_families,
              )
            : [];
          const allowed = Boolean(
            a.coveragePolicy?.disclosure_reference &&
              b.coveragePolicy?.disclosure_reference &&
              aDisclosed.includes(b.metric_family) &&
              bDisclosed.includes(a.metric_family),
          );
          blockedOverlap ||= !allowed;
          overlaps.push({
            physicalResourceId,
            metricFamilies: [a.metric_family, b.metric_family].sort(),
            observationIds: [a.id, b.id].sort(),
            policyIds: [a.coverage_policy_id, b.coverage_policy_id],
            disclosed: allowed,
            disclosureReferences: [
              a.coveragePolicy?.disclosure_reference,
              b.coveragePolicy?.disclosure_reference,
            ].filter(Boolean),
          });
        }
      }
    }

    const policyIdsJson = JSON.stringify(policyIds.sort());
    const meterVersionsJson = JSON.stringify(
      policies
        .map((policy) => ({
          meterDefinitionId: policy.meter_definition_id,
          meterKey: policy.meterDefinition.meter_key,
          version: policy.meterDefinition.version,
        }))
        .sort((a, b) => a.meterDefinitionId.localeCompare(b.meterDefinitionId)),
    );
    const metricResultsJson = JSON.stringify(metricResults);
    const overlapsJson = JSON.stringify(overlaps);
    const exclusionsJson = JSON.stringify(exclusions);
    const rawBasisJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      resources: rawResources,
    });
    const validationStatus = blockedOverlap
      ? 'BLOCKED_UNDISCLOSED_OVERLAP'
      : 'PASS';
    const reconciliation = {
      tenantId,
      environmentId,
      policyIds: policyIdsJson,
      meterVersions: meterVersionsJson,
      windowStart,
      windowEnd,
      metricResults: metricResultsJson,
      overlaps: overlapsJson,
      exclusions: exclusionsJson,
      rawBasis: rawBasisJson,
      validationStatus,
    };
    const reconciliationHash = this.hash(
      this.reconciliationInput(reconciliation),
    );

    return this.prisma.resourceCountPreview.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        policy_ids: policyIdsJson,
        meter_versions: meterVersionsJson,
        window_start: windowStart,
        window_end: windowEnd,
        metric_results: metricResultsJson,
        overlaps: overlapsJson,
        exclusions: exclusionsJson,
        raw_basis: rawBasisJson,
        validation_status: validationStatus,
        status: 'PREVIEW',
        reconciliation_hash: reconciliationHash,
        generated_by: generatedBy,
      },
    });
  }

  async listPreviews(tenantId: string, environmentId: string) {
    return this.prisma.resourceCountPreview.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { previewed_at: 'desc' },
    });
  }

  async getPreview(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const preview = await this.prisma.resourceCountPreview.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!preview) {
      throw new NotFoundException(`Resource count preview '${id}' not found`);
    }
    return preview;
  }

  async finalizePreview(
    id: string,
    tenantId: string,
    environmentId: string,
    finalizedBy: string,
  ) {
    const preview = await this.getPreview(id, tenantId, environmentId);
    if (preview.status !== 'PREVIEW') {
      throw new ConflictException(
        `Resource count preview '${id}' is already ${preview.status}`,
      );
    }
    if (preview.validation_status !== 'PASS') {
      throw new ConflictException({
        statusCode: 409,
        error: 'RESOURCE_COUNT_PREVIEW_BLOCKED',
        message:
          'A preview with undisclosed metric overlap cannot become a billing basis',
      });
    }
    const expected = this.hash(
      this.reconciliationInput({
        tenantId: preview.tenant_id,
        environmentId: preview.environment_id,
        policyIds: preview.policy_ids,
        meterVersions: preview.meter_versions,
        windowStart: preview.window_start,
        windowEnd: preview.window_end,
        metricResults: preview.metric_results,
        overlaps: preview.overlaps,
        exclusions: preview.exclusions,
        rawBasis: preview.raw_basis,
        validationStatus: preview.validation_status,
      }),
    );
    if (expected !== preview.reconciliation_hash) {
      throw new ConflictException({
        statusCode: 409,
        error: 'RESOURCE_COUNT_PREVIEW_INTEGRITY_FAILURE',
        message: 'The retained preview basis no longer matches its checksum',
      });
    }
    return this.prisma.resourceCountPreview.update({
      where: { id },
      data: {
        status: 'FINALIZED',
        finalized_by: finalizedBy,
        finalized_at: new Date(),
      },
    });
  }
}
