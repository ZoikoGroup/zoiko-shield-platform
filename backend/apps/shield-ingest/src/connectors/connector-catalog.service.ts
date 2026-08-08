import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class CreateConnectorDto {
  tenantId!: string;
  name!: string;
  provider!: string; // e.g. 'generic-webhook', 'microsoft-entra', 'aws', 'azure'
  environmentId?: string;
  authenticationType?: 'OAUTH' | 'API_KEY' | 'CLIENT_CREDENTIALS' | 'WEBHOOK_SECRET' | 'SYSLOG_TLS' | 'SERVICE_ACCOUNT';
  credentialReference?: string;
  sourceRegion?: string;
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

  constructor(private readonly prisma: PrismaService) {}

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
    this.logger.log(`Creating connector '${dto.name}' for tenant ${dto.tenantId}`);

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
        environment_id: dto.environmentId || 'default-env',
        connectorDefId: definition.id,
        name: dto.name,
        authentication_type: dto.authenticationType || 'API_KEY',
        source_region: dto.sourceRegion,
        state: 'CONNECTED',
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
  async getConnectorById(connectorId: string) {
    const connector = await this.prisma.connectorInstance.findUnique({
      where: { id: connectorId },
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
  async activateConnector(connectorId: string) {
    await this.getConnectorById(connectorId);
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { state: 'CONNECTED' },
    });
  }

  /**
   * Disable connector state
   */
  async disableConnector(connectorId: string) {
    await this.getConnectorById(connectorId);
    return this.prisma.connectorInstance.update({
      where: { id: connectorId },
      data: { state: 'DISCONNECTED' },
    });
  }
}
