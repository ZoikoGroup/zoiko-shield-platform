import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  SUSPICIOUS_LOGIN_KEY,
  DEFAULT_SUSPICIOUS_LOGIN_CONFIG,
  SUSPICIOUS_LOGIN_REQUIRED_EVENT_TYPES,
  SUSPICIOUS_LOGIN_REQUIRED_FIELDS,
  SUSPICIOUS_LOGIN_REQUIRED_CONTEXT,
} from '../rules/suspicious-login/suspicious-login.schema';
import {
  SUSPICIOUS_PROCESS_KEY,
  DEFAULT_SUSPICIOUS_PROCESS_CONFIG,
  SUSPICIOUS_PROCESS_REQUIRED_EVENT_TYPES,
  SUSPICIOUS_PROCESS_REQUIRED_FIELDS,
  SUSPICIOUS_PROCESS_REQUIRED_CONTEXT,
} from '../rules/suspicious-process/suspicious-process.schema';
import {
  CLOUD_PRIVILEGE_ESCALATION_KEY,
  DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG,
  CLOUD_PRIVILEGE_ESCALATION_REQUIRED_EVENT_TYPES,
  CLOUD_PRIVILEGE_ESCALATION_REQUIRED_FIELDS,
  CLOUD_PRIVILEGE_ESCALATION_REQUIRED_CONTEXT,
} from '../rules/cloud-privilege-escalation/cloud-privilege-escalation.schema';

interface BuiltInDetection {
  key: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  configuration: unknown;
  requiredEventTypes: string[];
  requiredFields: string[];
  requiredContext: string[];
}

/**
 * Registers the detections shield-core actually implements.
 *
 * DetectionRegistryService resolves a rule implementation by its definition
 * key, but only for DetectionVersions that are PUBLISHED in the database —
 * and nothing ever wrote those rows. The three rule classes were constructed,
 * registered in memory and unit-tested, while `findApplicable` queried an
 * empty table and returned nothing for every event. Detection ran end to end
 * and matched nothing, in every tenant, because there was no detection to
 * match against.
 *
 * Definitions are platform-wide rather than per-tenant (DetectionDefinition
 * has no tenant column), so this runs once at boot and is idempotent: an
 * existing definition keeps its id, and a published version is never
 * rewritten, since published versions are immutable (spec §19).
 */
@Injectable()
export class DetectionRegistrationService implements OnModuleInit {
  private readonly logger = new Logger(DetectionRegistrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly builtIns: BuiltInDetection[] = [
    {
      key: SUSPICIOUS_LOGIN_KEY,
      name: 'Suspicious sign-in',
      description:
        'Failed sign-in activity for an identity whose type is treated as privileged.',
      category: 'IDENTITY',
      severity: 'HIGH',
      configuration: DEFAULT_SUSPICIOUS_LOGIN_CONFIG,
      requiredEventTypes: SUSPICIOUS_LOGIN_REQUIRED_EVENT_TYPES,
      requiredFields: SUSPICIOUS_LOGIN_REQUIRED_FIELDS,
      requiredContext: SUSPICIOUS_LOGIN_REQUIRED_CONTEXT,
    },
    {
      key: SUSPICIOUS_PROCESS_KEY,
      name: 'Suspicious process execution',
      description:
        'Known credential-theft tooling or encoded command lines executing on a host.',
      category: 'ENDPOINT',
      severity: 'CRITICAL',
      configuration: DEFAULT_SUSPICIOUS_PROCESS_CONFIG,
      requiredEventTypes: SUSPICIOUS_PROCESS_REQUIRED_EVENT_TYPES,
      requiredFields: SUSPICIOUS_PROCESS_REQUIRED_FIELDS,
      requiredContext: SUSPICIOUS_PROCESS_REQUIRED_CONTEXT,
    },
    {
      key: CLOUD_PRIVILEGE_ESCALATION_KEY,
      name: 'Cloud privilege escalation',
      description:
        'IAM actions that grant or broaden privilege in a cloud control plane.',
      category: 'CLOUD_INFRA',
      severity: 'HIGH',
      configuration: DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG,
      requiredEventTypes: CLOUD_PRIVILEGE_ESCALATION_REQUIRED_EVENT_TYPES,
      requiredFields: CLOUD_PRIVILEGE_ESCALATION_REQUIRED_FIELDS,
      requiredContext: CLOUD_PRIVILEGE_ESCALATION_REQUIRED_CONTEXT,
    },
  ];

  async onModuleInit(): Promise<void> {
    for (const builtIn of this.builtIns) {
      try {
        await this.register(builtIn);
      } catch (err) {
        // One detection failing to register must not stop the service from
        // starting, but it must be visible: that detection is off.
        this.logger.error(
          `Failed to register built-in detection '${builtIn.key}' — it will not evaluate: ${(err as Error).message}`,
        );
      }
    }
  }

  private async register(builtIn: BuiltInDetection): Promise<void> {
    const definition = await this.prisma.detectionDefinition.upsert({
      where: { key: builtIn.key },
      update: {
        name: builtIn.name,
        description: builtIn.description,
        category: builtIn.category,
      },
      create: {
        key: builtIn.key,
        name: builtIn.name,
        description: builtIn.description,
        category: builtIn.category,
        owner: 'zoikoshield-platform',
        status: 'ACTIVE',
      },
    });

    const published = await this.prisma.detectionVersion.findFirst({
      where: {
        detection_definition_id: definition.id,
        status: 'PUBLISHED',
      },
    });
    if (published) {
      this.logger.debug(
        `Detection '${builtIn.key}' already has published version ${published.version}; leaving it alone.`,
      );
      return;
    }

    const version = await this.prisma.detectionVersion.create({
      data: {
        detection_definition_id: definition.id,
        version: 1,
        status: 'PUBLISHED',
        severity: builtIn.severity,
        rule_type: 'POINT',
        configuration: JSON.stringify(builtIn.configuration),
        required_event_types: JSON.stringify(builtIn.requiredEventTypes),
        required_fields: JSON.stringify(builtIn.requiredFields),
        required_context: JSON.stringify(builtIn.requiredContext),
        allowed_missing_data_behavior: 'INDETERMINATE',
        effective_from: new Date(),
        published_at: new Date(),
      },
    });

    this.logger.log(
      `Published built-in detection '${builtIn.key}' v${version.version} (${builtIn.severity}) for event classes ${builtIn.requiredEventTypes.join(', ')}`,
    );
  }
}
