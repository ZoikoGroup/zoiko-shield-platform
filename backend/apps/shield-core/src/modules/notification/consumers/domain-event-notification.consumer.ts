import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { EventEnvelope } from '../../../kafka/kafka-producer.service';
import { NotificationDispatchService } from '../dispatch/notification-dispatch.service';

/**
 * Wires a representative set of domain events to notification dispatch
 * (spec §12/PHASE 5) — proves the mechanism end to end. Dedup is handled
 * generically by KafkaConsumerService's InboxEvent check before any
 * handler runs, so a redelivered event never reaches dispatch() twice.
 */
@Injectable()
export class DomainEventNotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(DomainEventNotificationConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly dispatchService: NotificationDispatchService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler('audit_package.frozen.v1', this.handleAuditPackageFrozen.bind(this));
    this.kafkaConsumer.registerHandler('assessment.reviewed.v1', this.handleAssessmentReviewed.bind(this));
    this.kafkaConsumer.registerHandler('exception.expired.v1', this.handleExceptionExpired.bind(this));
  }

  private async handleAuditPackageFrozen(envelope: EventEnvelope<{ packageId: string; tenantId: string }>): Promise<void> {
    const payload = envelope.payload;
    await this.dispatchService.dispatch({
      tenantId: payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'AUDIT_PACKAGE_FROZEN',
      recipientPrincipalId: 'tenant-admin',
      templateContext: { packageId: payload.packageId },
      correlationId: envelope.correlationId,
    });
  }

  private async handleAssessmentReviewed(envelope: EventEnvelope<{ assessmentId: string; approved: boolean; tenantId: string }>): Promise<void> {
    if (envelope.payload.approved) return;
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'ASSESSMENT_REVIEW_REQUIRED',
      recipientPrincipalId: 'tenant-admin',
      templateContext: { assessmentId: envelope.payload.assessmentId },
      correlationId: envelope.correlationId,
    });
  }

  private async handleExceptionExpired(envelope: EventEnvelope<{ exceptionId: string; tenantId: string }>): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'EXCEPTION_EXPIRING',
      recipientPrincipalId: 'tenant-admin',
      templateContext: { exceptionId: envelope.payload.exceptionId },
      correlationId: envelope.correlationId,
    });
  }
}
