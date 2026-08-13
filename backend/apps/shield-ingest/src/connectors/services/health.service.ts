import { Injectable, Logger } from '@nestjs/common';
import { ConnectorState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorError } from '../core/connector-errors';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../kafka/kafka.producer.service';

@Injectable()
export class ConnectorHealthService {
  private readonly logger = new Logger(ConnectorHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

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
