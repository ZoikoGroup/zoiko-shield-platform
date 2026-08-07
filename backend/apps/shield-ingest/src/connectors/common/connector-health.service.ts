import { Injectable, Logger } from '@nestjs/common';
import { ConnectorState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorError } from './connector-errors';

@Injectable()
export class ConnectorHealthService {
  private readonly logger = new Logger(ConnectorHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Updates the health status of a connector instance in the database.
   */
  async updateHealth(
    instanceId: string,
    tenantId: string,
    state: ConnectorState,
    message?: string,
  ) {
    this.logger.debug(`Updating health for instance ${instanceId} to ${state}`);

    await this.prisma.connectorHealthStatus.upsert({
      where: { instanceId },
      update: { state, lastMessage: message },
      create: {
        tenant_id: tenantId,
        instanceId,
        state,
        lastMessage: message,
      },
    });

    // Also update the main instance state
    await this.prisma.connectorInstance.update({
      where: { id: instanceId },
      data: { state },
    });
  }

  /**
   * Translates a custom ConnectorError into a health state update.
   */
  async handleConnectorError(
    instanceId: string,
    tenantId: string,
    error: Error,
  ) {
    if (error instanceof ConnectorError) {
      this.logger.warn(
        `Connector Error [${error.errorCode}] for instance ${instanceId}: ${error.message}`,
      );

      // Determine state based on error code
      let newState: ConnectorState = 'DEGRADED';
      if (error.errorCode === 'AUTH_FAILED') newState = 'AUTHENTICATION_FAILED';
      if (error.errorCode === 'RATE_LIMITED') newState = 'RATE_LIMITED';
      if (error.errorCode === 'PERMISSION_REVOKED')
        newState = 'PERMISSION_REVOKED';

      await this.updateHealth(instanceId, tenantId, newState, error.message);

      // Log the error to the database
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
