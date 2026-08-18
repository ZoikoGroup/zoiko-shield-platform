import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireEnvironmentId,
  requireRegion,
} from '../security/tenant-context';
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
}

@Injectable()
export class ConnectorCatalogService {
  private readonly logger = new Logger(ConnectorCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly syncService: ConnectorSyncService,
  ) {}

  /**
   * Get list of supported initial connector categories (Step 5 MVP)
   */
  getConnectorTypes(): ConnectorTypeDto[] {
    return [
      {
        id: 'generic-webhook',
        name: 'Generic Webhook Ingestion',
        category: 'Webhook Ingestion',
        description: 'Ingest raw security logs directly via secure webhooks',
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
        id: 'aws-cloudtrail',
        name: 'AWS CloudTrail',
        category: 'Cloud Infrastructure',
        description: 'Ingest AWS API activity logs via SQS / EventBridge',
        supportedAuthTypes: ['SERVICE_ACCOUNT', 'API_KEY'],
      },
      {
        id: 'azure-monitor',
        name: 'Azure Activity Logs',
        category: 'Cloud Infrastructure',
        description: 'Ingest Azure Security Center and Activity events',
        supportedAuthTypes: ['CLIENT_CREDENTIALS', 'SERVICE_ACCOUNT'],
      },
      {
        id: 'crowdstrike-edr',
        name: 'CrowdStrike Falcon EDR',
        category: 'EDR',
        description: 'Endpoint detection and response security telemetry',
        supportedAuthTypes: ['CLIENT_CREDENTIALS', 'API_KEY'],
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
        source_region: requireRegion(dto.sourceRegion),
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

    return connector;
  }

  /**
   * List connectors for tenant
   */
  async getConnectors(tenantId: string) {
    return this.prisma.connectorInstance.findMany({
      where: { tenant_id: tenantId, deletedAt: null },
      include: {
        definition: true,
        credentials: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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

    return connector;
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
