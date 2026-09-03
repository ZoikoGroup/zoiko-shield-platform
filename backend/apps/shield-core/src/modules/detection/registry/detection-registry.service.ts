import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetectionRule } from '../runtime/detection-rule.interface';
import { SuspiciousLoginRule } from '../rules/suspicious-login/suspicious-login.rule';
import { SuspiciousProcessRule } from '../rules/suspicious-process/suspicious-process.rule';
import { CloudPrivilegeEscalationRule } from '../rules/cloud-privilege-escalation/cloud-privilege-escalation.rule';

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
    const versions = await this.prisma.detectionVersion.findMany({
      where: { status: 'PUBLISHED' },
      include: { detectionDefinition: true },
    });

    return versions.filter((v) => {
      if (!this.ruleImplementations.has(v.detectionDefinition.key))
        return false;
      const requiredEventTypes: string[] = JSON.parse(
        v.required_event_types || '[]',
      );
      return (
        requiredEventTypes.length === 0 ||
        requiredEventTypes.includes(eventClass)
      );
    });
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

    return this.prisma.detectionVersion.update({
      where: { id: detectionVersionId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
  }
}
