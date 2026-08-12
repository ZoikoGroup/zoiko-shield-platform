import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConnectorSyncService } from '../../services/sync.service';
import { EntraConnectorService } from './entra.connector';
import { ConnectorContext } from '../../core/connector-context';

/**
 * Drives automatic Entra polling on a cron schedule instead of requiring a
 * manual POST .../:id/sync call. Interval is configurable via
 * ENTRA_POLL_INTERVAL_CRON (standard cron syntax); defaults to every 5
 * minutes, matching the sign-in log poll cadence assumed elsewhere.
 */
@Injectable()
export class EntraSchedulerService {
  private readonly logger = new Logger(EntraSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: ConnectorSyncService,
    private readonly entraConnectorService: EntraConnectorService,
  ) {}

  @Cron(process.env.ENTRA_POLL_INTERVAL_CRON || CronExpression.EVERY_5_MINUTES)
  async pollAllConnectedInstances(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous Entra poll cycle still running — skipping this tick.');
      return;
    }
    this.running = true;

    try {
      const instances = await this.prisma.connectorInstance.findMany({
        where: {
          state: 'CONNECTED',
          deletedAt: null,
          definition: { provider: 'microsoft-entra' },
        },
      });

      this.logger.log(`Scheduled Entra poll: ${instances.length} connected instance(s).`);

      for (const instance of instances) {
        try {
          await this.syncService.runSync(instance.id);
          await this.checkPermissionDrift(instance.id, instance.tenant_id, instance.environment_id, instance.source_region);
        } catch (err) {
          this.logger.error(
            `Scheduled sync failed for instance ${instance.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async checkPermissionDrift(
    instanceId: string,
    tenantId: string,
    environmentId: string,
    region: string | null,
  ): Promise<void> {
    const context: ConnectorContext = {
      connectorInstanceId: instanceId,
      tenantId,
      environmentId,
      region: region ?? 'unspecified',
      purpose: 'security-monitoring',
      correlationId: randomUUID(),
      traceId: randomUUID(),
    };
    await this.entraConnectorService.getPermissions(context);
  }
}
