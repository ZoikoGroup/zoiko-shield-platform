/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { randomUUID } from 'crypto';

/**
 * Canonical topic names owned by shield-core: identity.user.*, detection.*,
 * alert.*, case.*, evidence.*, incident.*. detection.* and alert.* moved
 * here along with their owning modules; identity.user.* is newly owned
 * here since identity resolution (triggered by consuming
 * identity.directory-sync.v1, published by shield-ingest) now happens in
 * this app.
 */
export const CANONICAL_TOPICS = {
  IDENTITY_USER_UPSERTED: 'identity.user.upserted.v1',
  IDENTITY_USER_REMOVED: 'identity.user.removed.v1',
  DETECTION_MATCHED: 'detection.matched.v1',
  DETECTION_INDETERMINATE: 'detection.indeterminate.v1',
  ALERT_CREATED: 'alert.created.v1',
  ALERT_ACKNOWLEDGED: 'alert.acknowledged.v1',
  ALERT_ASSIGNED: 'alert.assigned.v1',
  ALERT_TRIAGED: 'alert.triaged.v1',
  ALERT_SUPPRESSED: 'alert.suppressed.v1',
  ALERT_ESCALATED: 'alert.escalated.v1',
  CASE_CREATED: 'case.created.v1',
  CASE_ALERT_LINKED: 'case.alert.linked.v1',
  CASE_ASSIGNED: 'case.assigned.v1',
  CASE_STATE_CHANGED: 'case.state.changed.v1',
  CASE_NOTE_ADDED: 'case.note.added.v1',
  CASE_DECISION_RECORDED: 'case.decision.recorded.v1',
  CASE_RESOLVED: 'case.resolved.v1',
  CASE_CLOSED: 'case.closed.v1',
  INCIDENT_DECLARED: 'incident.declared.v1',
  EVIDENCE_COLLECTED: 'evidence.collected.v1',
  EVIDENCE_VERIFIED: 'evidence.verified.v1',
  EVIDENCE_COMPLETENESS_CHANGED: 'evidence.completeness.changed.v1',
  EVIDENCE_CORRECTED: 'evidence.corrected.v1',
  EVIDENCE_LINKED: 'evidence.linked.v1',
  // Response governance (Part 9+10) — action.proposed/approved/rejected are
  // shield-core-owned; action.simulated./command.signed./action.dispatched./
  // action.receipt./action.reconciliation./action.rollback./action.frozen.
  // are shield-action-owned. Split at the sub-prefix level so the two
  // apps' outbox pollers never overlap under a broad "action." prefix.
  ACTION_PROPOSED: 'action.proposed.v1',
  ACTION_APPROVED: 'action.approved.v1',
  ACTION_REJECTED: 'action.rejected.v1',
  // Part 11+12 — Controls/Assessments/Risk/Audit Package (all shield-core-owned)
  CONTROL_CREATED: 'control.created.v1',
  CONTROL_IMPLEMENTATION_UPDATED: 'control.implementation.updated.v1',
  CONTROL_TEST_PUBLISHED: 'control.test.published.v1',
  CONTROL_MAPPING_CHANGED: 'control.mapping.changed.v1',
  ASSESSMENT_STARTED: 'assessment.started.v1',
  ASSESSMENT_COMPLETED: 'assessment.completed.v1',
  ASSESSMENT_REVIEWED: 'assessment.reviewed.v1',
  ASSESSMENT_SUPERSEDED: 'assessment.superseded.v1',
  EVIDENCE_GAP_DETECTED: 'evidence.gap.detected.v1',
  EVIDENCE_GAP_RESOLVED: 'evidence.gap.resolved.v1',
  RISK_CREATED: 'risk.created.v1',
  RISK_UPDATED: 'risk.updated.v1',
  RISK_ACCEPTED: 'risk.accepted.v1',
  RISK_TREATMENT_CREATED: 'risk.treatment.created.v1',
  EXCEPTION_REQUESTED: 'exception.requested.v1',
  EXCEPTION_APPROVED: 'exception.approved.v1',
  EXCEPTION_EXPIRED: 'exception.expired.v1',
  AUDIT_PACKAGE_CREATED: 'audit_package.created.v1',
  AUDIT_PACKAGE_VALIDATION_FAILED: 'audit_package.validation_failed.v1',
  AUDIT_PACKAGE_READY: 'audit_package.ready.v1',
  AUDIT_PACKAGE_APPROVED: 'audit_package.approved.v1',
  AUDIT_PACKAGE_FROZEN: 'audit_package.frozen.v1',
  AUDIT_PACKAGE_SUPERSEDED: 'audit_package.superseded.v1',
  // Part 13+14 — Reporting/Notifications + Developer API/Webhooks/Export/Offboarding
  API_CLIENT_CREATED: 'api_client.created.v1',
  API_CLIENT_SUSPENDED: 'api_client.suspended.v1',
  API_CLIENT_REVOKED: 'api_client.revoked.v1',
  API_CLIENT_CREDENTIAL_ROTATED: 'api_client.credential.rotated.v1',
  WEBHOOK_SUBSCRIPTION_CREATED: 'webhook.subscription.created.v1',
  WEBHOOK_SUBSCRIPTION_VERIFIED: 'webhook.subscription.verified.v1',
  WEBHOOK_SUBSCRIPTION_SUSPENDED: 'webhook.subscription.suspended.v1',
  WEBHOOK_DELIVERY_SUCCEEDED: 'webhook.delivery.succeeded.v1',
  WEBHOOK_DELIVERY_FAILED: 'webhook.delivery.failed.v1',
  WEBHOOK_DELIVERY_DEAD_LETTERED: 'webhook.delivery.dead_lettered.v1',
  WEBHOOK_DELIVERY_REPLAYED: 'webhook.delivery.replayed.v1',
  EXPORT_REQUESTED: 'export.requested.v1',
  EXPORT_STARTED: 'export.started.v1',
  EXPORT_READY: 'export.ready.v1',
  EXPORT_PARTIAL: 'export.partial.v1',
  EXPORT_FAILED: 'export.failed.v1',
  EXPORT_EXPIRED: 'export.expired.v1',
  TENANT_OFFBOARDING_STARTED: 'tenant.offboarding.started.v1',
  TENANT_ACCESS_FROZEN: 'tenant.access.frozen.v1',
  TENANT_CONNECTORS_REVOKED: 'tenant.connectors.revoked.v1',
  TENANT_DELETION_STARTED: 'tenant.deletion.started.v1',
  TENANT_DELETION_RECONCILED: 'tenant.deletion.reconciled.v1',
  TENANT_BACKUP_EXPIRY_PENDING: 'tenant.backup_expiry.pending.v1',
  TENANT_DELETION_ATTESTED: 'tenant.deletion.attested.v1',
  TENANT_CLOSED: 'tenant.closed.v1',
} as const;

/** Same envelope shape as shield-ingest's KafkaProducerService — no shared library package exists yet, so each app keeps its own copy of the convention rather than a cross-app import. eventId is the inbox dedup key on the consuming side. */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  tenantId: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  occurredAt: string;
  producedAt: string;
  payload: T;
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'zoiko-shield-core',
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka Producer connected successfully.');
    } catch (error: any) {
      this.logger.error(`Failed to connect Kafka Producer: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publishEvent<T extends { tenantId: string }>(
    topic: string,
    eventType: string,
    payload: T,
    context?: { correlationId?: string; causationId?: string; traceId?: string; occurredAt?: Date },
  ) {
    const producedAt = new Date();
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: '1',
      tenantId: payload.tenantId,
      correlationId: context?.correlationId ?? randomUUID(),
      causationId: context?.causationId,
      traceId: context?.traceId ?? randomUUID(),
      occurredAt: (context?.occurredAt ?? producedAt).toISOString(),
      producedAt: producedAt.toISOString(),
      payload,
    };

    try {
      await this.producer.send({
        topic,
        messages: [{ key: payload.tenantId, value: JSON.stringify(envelope) }],
      });
      this.logger.debug(`Published ${eventType} to ${topic}`);
    } catch (error: any) {
      this.logger.error(`Failed to publish ${eventType} to ${topic}: ${error.message}`);
      throw error;
    }
  }
}
