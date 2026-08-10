/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { EntraGraphClient } from './entra.client';
import { ConnectorCheckpointService } from '../../services/checkpoint.service';
import { RawIngestService } from '../../../ingestion/raw-ingest.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka.producer.service';

@Injectable()
export class EntraUserSyncService {
  private readonly logger = new Logger(EntraUserSyncService.name);

  constructor(
    private readonly graphClient: EntraGraphClient,
    private readonly checkpointService: ConnectorCheckpointService,
    private readonly rawIngestService: RawIngestService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Performs a delta sync of Users using the Microsoft Graph API. Identity
   * resolution itself now happens in shield-core — this service only
   * raw-stores each directory record for provenance and publishes
   * identity.directory-sync.v1 (via the outbox, durable through a Kafka
   * outage) for shield-core's security-context module to consume and
   * resolve. If a deltaLink exists from a previous run, only changes are
   * fetched.
   */
  async syncUsers(
    instanceId: string,
    tenantId: string,
    environmentId: string,
    accessToken: string,
  ): Promise<number> {
    this.logger.log(`Starting User Delta Sync for Connector ${instanceId}`);

    const checkpoint = await this.checkpointService.get(instanceId, 'users');
    let endpoint = checkpoint ?? '/users/delta';
    let totalProcessed = 0;

    while (endpoint) {
      this.logger.debug(`Fetching Graph URL: ${endpoint}`);
      const data = await this.graphClient.request(endpoint, accessToken);

      const users = data.value || [];
      totalProcessed += users.length;

      for (const user of users) {
        // Raw-store for provenance. This is a directory sync, not a
        // security event, so it does not go through the NormalizationService
        // security-event pipeline — it feeds Asset/Identity resolution directly.
        await this.rawIngestService.ingestRawEvent({
          tenantId,
          environmentId,
          connectorId: instanceId,
          sourceType: 'microsoft-entra-directory',
          sourceEventId: user.id,
          payload: user,
        });

        await this.prisma.outboxEvent.create({
          data: this.outbox.build({
            tenantId,
            topic: CANONICAL_TOPICS.IDENTITY_DIRECTORY_SYNC,
            eventType: 'identity.directory-sync',
            payload: {
              tenantId,
              instanceId,
              sourceSystem: 'microsoft-entra-directory',
              externalId: user.id,
              email: user.mail || user.userPrincipalName,
              displayName: user.displayName,
              removed: !!user['@removed'],
            },
          }),
        });

        if (user['@removed']) {
          this.logger.debug(`User removed (directory-sync published): ${user.id}`);
        }
      }

      // If we got a nextLink, keep paging. If we got a deltaLink, we are done.
      if (data['@odata.nextLink']) {
        endpoint = data['@odata.nextLink'];
      } else if (data['@odata.deltaLink']) {
        await this.checkpointService.set(tenantId, instanceId, 'users', data['@odata.deltaLink']);
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
}
