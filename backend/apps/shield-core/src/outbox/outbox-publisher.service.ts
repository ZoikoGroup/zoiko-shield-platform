import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

/**
 * OutboxEvent is a table shared with shield-ingest (one Prisma schema, two
 * apps). Each app's poller MUST only claim rows for topics it authors —
 * otherwise both pollers race to publish the other app's events.
 * shield-core owns identity.user.*, detection.*, alert.*, case.*,
 * evidence.*, incident.* (alert/detection moved here along with their
 * modules; identity.user.* is newly owned here since directory-sync
 * resolution now happens in this app). shield-ingest owns
 * event.normalized.*, identity.directory-sync.*, identity.signin.*,
 * connector.*, ingestion.*, normalization.*. shield-action owns
 * action.simulated./command.signed./action.dispatched./action.receipt./
 * action.reconciliation./action.rollback./action.frozen. — note this app
 * (shield-core) owns only the narrow action.proposed./action.approved./
 * action.rejected. sub-prefixes, NOT a broad "action." prefix, since that
 * would collide with shield-action's topics. Zero overlap across all
 * three apps' lists.
 */
const SHIELD_CORE_OWNED_TOPIC_PREFIXES = [
  'identity.user.',
  'detection.',
  'alert.',
  'case.',
  'evidence.',
  'incident.',
  'action.proposed.',
  'action.approved.',
  'action.rejected.',
  // Part 11+12 — no overlap with shield-anchor's checkpoint./witness./anchor.
  'control.',
  'assessment.',
  'risk.',
  'exception.',
  'audit_package.',
  // Part 13+14
  'report.',
  'notification.',
  'api_client.',
  'webhook.',
  'export.',
  'tenant.offboarding.',
  'tenant.deletion.',
  'tenant.access.',
  'tenant.connectors.',
  'tenant.backup_expiry.',
  'tenant.closed.',
];

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: {
          published_at: null,
          OR: SHIELD_CORE_OWNED_TOPIC_PREFIXES.map((prefix) => ({ topic: { startsWith: prefix } })),
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.kafkaProducer.publishEvent(
            event.topic,
            event.event_type,
            { tenantId: event.tenant_id, ...JSON.parse(event.payload) },
            { correlationId: event.correlation_id ?? undefined },
          );
          await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { published_at: new Date() } });
        } catch (err) {
          this.logger.error(`Failed to publish outbox event ${event.id}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
