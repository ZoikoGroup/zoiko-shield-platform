import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConnectorState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorError } from '../core/connector-errors';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../kafka/kafka.producer.service';
import { PlatformScope } from '../../../../../libs/database/src';
import { isInboundWebhookReceiver } from '../core/webhook-receiver';

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
  @PlatformScope(
    'scheduled job ConnectorHealthService.monitorConnectorHeartbeats',
  )
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
        include: { connectorHealthStatus: true, definition: true },
      });

      const now = Date.now();

      for (const instance of activeInstances) {
        // A webhook receiver sends no heartbeat: events arrive only when something
        // happens, so silence is not a fault and must not be reported as one.
        if (isInboundWebhookReceiver(instance.definition?.provider)) continue;
        const statusRecord =
          instance.connectorHealthStatus || (instance as any).healthStatus;
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
      this.logger.error(
        `Error in monitorConnectorHeartbeats cron: ${err.message}`,
      );
    } finally {
      this.isSweeping = false;
    }
  }

  /** At most one health write per connector per this interval, however busy the webhook. */
  private static readonly DELIVERY_WRITE_INTERVAL_MS = 30_000;
  private readonly lastDeliveryWrite = new Map<string, number>();

  /**
   * States a verified delivery may move a receiver out of. Anything else (disabled,
   * authentication failed, revoked …) is a decision a delivery must not override.
   */
  private static readonly DELIVERY_REVIVES: ReadonlySet<ConnectorState> =
    new Set<ConnectorState>(['NOT_CONNECTED', 'CONNECTED', 'HEALTHY', 'DEGRADED']);

  /**
   * A signed, accepted delivery is the proof a webhook receiver is working: mark it
   * connected, clear its failure count and stamp when it last heard from the sender.
   *
   * Only called after the signature has been verified, so it cannot be driven by an
   * unauthenticated request. Best-effort and rate-limited; `force` bypasses the limit
   * (used when a user explicitly tests the connection).
   */
  async recordWebhookDelivery(
    instanceId: string,
    tenantId: string,
    at: Date = new Date(),
    options: { force?: boolean } = {},
  ): Promise<void> {
    const now = Date.now();
    if (!options.force) {
      const last = this.lastDeliveryWrite.get(instanceId);
      if (last !== undefined && now - last < ConnectorHealthService.DELIVERY_WRITE_INTERVAL_MS) {
        return;
      }
    }
    this.lastDeliveryWrite.set(instanceId, now);

    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id: instanceId },
      select: { state: true, deletedAt: true },
    });
    if (
      !instance ||
      instance.deletedAt ||
      !ConnectorHealthService.DELIVERY_REVIVES.has(instance.state)
    ) {
      return;
    }

    const evidence = {
      lastMessage: 'Receiving signed webhook deliveries',
      consecutiveFailures: 0,
      lastSuccessfulConnectionAt: at,
      lastSuccessfulSyncAt: at,
    };

    if (instance.state === 'CONNECTED' || instance.state === 'HEALTHY') {
      // Already shown as working: refresh the evidence, change no state, emit no event.
      await this.prisma.connectorHealthStatus.upsert({
        where: { instanceId },
        update: evidence,
        create: { tenant_id: tenantId, instanceId, state: instance.state, ...evidence },
      });
      return;
    }

    await this.updateHealth(instanceId, tenantId, 'CONNECTED', evidence.lastMessage);
    await this.prisma.connectorHealthStatus
      .update({
        where: { instanceId },
        data: {
          lastSuccessfulConnectionAt: at,
          lastSuccessfulSyncAt: at,
          lastErrorCode: null,
        },
      })
      .catch(() => undefined);
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
