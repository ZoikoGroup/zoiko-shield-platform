import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka.producer.service';
import { ConnectorHealthService } from '../connectors/services/health.service';
import { PermissionService } from '../connectors/services/permission.service';

export interface RequiredPermissionSpec {
  provider: string;
  requiredScopes: string[];
  criticalScopes: string[];
}

export interface DriftCheckResult {
  instanceId: string;
  tenantId: string;
  provider: string;
  declaredRequired: string[];
  activelyGranted: string[];
  missingPermissions: string[];
  hasCriticalLoss: boolean;
  driftStatus: 'ALIGNED' | 'DEGRADED' | 'REVOKED';
  remediationGuidance: string[];
  timestamp: string;
}

/** Standard Certified P0 Scope Baselines */
export const P0_CONNECTOR_BASELINES: Record<string, RequiredPermissionSpec> = {
  'microsoft-entra': {
    provider: 'microsoft-entra',
    requiredScopes: [
      'AuditLog.Read.All',
      'Directory.Read.All',
      'SecurityEvents.Read.All',
    ],
    criticalScopes: ['AuditLog.Read.All', 'SecurityEvents.Read.All'],
  },
  'aws-cloudtrail': {
    provider: 'aws-cloudtrail',
    requiredScopes: [
      'cloudtrail:LookupEvents',
      'guardduty:GetFindings',
      's3:GetObject',
    ],
    criticalScopes: ['cloudtrail:LookupEvents', 's3:GetObject'],
  },
  'cortex-xdr': {
    provider: 'cortex-xdr',
    requiredScopes: ['investigation:read', 'alerts:read', 'endpoint:read'],
    criticalScopes: ['alerts:read'],
  },
  'jira': {
    provider: 'jira',
    requiredScopes: ['read:jira-work', 'read:jira-user'],
    criticalScopes: ['read:jira-work'],
  },
  'snyk': {
    provider: 'snyk',
    requiredScopes: ['org:read', 'project:read', 'vuln:read'],
    criticalScopes: ['vuln:read'],
  },
  'generic-webhook': {
    provider: 'generic-webhook',
    requiredScopes: ['webhook:receive', 'hmac:verify'],
    criticalScopes: ['webhook:receive'],
  },
  'generic-syslog': {
    provider: 'generic-syslog',
    requiredScopes: ['syslog:stream', 'tls:authenticate'],
    criticalScopes: ['syslog:stream'],
  },
};

@Injectable()
export class ConnectorPermissionDriftService {
  private readonly logger = new Logger(ConnectorPermissionDriftService.name);
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly healthService: ConnectorHealthService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Evaluates active permissions against required scopes for a connector instance.
   */
  async evaluateInstanceDrift(
    instanceId: string,
    tenantId: string,
    provider: string,
    activelyGranted: string[],
  ): Promise<DriftCheckResult> {
    const baseline = P0_CONNECTOR_BASELINES[provider] || {
      provider,
      requiredScopes: [],
      criticalScopes: [],
    };

    // Ensure required permissions are declared in the persistence layer
    if (baseline.requiredScopes.length > 0) {
      await this.permissionService.declareRequired(
        tenantId,
        instanceId,
        provider,
        baseline.requiredScopes,
      );
    }

    const declaredRequired =
      baseline.requiredScopes.length > 0
        ? baseline.requiredScopes
        : await this.permissionService.getMissingRequired(instanceId);

    const missingPermissions = declaredRequired.filter(
      (scope) => !activelyGranted.includes(scope),
    );

    const lostCritical = baseline.criticalScopes.filter((critical) =>
      missingPermissions.includes(critical),
    );

    const hasCriticalLoss = lostCritical.length > 0;
    let driftStatus: 'ALIGNED' | 'DEGRADED' | 'REVOKED' = 'ALIGNED';

    if (missingPermissions.length > 0) {
      driftStatus = hasCriticalLoss ? 'REVOKED' : 'DEGRADED';
    }

    const remediationGuidance = missingPermissions.map((scope) => {
      return `Re-grant scope '${scope}' in ${provider} identity/OAuth admin console for instance ${instanceId}.`;
    });

    const result: DriftCheckResult = {
      instanceId,
      tenantId,
      provider,
      declaredRequired,
      activelyGranted,
      missingPermissions,
      hasCriticalLoss,
      driftStatus,
      remediationGuidance,
      timestamp: new Date().toISOString(),
    };

    // Update permission status in health tracking
    await this.healthService.updatePermissionStatus(
      instanceId,
      tenantId,
      driftStatus === 'ALIGNED' ? 'OK' : 'DEGRADED',
    );

    if (driftStatus !== 'ALIGNED') {
      this.logger.warn(
        `[PERMISSION DRIFT] Connector ${instanceId} (${provider}) has lost permissions: ${missingPermissions.join(
          ', ',
        )}`,
      );

      // Reconcile in PermissionService to emit drift event
      await this.permissionService.reconcileGranted(instanceId, activelyGranted);

      // Publish structured drift telemetry
      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.CONNECTOR_PERMISSION_CHANGED,
        'connector.permission.drift_detected',
        {
          tenantId,
          instanceId,
          provider,
          driftStatus,
          missingPermissions,
          hasCriticalLoss,
          remediationGuidance,
          timestamp: result.timestamp,
        },
      );

      // Degrade health if critical permissions are missing
      if (hasCriticalLoss) {
        await this.healthService.updateHealth(
          instanceId,
          tenantId,
          'DEGRADED',
          `Critical permissions lost: ${lostCritical.join(', ')}`,
        );
      }
    } else {
      // Reconcile all granted
      await this.permissionService.reconcileGranted(instanceId, activelyGranted);
    }

    return result;
  }

  /**
   * Automated Cron Sweeper checking connector permission health every 15 minutes.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepPermissionDrift(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const activeConnectors = await this.prisma.connectorInstance.findMany({
        where: {
          state: { in: ['HEALTHY', 'CONNECTED', 'SYNCING', 'DEGRADED'] },
        },
        include: { definition: true },
      });

      for (const connector of activeConnectors) {
        const granted = await this.permissionService.getGranted(connector.id);
        const provider =
          connector.definition?.provider ||
          connector.connectorDefId ||
          'generic';
        await this.evaluateInstanceDrift(
          connector.id,
          connector.tenant_id,
          provider,
          granted,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error in sweepPermissionDrift: ${err.message}`);
    } finally {
      this.isSweeping = false;
    }
  }
}
