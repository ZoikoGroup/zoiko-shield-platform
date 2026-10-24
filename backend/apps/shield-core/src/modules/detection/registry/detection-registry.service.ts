import { Injectable, Logger, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetectionRule } from '../runtime/detection-rule.interface';
import { SuspiciousLoginRule } from '../rules/suspicious-login/suspicious-login.rule';
import { SuspiciousProcessRule } from '../rules/suspicious-process/suspicious-process.rule';
import { CloudPrivilegeEscalationRule } from '../rules/cloud-privilege-escalation/cloud-privilege-escalation.rule';

type PublishedVersion = Prisma.DetectionVersionGetPayload<{
  include: { detectionDefinition: true };
}>;

/**
 * Loads active DetectionVersions and resolves the DetectionRule
 * implementation for each (spec §30). Rule selection is centralized here
 * so consumers never branch on detection key — new rule classes register
 * themselves in the constructor map.
 */
@Injectable()
export class DetectionRegistryService {
  private readonly logger = new Logger(DetectionRegistryService.name);
  private readonly ruleImplementations = new Map<string, DetectionRule>();
  /**
   * PUBLISHED versions with an implementation, loaded at most every
   * PUBLISHED_CACHE_TTL_MS instead of once per normalized event. Published
   * versions are immutable; publish() clears it here, and other replicas
   * pick a newly published version up within the TTL.
   */
  private published: {
    loadedAt: number;
    versions: Promise<
      Array<{ version: PublishedVersion; eventTypes: string[] }>
    >;
  } | null = null;
  private static readonly PUBLISHED_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    suspiciousLoginRule: SuspiciousLoginRule,
    suspiciousProcessRule: SuspiciousProcessRule,
    cloudPrivilegeEscalationRule: CloudPrivilegeEscalationRule,
  ) {
    this.registerRule(suspiciousLoginRule);
    this.registerRule(suspiciousProcessRule);
    this.registerRule(cloudPrivilegeEscalationRule);
  }

  registerRule(rule: DetectionRule): void {
    this.ruleImplementations.set(rule.key, rule);
  }

  getRuleImplementation(key: string): DetectionRule {
    const rule = this.ruleImplementations.get(key);
    if (!rule) {
      throw new Error(
        `No DetectionRule implementation registered for key '${key}'`,
      );
    }
    return rule;
  }

  /** Applicable = PUBLISHED versions whose definition key has a registered rule implementation and whose required_event_types includes the event's class. */
  async findApplicable(tenantId: string, eventClass: string) {
    const published = await this.loadPublished();
    return published
      .filter(
        ({ eventTypes }) =>
          eventTypes.length === 0 || eventTypes.includes(eventClass),
      )
      .map(({ version }) => version);
  }

  private loadPublished() {
    const cached = this.published;
    if (
      cached &&
      Date.now() - cached.loadedAt <
        DetectionRegistryService.PUBLISHED_CACHE_TTL_MS
    ) {
      return cached.versions;
    }
    // Cache the promise, so concurrent events share one query.
    const versions = this.prisma.detectionVersion
      .findMany({
        where: { status: 'PUBLISHED' },
        include: { detectionDefinition: true },
      })
      .then((rows) =>
        rows
          .filter((v) =>
            this.ruleImplementations.has(v.detectionDefinition.key),
          )
          .map((version) => ({
            version,
            eventTypes: JSON.parse(
              version.required_event_types || '[]',
            ) as string[],
          })),
      );
    const entry = { loadedAt: Date.now(), versions };
    this.published = entry;
    // A failed load is not cached: the next event retries.
    versions.catch(() => {
      if (this.published === entry) this.published = null;
    });
    return versions;
  }

  /** Publishes a DRAFT version — PUBLISHED versions are immutable from then on (spec §19), enforced here rather than left to callers. */
  async publish(detectionVersionId: string) {
    const version = await this.prisma.detectionVersion.findUniqueOrThrow({
      where: { id: detectionVersionId },
    });
    if (version.status === 'PUBLISHED') {
      throw new ConflictException(
        `DetectionVersion '${detectionVersionId}' is already PUBLISHED and cannot be republished`,
      );
    }

    const existingActive = await this.prisma.detectionVersion.findFirst({
      where: {
        detection_definition_id: version.detection_definition_id,
        status: 'PUBLISHED',
      },
    });
    if (existingActive) {
      throw new ConflictException(
        `DetectionDefinition '${version.detection_definition_id}' already has an active published version (${existingActive.id}) — retire it before publishing a new one`,
      );
    }

    const published = await this.prisma.detectionVersion.update({
      where: { id: detectionVersionId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
    this.published = null;
    return published;
  }
}
