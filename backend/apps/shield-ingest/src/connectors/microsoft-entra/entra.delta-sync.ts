/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntraGraphClient } from './entra.graph-client';

@Injectable()
export class EntraDeltaSyncService {
  private readonly logger = new Logger(EntraDeltaSyncService.name);

  constructor(
    private readonly graphClient: EntraGraphClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Performs a delta sync of Users using the Microsoft Graph API.
   * If a deltaLink exists from a previous run, it uses it to fetch only changes.
   * Otherwise, it does a full initial synchronization.
   */
  async syncUsers(
    instanceId: string,
    tenantId: string,
    accessToken: string,
  ): Promise<number> {
    this.logger.log(`Starting User Delta Sync for Connector ${instanceId}`);

    // 1. Get the latest checkpoint for users
    const checkpoint = await this.prisma.connectorCheckpoint.findUnique({
      where: { instanceId_resourceType: { instanceId, resourceType: 'users' } },
    });

    let endpoint = checkpoint ? checkpoint.checkpointValue : '/users/delta';
    let totalProcessed = 0;

    // 2. Fetch pages until we get a deltaLink
    while (endpoint) {
      this.logger.debug(`Fetching Graph URL: ${endpoint}`);
      const data = await this.graphClient.request(endpoint, accessToken);

      const users = data.value || [];
      totalProcessed += users.length;

      // TODO: Process the users (save to DB, publish to Kafka, etc.)
      for (const user of users) {
        // If user['@removed'] is present, the user was deleted/disabled
        this.logger.debug(
          `Processed user: ${user.id} - ${user.displayName || 'DELETED'}`,
        );
      }

      // If we got a nextLink, keep paging. If we got a deltaLink, we are done.
      if (data['@odata.nextLink']) {
        endpoint = data['@odata.nextLink'];
      } else if (data['@odata.deltaLink']) {
        // Save the deltaLink for the next run
        await this.saveCheckpoint(
          tenantId,
          instanceId,
          'users',
          data['@odata.deltaLink'],
        );
        this.logger.log(
          `User sync completed. Saved deltaLink. Total processed: ${totalProcessed}`,
        );
        break;
      } else {
        break;
      }
    }

    return totalProcessed;
  }

  private async saveCheckpoint(
    tenantId: string,
    instanceId: string,
    resourceType: string,
    deltaLink: string,
  ) {
    await this.prisma.connectorCheckpoint.upsert({
      where: { instanceId_resourceType: { instanceId, resourceType } },
      update: { checkpointValue: deltaLink },
      create: {
        tenant_id: tenantId,
        instanceId,
        resourceType,
        checkpointValue: deltaLink,
      },
    });
  }
}
