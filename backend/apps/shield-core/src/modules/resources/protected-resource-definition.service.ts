import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export const RESOURCE_FAMILIES = [
  'ENDPOINT',
  'SERVER_WORKLOAD',
  'USER_IDENTITY',
  'PRIVILEGED_IDENTITY',
  'MAILBOX',
  'CLOUD_ACCOUNT',
  'APPLICATION_API',
  'DOMAIN_EXTERNAL_ASSET',
  'TENANT_LEGAL_ENTITY',
] as const;

export type ResourceFamily = (typeof RESOURCE_FAMILIES)[number];

const RESOURCE_FAMILY_RULES: Record<
  ResourceFamily,
  { definition: string; safeguard: string }
> = {
  ENDPOINT: {
    definition:
      'Managed workstation/device instance under an approved endpoint source.',
    safeguard:
      'Deduplicate by stable device identity and tenant; connector aliases do not create additional units.',
  },
  SERVER_WORKLOAD: {
    definition:
      'Server, VM, containerized workload, cloud workload or equivalent protected compute unit.',
    safeguard:
      'The approved definition states ephemeral treatment, minimum lifetime and aggregation window.',
  },
  USER_IDENTITY: {
    definition: 'Human user identity where specifically contracted.',
    safeguard:
      'Service identities and duplicate federated aliases are excluded unless the SKU rule explicitly includes them.',
  },
  PRIVILEGED_IDENTITY: {
    definition:
      'Identity with elevated privilege requiring higher-assurance monitoring.',
    safeguard:
      'A distinct metric requires documented commercial disclosure and operational distinction.',
  },
  MAILBOX: {
    definition:
      'Monitored email mailbox/account where email security integration is in scope.',
    safeguard:
      'Shared and system mailbox treatment must be explicitly defined.',
  },
  CLOUD_ACCOUNT: {
    definition:
      'AWS account, Azure subscription/tenant, GCP project/org or equivalent defined boundary.',
    safeguard:
      'Provider-specific mapping and hierarchical counting must be explicit.',
  },
  APPLICATION_API: {
    definition:
      'Named production application/API boundary in monitoring or assurance scope.',
    safeguard:
      'Discovered microservices remain non-billable unless explicitly contracted.',
  },
  DOMAIN_EXTERNAL_ASSET: {
    definition:
      'Approved internet-facing domain/asset in exposure-management scope.',
    safeguard:
      'Discovery results remain candidate scope until an authorized acceptance decision.',
  },
  TENANT_LEGAL_ENTITY: {
    definition:
      'Organizational boundary for dedicated controls, reporting or compliance packs.',
    safeguard:
      'Only count when the offer explicitly prices organizational complexity.',
  },
};

export class CreateResourceDefinitionDto {
  @IsString()
  resourceType!: string;

  @IsIn(RESOURCE_FAMILIES)
  resourceFamily!: ResourceFamily;

  @IsString()
  metricFamily!: string;

  @IsArray()
  identityKeys!: string[];

  @IsOptional()
  @IsArray()
  physicalIdentityKeys?: string[];

  /** Shared namespace lets different metric definitions identify the same physical object. */
  @IsOptional()
  @IsString()
  physicalIdentityNamespace?: string;

  @IsObject()
  countingPolicy!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  overlapPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ephemeralPolicy?: Record<string, unknown>;
}

/**
 * Category C controlled resource taxonomy. Identity, exclusions, overlap and
 * ephemeral-counting behavior are approved and versioned; ingestion cannot
 * invent any of them per observation.
 */
@Injectable()
export class ProtectedResourceDefinitionService {
  private readonly logger = new Logger(ProtectedResourceDefinitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requireNonEmptyStrings(field: string, values: unknown): string[] {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new BadRequestException(
        `${field} must contain at least one non-empty value`,
      );
    }
    return [...new Set(values.map((value) => (value as string).trim()))];
  }

  private requirePolicyValue(
    policy: Record<string, unknown>,
    key: string,
    accepted?: unknown[],
  ) {
    const value = policy[key];
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && !value.trim()) ||
      (accepted && !accepted.includes(value))
    ) {
      throw new BadRequestException(
        `countingPolicy.${key} is required${accepted ? ` and must be one of ${accepted.join(', ')}` : ''}`,
      );
    }
  }

  /** Enforce the safeguard required for each controlled resource family. */
  private validateFamilyPolicy(
    family: ResourceFamily,
    counting: Record<string, unknown>,
    ephemeral: Record<string, unknown>,
  ) {
    switch (family) {
      case 'ENDPOINT':
        this.requirePolicyValue(counting, 'stableIdentityKey', [true]);
        break;
      case 'SERVER_WORKLOAD':
        this.requirePolicyValue(ephemeral, 'aggregationMethod', [
          'HIGH_WATER',
          'AVERAGE',
          'COMMITTED',
        ]);
        this.requirePolicyValue(ephemeral, 'observationWindow');
        this.requirePolicyValue(ephemeral, 'minimumDurationSeconds');
        if (
          typeof ephemeral.minimumDurationSeconds !== 'number' ||
          !Number.isInteger(ephemeral.minimumDurationSeconds) ||
          ephemeral.minimumDurationSeconds < 0
        ) {
          throw new BadRequestException(
            'ephemeralPolicy.minimumDurationSeconds must be a non-negative integer',
          );
        }
        break;
      case 'USER_IDENTITY':
        this.requirePolicyValue(counting, 'serviceIdentityTreatment', [
          'EXCLUDE',
          'SKU_INCLUDED',
        ]);
        this.requirePolicyValue(counting, 'federatedAliasTreatment', [
          'DEDUPLICATE',
          'SKU_SEPARATE',
        ]);
        break;
      case 'PRIVILEGED_IDENTITY':
        this.requirePolicyValue(counting, 'distinctMetricDisclosed', [true]);
        this.requirePolicyValue(counting, 'operationallyDistinct', [true]);
        break;
      case 'MAILBOX':
        this.requirePolicyValue(counting, 'sharedMailboxTreatment', [
          'INCLUDE',
          'EXCLUDE',
        ]);
        this.requirePolicyValue(counting, 'systemMailboxTreatment', [
          'INCLUDE',
          'EXCLUDE',
        ]);
        break;
      case 'CLOUD_ACCOUNT':
        if (
          !counting.providerMappings ||
          typeof counting.providerMappings !== 'object' ||
          Array.isArray(counting.providerMappings) ||
          Object.keys(counting.providerMappings).length === 0
        ) {
          throw new BadRequestException(
            'countingPolicy.providerMappings must define at least one cloud provider mapping',
          );
        }
        this.requirePolicyValue(counting, 'hierarchyRule');
        break;
      case 'APPLICATION_API':
        this.requirePolicyValue(counting, 'productionBoundaryRule');
        this.requirePolicyValue(counting, 'discoveredMicroservicesBillable', [
          false,
        ]);
        break;
      case 'DOMAIN_EXTERNAL_ASSET':
        this.requirePolicyValue(counting, 'scopeAcceptanceRequired', [true]);
        break;
      case 'TENANT_LEGAL_ENTITY':
        this.requirePolicyValue(counting, 'organizationalComplexityPriced', [
          true,
        ]);
        break;
    }

    if (Object.keys(ephemeral).length > 0) {
      this.requirePolicyValue(ephemeral, 'aggregationMethod', [
        'HIGH_WATER',
        'AVERAGE',
        'COMMITTED',
      ]);
      this.requirePolicyValue(ephemeral, 'observationWindow');
      this.requirePolicyValue(ephemeral, 'minimumDurationSeconds');
      if (
        typeof ephemeral.minimumDurationSeconds !== 'number' ||
        !Number.isInteger(ephemeral.minimumDurationSeconds) ||
        ephemeral.minimumDurationSeconds < 0
      ) {
        throw new BadRequestException(
          'ephemeralPolicy.minimumDurationSeconds must be a non-negative integer',
        );
      }
    }
  }

  private validateOverlapPolicy(policy: Record<string, unknown>) {
    if (Object.keys(policy).length === 0) return;
    const disclosed = policy.disclosedMetricFamilies;
    if (!Array.isArray(disclosed)) {
      throw new BadRequestException(
        'overlapPolicy.disclosedMetricFamilies must be an array',
      );
    }
    if (disclosed.length > 0) {
      if (policy.operationallyDistinct !== true) {
        throw new BadRequestException(
          'overlapPolicy.operationallyDistinct must be true for disclosed overlapping metrics',
        );
      }
      if (
        typeof policy.disclosureReference !== 'string' ||
        !policy.disclosureReference.trim()
      ) {
        throw new BadRequestException(
          'overlapPolicy.disclosureReference is required for disclosed overlapping metrics',
        );
      }
    }
  }

  async createDefinition(
    dto: CreateResourceDefinitionDto,
    requestedBy: string,
  ) {
    const resourceType = dto.resourceType.trim();
    const metricFamily = dto.metricFamily.trim();
    if (!resourceType || !metricFamily) {
      throw new BadRequestException(
        'resourceType and metricFamily must be non-empty',
      );
    }
    const identityKeys = this.requireNonEmptyStrings(
      'identityKeys',
      dto.identityKeys,
    );
    const physicalIdentityKeys = dto.physicalIdentityKeys
      ? this.requireNonEmptyStrings(
          'physicalIdentityKeys',
          dto.physicalIdentityKeys,
        )
      : identityKeys;
    const invalidPhysicalKeys = physicalIdentityKeys.filter(
      (key) => !identityKeys.includes(key),
    );
    if (invalidPhysicalKeys.length > 0) {
      throw new BadRequestException(
        `physicalIdentityKeys must be included in identityKeys: ${invalidPhysicalKeys.join(', ')}`,
      );
    }
    const physicalIdentityNamespace =
      dto.physicalIdentityNamespace?.trim() || dto.resourceFamily;

    const countingPolicy = dto.countingPolicy ?? {};
    const overlapPolicy = dto.overlapPolicy ?? {};
    const ephemeralPolicy = dto.ephemeralPolicy ?? {};
    this.validateFamilyPolicy(
      dto.resourceFamily,
      countingPolicy,
      ephemeralPolicy,
    );
    this.validateOverlapPolicy(overlapPolicy);

    const latest = await this.prisma.protectedResourceDefinition.findFirst({
      where: { resource_type: resourceType },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const controlled = RESOURCE_FAMILY_RULES[dto.resourceFamily];

    return this.prisma.protectedResourceDefinition.create({
      data: {
        resource_type: resourceType,
        resource_family: dto.resourceFamily,
        metric_family: metricFamily,
        version,
        controlled_definition: controlled.definition,
        counting_safeguard: controlled.safeguard,
        identity_key_spec: JSON.stringify({
          keys: identityKeys,
          physicalKeys: physicalIdentityKeys,
          physicalNamespace: physicalIdentityNamespace,
        }),
        counting_policy: JSON.stringify(countingPolicy),
        overlap_policy: JSON.stringify(overlapPolicy),
        ephemeral_policy: JSON.stringify(ephemeralPolicy),
        status: 'DRAFT',
        requested_by: requestedBy,
      },
    });
  }

  async approveDefinition(id: string, approvedBy: string) {
    const definition = await this.prisma.protectedResourceDefinition.findUnique(
      { where: { id } },
    );
    if (!definition) {
      throw new NotFoundException(`Resource definition '${id}' not found`);
    }
    if (definition.status !== 'DRAFT') {
      throw new ConflictException(
        `Resource definition '${id}' is '${definition.status}', not DRAFT`,
      );
    }
    if (definition.requested_by === approvedBy) {
      throw new ForbiddenException(
        'A protected-resource definition requester cannot approve their own definition',
      );
    }

    return this.prisma.protectedResourceDefinition.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
  }

  async getDefinition(id: string) {
    const definition = await this.prisma.protectedResourceDefinition.findUnique({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException(`Resource definition '${id}' not found`);
    }
    return definition;
  }

  async listDefinitions() {
    return this.prisma.protectedResourceDefinition.findMany({
      orderBy: [{ resource_family: 'asc' }, { version: 'desc' }],
    });
  }

  /** Fail closed when the type has no approved controlled definition. */
  async getActiveDefinition(resourceType: string) {
    const definition = await this.prisma.protectedResourceDefinition.findFirst({
      where: { resource_type: resourceType, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });

    if (!definition) {
      this.logger.warn(
        `Resource definition query FAILED CLOSED for type '${resourceType}'`,
      );
      return null;
    }

    // Legacy rows that pre-date Category C have no controlled metric family;
    // they cannot safely classify a new observation until reviewed/versioned.
    if (
      !RESOURCE_FAMILIES.includes(definition.resource_family as ResourceFamily) ||
      !definition.metric_family ||
      definition.metric_family === 'LEGACY' ||
      !definition.controlled_definition ||
      !definition.counting_safeguard
    ) {
      this.logger.warn(
        `Resource definition '${definition.id}' FAILED CLOSED because Category C governance metadata is incomplete`,
      );
      return null;
    }
    return definition;
  }
}
