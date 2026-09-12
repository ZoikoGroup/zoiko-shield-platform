import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireEnvironmentId,
  requireRegion,
} from '../security/tenant-context';
import {
  ShieldCoreClient,
  ShieldCoreUnreachableError,
  TenantNotFoundError,
} from '../internal-client/shield-core.client';
import { ConnectorRegistry } from './core/connector-registry';
import { ConnectorSyncService } from './services/sync.service';
import { randomUUID } from 'crypto';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConnectorDto {
  @IsOptional()
  @IsString()
  tenantId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  provider!: string; // e.g. 'generic-webhook', 'microsoft-entra', 'aws', 'azure'

  @IsString()
  environmentId!: string;

  @IsOptional()
  @IsIn([
    'OAUTH',
    'API_KEY',
    'CLIENT_CREDENTIALS',
    'WEBHOOK_SECRET',
    'SYSLOG_TLS',
    'SERVICE_ACCOUNT',
  ])
  authenticationType?:
    | 'OAUTH'
    | 'API_KEY'
    | 'CLIENT_CREDENTIALS'
    | 'WEBHOOK_SECRET'
    | 'SYSLOG_TLS'
    | 'SERVICE_ACCOUNT';

  @IsOptional()
  @IsString()
  credentialReference?: string;

  @IsString()
  sourceRegion!: string;
}

export interface ConnectorTypeDto {
  id: string;
  name: string;
  category: string;
  description: string;
  supportedAuthTypes: string[];
  /**
   * ERB-01 §15 commits exactly one certified EDR partner with eventual
   * response authority (selected via ADR); any other EDR is BYO read-only
   * ingestion only - never a peer with equal action capability. Omitted
   * for non-EDR categories, where the distinction doesn't apply.
   */
  responseAuthority?: 'CERTIFIED_RESPONSE_PARTNER' | 'READ_ONLY_BYO_INGESTION';
}

/**
 * ERB-01 §15: exactly one EDR partner is certified with (eventual) response
 * authority; every other EDR provider is BYO read-only ingestion. Kept as a
 * lookup here so both the catalog and connector-instance responses agree,
 * rather than letting the labeling drift between the two.
 */
const EDR_RESPONSE_AUTHORITY: Record<
  string,
  'CERTIFIED_RESPONSE_PARTNER' | 'READ_ONLY_BYO_INGESTION'
> = {
  'crowdstrike-edr': 'CERTIFIED_RESPONSE_PARTNER',
  'sentinelone-edr': 'READ_ONLY_BYO_INGESTION',
  'palo-alto-cortex-xdr': 'READ_ONLY_BYO_INGESTION',
  'microsoft-defender-edr': 'READ_ONLY_BYO_INGESTION',
};

@Injectable()
export class ConnectorCatalogService {
  private readonly logger = new Logger(ConnectorCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly syncService: ConnectorSyncService,
    private readonly shieldCore: ShieldCoreClient,
  ) {}

  /**
   * Get list of supported initial connector categories (Step 5 MVP)
   */
  /**
   * Kept in sync with what actually self-registers in ConnectorRegistry at
   * boot (see shield-ingest.module.ts's providers array).
   */
  getConnectorTypes(): ConnectorTypeDto[] {
    return [
      {
        id: 'generic-webhook',
        name: 'Generic Webhook Ingestion',
        category: 'Webhook Ingestion',
        description:
          'Ingest raw security logs directly via secure webhooks (also used for sources with no dedicated adapter, e.g. GitHub push events)',
        supportedAuthTypes: ['API_KEY', 'WEBHOOK_SECRET'],
      },
      {
        id: 'generic-syslog',
        name: 'Generic Syslog Ingestion',
        category: 'Syslog Ingestion',
        description: 'Ingest RFC 5424 / RFC 3164 syslog security feeds',
        supportedAuthTypes: ['SYSLOG_TLS', 'API_KEY'],
      },
      {
        id: 'microsoft-entra',
        name: 'Microsoft 365 / Entra ID',
        category: 'Identity / Productivity',
        description: 'Collect Microsoft Entra ID audit & sign-in logs',
        supportedAuthTypes: ['OAUTH', 'CLIENT_CREDENTIALS'],
      },
      {
        id: 'okta-identity',
        name: 'Okta',
        category: 'Identity / Productivity',
        description: 'Collect Okta identity and authentication event logs',
        supportedAuthTypes: ['API_KEY'],
      },
      {
        id: 'aws-cloudtrail',
        name: 'AWS CloudTrail',
        category: 'Cloud Infrastructure',
        description: 'Ingest AWS API activity logs via SQS / EventBridge',
        supportedAuthTypes: ['SERVICE_ACCOUNT', 'API_KEY'],
      },
      {
        id: 'aws-guardduty',
        name: 'AWS GuardDuty',
        category: 'Cloud Infrastructure',
        description: 'Ingest Amazon GuardDuty threat detection findings',
        supportedAuthTypes: ['SERVICE_ACCOUNT'],
      },
      {
        id: 'azure-monitor',
        name: 'Azure Monitor Activity Logs',
        category: 'Cloud Infrastructure',
        description: 'Ingest Azure Activity Log audit events via a service principal',
        supportedAuthTypes: ['CLIENT_CREDENTIALS'],
      },
      {
        id: 'gcp-scc',
        name: 'Google Cloud Security Command Center',
        category: 'Cloud Infrastructure',
        description: 'Ingest GCP Security Command Center findings',
        supportedAuthTypes: ['SERVICE_ACCOUNT', 'OAUTH'],
      },
      {
        id: 'crowdstrike-edr',
        name: 'CrowdStrike Falcon EDR',
        category: 'EDR',
        description:
          'The ERB-01 certified EDR partner (§15) - full ingestion plus eventual response-action authority once R2+ execution is ratified. All other EDR connectors are read-only BYO ingestion only.',
        supportedAuthTypes: ['CLIENT_CREDENTIALS', 'API_KEY'],
        responseAuthority: 'CERTIFIED_RESPONSE_PARTNER',
      },
      {
        id: 'sentinelone-edr',
        name: 'SentinelOne',
        category: 'EDR',
        description:
          'BYO EDR - read-only ingestion of endpoint telemetry. No response-action authority; CrowdStrike is the ERB-01 certified partner.',
        supportedAuthTypes: ['API_KEY'],
        responseAuthority: 'READ_ONLY_BYO_INGESTION',
      },
      {
        id: 'palo-alto-cortex-xdr',
        name: 'Palo Alto Cortex XDR',
        category: 'EDR',
        description:
          'BYO EDR - read-only ingestion of endpoint telemetry. No response-action authority; CrowdStrike is the ERB-01 certified partner.',
        supportedAuthTypes: ['CLIENT_CREDENTIALS', 'API_KEY'],
        responseAuthority: 'READ_ONLY_BYO_INGESTION',
      },
      {
        id: 'microsoft-defender-edr',
        name: 'Microsoft Defender',
        category: 'EDR',
        description:
          'BYO EDR - read-only ingestion of endpoint telemetry. No response-action authority; CrowdStrike is the ERB-01 certified partner.',
        supportedAuthTypes: ['CLIENT_CREDENTIALS'],
        responseAuthority: 'READ_ONLY_BYO_INGESTION',
      },
      {
        id: 'snyk-vulnerability',
        name: 'Snyk',
        category: 'Vulnerability Management',
        description: 'Ingest Snyk vulnerability findings',
        supportedAuthTypes: ['API_KEY'],
      },
      {
        id: 'jira-ticketing',
        name: 'Jira',
        category: 'Ticketing / Incident Management',
        description: 'Sync security case tickets with Jira',
        supportedAuthTypes: ['API_KEY'],
      },
    ];
  }

  /**
   * Create a new connector instance
   */
  async createConnector(dto: CreateConnectorDto) {
    this.logger.log(
      `Creating connector '${dto.name}' for tenant ${dto.tenantId}`,
    );

    const sourceRegion = requireRegion(dto.sourceRegion);
    await this.assertSourceRegionWithinTenantResidency(
      dto.tenantId,
      sourceRegion,
    );

    // Ensure definition exists or create default definition
    let definition = await this.prisma.connectorDefinition.findUnique({
      where: { provider: dto.provider },
    });

    if (!definition) {
      definition = await this.prisma.connectorDefinition.create({
        data: {
          provider: dto.provider,
          name: dto.name,
          description: `Connector for ${dto.provider}`,
          supportedEvents: ['SECURITY_LOG', 'AUDIT_LOG'],
        },
      });
    }

    const connector = await this.prisma.connectorInstance.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: requireEnvironmentId(dto.environmentId),
        connectorDefId: definition.id,
        name: dto.name,
        authentication_type: dto.authenticationType || 'API_KEY',
        source_region: sourceRegion,
        state: 'NOT_CONNECTED',
      },
      include: {
        definition: true,
      },
    });

    if (dto.credentialReference) {
      await this.prisma.connectorCredentialReference.create({
        data: {
          tenant_id: dto.tenantId,
          instanceId: connector.id,
          vaultReferenceId: dto.credentialReference,
        },
      });
    }

    return this.withResponseAuthority(connector);
  }

  private withResponseAuthority<
    T extends { definition: { provider: string } },
  >(connector: T): T & {
    responseAuthority?: 'CERTIFIED_RESPONSE_PARTNER' | 'READ_ONLY_BYO_INGESTION';
  } {
    const responseAuthority = EDR_RESPONSE_AUTHORITY[connector.definition.provider];
    return responseAuthority ? { ...connector, responseAuthority } : connector;
  }

  /**
   * A connector must not collect into a region the tenant never committed to
   * at onboarding. The committed region is shield-core-owned, so an
   * unverifiable answer fails closed rather than trusting the caller's
   * sourceRegion.
   */
  private async assertSourceRegionWithinTenantResidency(
    tenantId: string,
    sourceRegion: string,
  ): Promise<void> {
    let residency;
    try {
      residency = await this.shieldCore.getTenantResidency(tenantId);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ShieldCoreUnreachableError) {
        throw new ServiceUnavailableException(
          'Tenant data-residency could not be verified; connector creation refused',
        );
      }
      throw err;
    }

    if (sourceRegion !== residency.dataResidencyRegion) {
      throw new BadRequestException(
        `Source region '${sourceRegion}' violates the tenant's committed data-residency region '${residency.dataResidencyRegion}'`,
      );
    }
  }

  /**
   * List connectors for tenant
   */
  async getConnectors(tenantId: string) {
    const connectors = await this.prisma.connectorInstance.findMany({
      where: { tenant_id: tenantId, deletedAt: null },
      include: {
        definition: true,
        credentials: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return connectors.map((c) => this.withResponseAuthority(c));
  }

  /**
   * Get single connector detail
   */
  async getConnectorById(tenantId: string, connectorId: string) {
    const connector = await this.prisma.connectorInstance.findFirst({
      where: { id: connectorId, tenant_id: tenantId },
      include: {
        definition: true,
        credentials: true,
        errors: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!connector || connector.deletedAt) {
      throw new NotFoundException(`Connector '${connectorId}' not found`);
    }

    return this.withResponseAuthority(connector);
  }

  /**
   * Activate connector state
   */
  async activateConnector(tenantId: string, connectorId: string) {
    await this.getConnectorById(tenantId, connectorId);
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { state: 'CONNECTED' },
    });
  }

  /**
   * Disable connector state
   */
  async disableConnector(tenantId: string, connectorId: string) {
    await this.getConnectorById(tenantId, connectorId);
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { state: 'DISCONNECTED' },
    });
  }

  async updateConnector(
    tenantId: string,
    connectorId: string,
    input: { name?: string; sourceRegion?: string },
  ) {
    await this.getConnectorById(tenantId, connectorId);
    if (!input.name && !input.sourceRegion)
      throw new BadRequestException(
        'At least one supported connector field is required',
      );
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { name: input.name, source_region: input.sourceRegion },
    });
  }

  async retireConnector(tenantId: string, connectorId: string) {
    const instance = await this.getConnectorById(tenantId, connectorId);
    if (this.registry.has(instance.definition.provider)) {
      await this.registry
        .get(instance.definition.provider)
        .disconnect(this.context(instance));
    }
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { state: 'NOT_CONNECTED', deletedAt: new Date() },
    });
  }

  async testConnector(tenantId: string, connectorId: string) {
    const instance = await this.getConnectorById(tenantId, connectorId);
    if (!this.registry.has(instance.definition.provider)) {
      throw new BadRequestException(
        `Provider '${instance.definition.provider}' has no executable connection test`,
      );
    }
    return this.registry
      .get(instance.definition.provider)
      .testConnection(this.context(instance));
  }

  async syncConnector(tenantId: string, connectorId: string) {
    await this.getConnectorById(tenantId, connectorId);
    await this.syncService.runSync(connectorId);
    return this.getConnectorHealth(tenantId, connectorId);
  }

  async getConnectorHealth(tenantId: string, connectorId: string) {
    await this.getConnectorById(tenantId, connectorId);
    return this.prisma.connectorHealthStatus.findFirst({
      where: { instanceId: connectorId, tenant_id: tenantId },
    });
  }

  private context(instance: {
    id: string;
    tenant_id: string;
    environment_id: string;
    source_region: string | null;
  }) {
    return {
      connectorInstanceId: instance.id,
      tenantId: instance.tenant_id,
      environmentId: instance.environment_id,
      region: requireRegion(instance.source_region),
      purpose: 'security-monitoring',
      correlationId: randomUUID(),
      traceId: randomUUID(),
    };
  }
}
