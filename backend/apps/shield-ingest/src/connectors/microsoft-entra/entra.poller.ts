/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { EntraGraphClient } from './entra.graph-client';
import { EntraDeltaSyncService } from './entra.delta-sync';
import { EntraNormalizerService } from './entra.normalizer';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EntraPollerService {
  private readonly logger = new Logger(EntraPollerService.name);

  constructor(
    private readonly graphClient: EntraGraphClient,
    private readonly deltaSyncService: EntraDeltaSyncService,
    private readonly normalizer: EntraNormalizerService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Orchestrates the scheduled polling for a given Connector Instance.
   * This is called on a cron job for every CONNECTED instance.
   */
  async executePoll(instanceId: string, tenantId: string, accessToken: string) {
    this.logger.log(`Starting scheduled poll for Instance: ${instanceId}`);

    // Create a Synchronization Run record in the DB
    const syncRun = await this.prisma.connectorSynchronizationRun.create({
      data: {
        tenant_id: tenantId,
        instanceId,
        status: 'RUNNING',
      },
    });

    try {
      // 1. Sync Users using Delta Queries
      const usersProcessed = await this.deltaSyncService.syncUsers(
        instanceId,
        tenantId,
        accessToken,
      );

      // 2. Poll Sign-in Logs
      const signInsProcessed = await this.pollSignInLogs(
        instanceId,
        tenantId,
        accessToken,
      );

      // Update the Sync Run with success
      await this.prisma.connectorSynchronizationRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          recordsProcessed: usersProcessed + signInsProcessed,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Polling failed for instance ${instanceId}: ${error.message}`,
      );

      // Mark Sync Run as failed
      await this.prisma.connectorSynchronizationRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Polls the Microsoft Graph /auditLogs/signIns endpoint.
   * Uses date filters instead of delta links because sign-in logs do not support delta queries.
   */
  private async pollSignInLogs(
    instanceId: string,
    tenantId: string,
    accessToken: string,
  ): Promise<number> {
    this.logger.log(`Starting Sign-in Log polling for Connector ${instanceId}`);

    // 1. Get the last poll time checkpoint
    const checkpoint = await this.prisma.connectorCheckpoint.findUnique({
      where: {
        instanceId_resourceType: { instanceId, resourceType: 'signIns' },
      },
    });

    // Default to pulling the last 1 hour if no checkpoint exists
    const lastFetch = checkpoint
      ? new Date(checkpoint.checkpointValue)
      : new Date(Date.now() - 60 * 60 * 1000);

    const now = new Date();

    // Format dates to ISO strings for Microsoft Graph OData filters
    const filter = `createdDateTime ge ${lastFetch.toISOString()} and createdDateTime le ${now.toISOString()}`;
    let endpoint = `/auditLogs/signIns?$filter=${encodeURIComponent(filter)}`;

    let totalProcessed = 0;

    // 2. Fetch pages
    while (endpoint) {
      this.logger.debug(`Fetching Graph URL: ${endpoint}`);
      const data = await this.graphClient.request(endpoint, accessToken);

      const logs = data.value || [];
      totalProcessed += logs.length;

      // 3. Normalize events to Canonical format and publish
      for (const log of logs) {
        const canonicalEvent = this.normalizer.normalizeSignInLog(
          log,
          tenantId,
        );
        this.logger.debug(
          `Normalized event ready for Kafka: [${canonicalEvent.event_type}] ${canonicalEvent.user_identity.username}`,
        );
        await this.kafkaProducer.publishCanonicalEvent(canonicalEvent);
      }

      endpoint = data['@odata.nextLink'];
    }

    // 4. Save the new checkpoint time (we use `now` as the new checkpoint)
    await this.prisma.connectorCheckpoint.upsert({
      where: {
        instanceId_resourceType: { instanceId, resourceType: 'signIns' },
      },
      update: { checkpointValue: now.toISOString() },
      create: {
        tenant_id: tenantId,
        instanceId,
        resourceType: 'signIns',
        checkpointValue: now.toISOString(),
      },
    });

    this.logger.log(
      `Sign-in polling completed. Total processed: ${totalProcessed}`,
    );
    return totalProcessed;
  }
}
