import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConnectorState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorError } from '../core/connector-errors';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../kafka/kafka.producer.service';

export interface ConnectorHeartbeatPayload {
  lagMs?: number;
  errorRate?: number;
  eventsProcessed?: number;
  statusMessage?: string;
}

@Injectable()
export class ConnectorHealthService {
  private readonly logger = new Logger(ConnectorHealthService.name);
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Active Connector Heartbeat Registration (OPS-INV-13 Specification)
   */
  async recordHeartbeat(
    instanceId: string,
    tenantId: string,
    payload?: ConnectorHeartbeatPayload,
  ) {
    this.logger.debug(
      `💓 [CONNECTOR HEARTBEAT] Received heartbeat from instance ${instanceId} (Tenant: ${tenantId}, Lag: ${payload?.lagMs ?? 0}ms)`,
    );

    const now = new Date();

    const healthStatus = await this.prisma.connectorHealthStatus.upsert({
      where: { instanceId },
      update: {
        state: 'HEALTHY',
        lastMessage: payload?.statusMessage || 'Heartbeat healthy',
        consecutiveFailures: 0,
        lastSuccessfulConnectionAt: now,
        lastSuccessfulSyncAt: now,
      },
      create: {
        tenant_id: tenantId,
        instanceId,
        state: 'HEALTHY',
        lastMessage: payload?.statusMessage || 'Heartbeat healthy',
        consecutiveFailures: 0,
        lastSuccessfulConnectionAt: now,
        lastSuccessfulSyncAt: now,
      },
    });

    await this.prisma.connectorInstance.update({
      where: { id: instanceId },
      data: { state: 'HEALTHY' },
    });

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.CONNECTOR_HEALTH_CHANGED,
      'connector.heartbeat.received',
      {
        tenantId,
        instanceId,
        state: 'HEALTHY',
        lagMs: payload?.lagMs ?? 0,
        eventsProcessed: payload?.eventsProcessed ?? 0,
        timestamp: now.toISOString(),
      },
    );

    return healthStatus;
  }

  /**
   * Automated Connector Heartbeat Monitor Sweeper (OPS-INV-13 Specification)
   * Runs every minute to detect missed heartbeats (>60s DEGRADED, >180s UNHEALTHY/STALE).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorConnectorHeartbeats(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;

    try {
      const activeInstances = await this.prisma.connectorInstance.findMany({
        where: {
          state: {
            in: ['HEALTHY', 'CONNECTED', 'SYNCING', 'DEGRADED'],
          },
        },
        include: { connectorHealthStatus: true },
      });

      const now = Date.now();

      for (const instance of activeInstances) {
        const statusRecord = instance.connectorHealthStatus || (instance as any).healthStatus;
        const lastSeen = statusRecord?.lastSuccessfulConnectionAt
          ? new Date(statusRecord.lastSuccessfulConnectionAt).getTime()
          : 0;

        if (!lastSeen) continue;

        const timeSinceLastHeartbeatMs = now - lastSeen;

        // Over 3 minutes: Mark UNHEALTHY / STALE
        if (timeSinceLastHeartbeatMs > 180 * 1000) {
          if (instance.state !== 'DISCONNECTED') {
            this.logger.warn(
              `⚠️ [CONNECTOR STALE] Instance '${instance.id}' missed heartbeats for ${Math.round(timeSinceLastHeartbeatMs / 1000)}s. Escalating to UNHEALTHY.`,
            );
            await this.updateHealth(
              instance.id,
              instance.tenant_id,
              'DEGRADED',
              `Missed heartbeats for >180s (Last seen ${Math.round(timeSinceLastHeartbeatMs / 1000)}s ago)`,
            );
          }
        }
        // Over 60 seconds: Mark DEGRADED
        else if (timeSinceLastHeartbeatMs > 60 * 1000) {
          if (instance.state === 'HEALTHY' || instance.state === 'CONNECTED') {
            this.logger.warn(
              `🟡 [CONNECTOR DEGRADED] Instance '${instance.id}' missed heartbeat (>60s). Marking DEGRADED.`,
            );
            await this.updateHealth(
              instance.id,
              instance.tenant_id,
              'DEGRADED',
              `Missed heartbeat (>60s)`,
            );
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in monitorConnectorHeartbeats cron: ${err.message}`);
    } finally {
      this.isSweeping = false;
    }
  }

  async updateHealth(
    instanceId: string,
    tenantId: string,
    state: ConnectorState,
    message?: string,
  ) {
    this.logger.debug(`Updating health for instance ${instanceId} to ${state}`);

    const isSuccess =
      state === 'HEALTHY' || state === 'CONNECTED' || state === 'SYNCING';

    await this.prisma.connectorHealthStatus.upsert({
      where: { instanceId },
      update: {
        state,
        lastMessage: message,
        consecutiveFailures: isSuccess ? 0 : { increment: 1 },
        ...(isSuccess ? { lastSuccessfulConnectionAt: new Date() } : {}),
      },
      create: {
        tenant_id: tenantId,
        instanceId,
        state,
        lastMessage: message,
        consecutiveFailures: isSuccess ? 0 : 1,
        lastSuccessfulConnectionAt: isSuccess ? new Date() : undefined,
      },
    });

    await this.prisma.connectorInstance.update({
      where: { id: instanceId },
      data: { state },
    });

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.CONNECTOR_HEALTH_CHANGED,
      'connector.health.changed',
      { tenantId, instanceId, state, message },
    );
  }

  async recordSuccessfulSync(instanceId: string) {
    await this.prisma.connectorHealthStatus
      .update({
        where: { instanceId },
        data: { lastSuccessfulSyncAt: new Date() },
      })
      .catch(() => undefined);
  }

  async updatePermissionStatus(
    instanceId: string,
    tenantId: string,
    status: 'OK' | 'DEGRADED',
  ) {
    await this.prisma.connectorHealthStatus.upsert({
      where: { instanceId },
      update: { permissionStatus: status },
      create: {
        tenant_id: tenantId,
        instanceId,
        state: 'CONNECTED',
        permissionStatus: status,
      },
    });
  }

  async handleConnectorError(
    instanceId: string,
    tenantId: string,
    error: Error,
  ) {
    if (error instanceof ConnectorError) {
      this.logger.warn(
        `Connector Error [${error.errorCode}] for instance ${instanceId}: ${error.message}`,
      );

      let newState: ConnectorState = 'DEGRADED';
      if (error.errorCode === 'AUTH_FAILED') newState = 'AUTHENTICATION_FAILED';
      if (error.errorCode === 'RATE_LIMITED') newState = 'RATE_LIMITED';
      if (error.errorCode === 'PERMISSION_REVOKED')
        newState = 'PERMISSION_REVOKED';

      await this.updateHealth(instanceId, tenantId, newState, error.message);
      await this.prisma.connectorHealthStatus
        .update({
          where: { instanceId },
          data: { lastErrorCode: error.errorCode },
        })
        .catch(() => undefined);

      await this.prisma.connectorError.create({
        data: {
          tenant_id: tenantId,
          instanceId,
          errorCode: error.errorCode,
          message: error.message,
        },
      });
    } else {
      this.logger.error(
        `Unknown error for instance ${instanceId}: ${error.message}`,
      );
      await this.updateHealth(
        instanceId,
        tenantId,
        'DEGRADED',
        'Unknown error occurred',
      );
    }
  }
}

