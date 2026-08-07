/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { EntraGraphClient } from './entra.graph-client';
import { ConnectorHealthService } from '../common/connector-health.service';
import { ConnectorAuthenticationError } from '../common/connector-errors';

@Injectable()
export class EntraHealthService {
  private readonly logger = new Logger(EntraHealthService.name);

  constructor(
    private readonly graphClient: EntraGraphClient,
    private readonly healthService: ConnectorHealthService,
  ) {}

  /**
   * Pings the Microsoft Graph API to ensure the token is still valid.
   */
  async checkHealth(
    instanceId: string,
    tenantId: string,
    accessToken: string,
  ): Promise<boolean> {
    this.logger.debug(`Checking health for Entra instance ${instanceId}`);
    try {
      // Fetch the organization details as a quick health ping
      await this.graphClient.request('/organization', accessToken);

      // If it succeeds, mark as HEALTHY
      await this.healthService.updateHealth(
        instanceId,
        tenantId,
        'HEALTHY',
        'Graph API is reachable',
      );
      return true;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        await this.healthService.handleConnectorError(
          instanceId,
          tenantId,
          new ConnectorAuthenticationError(
            'Token expired or permissions revoked',
          ),
        );
      } else {
        await this.healthService.handleConnectorError(
          instanceId,
          tenantId,
          error,
        );
      }
      return false;
    }
  }
}
