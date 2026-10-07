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
    this.kafkaConsumer.registerHandler(
      'audit_package.frozen.v1',
      this.handleAuditPackageFrozen.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'assessment.reviewed.v1',
      this.handleAssessmentReviewed.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'exception.expired.v1',
      this.handleExceptionExpired.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'alert.critical.v1',
      this.handleCriticalAlert.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'soar.dual_custody_approval.requested.v1',
      this.handleDualCustodyApprovalRequested.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'billing.quota_threshold.v1',
      this.handleQuotaThreshold.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'jit.elevation_requested.v1',
      this.handleJitElevationRequested.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'incident.declared.v1',
      this.handleIncidentDeclared.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'connector.authorization_failed.v1',
      this.handleConnectorAuthorizationFailed.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'ai.output_blocked.v1',
      this.handleAiOutputBlocked.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'maintenance.scheduled.v1',
      this.handleMaintenanceScheduled.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'billing.invoice_issued.v1',
      this.handleInvoiceIssued.bind(this),
    );
    this.kafkaConsumer.registerHandler(
      'privacy.request_received.v1',
      this.handlePrivacyRequestReceived.bind(this),
    );
  }

  private async handleAuditPackageFrozen(
    envelope: EventEnvelope<{ packageId: string; tenantId: string }>,
  ): Promise<void> {
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

  private async handleAssessmentReviewed(
    envelope: EventEnvelope<{
      assessmentId: string;
      approved: boolean;
      tenantId: string;
    }>,
  ): Promise<void> {
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

  private async handleExceptionExpired(
    envelope: EventEnvelope<{ exceptionId: string; tenantId: string }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'EXCEPTION_EXPIRING',
      recipientPrincipalId: 'tenant-admin',
      templateContext: { exceptionId: envelope.payload.exceptionId },
      correlationId: envelope.correlationId,
    });
  }

  private async handleCriticalAlert(
    envelope: EventEnvelope<{
      alertId: string;
      tenantId: string;
      title: string;
      severity: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'CRITICAL_ALERT_DETECTED',
      recipientPrincipalId: 'soc-lead',
      templateContext: {
        alertId: envelope.payload.alertId,
        title: envelope.payload.title,
        severity: envelope.payload.severity,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleDualCustodyApprovalRequested(
    envelope: EventEnvelope<{
      approvalId: string;
      tenantId: string;
      actionType: string;
      targetRef: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'TWO_MAN_APPROVAL_REQUIRED',
      recipientPrincipalId: 'security-officer',
      templateContext: {
        approvalId: envelope.payload.approvalId,
        actionType: envelope.payload.actionType,
        targetRef: envelope.payload.targetRef,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleQuotaThreshold(
    envelope: EventEnvelope<{
      tenantId: string;
      consumedGb: number;
      limitGb: number;
      percentage: number;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'USAGE_QUOTA_THRESHOLD_EXCEEDED',
      recipientPrincipalId: 'billing-admin',
      templateContext: {
        consumedGb: String(envelope.payload.consumedGb),
        limitGb: String(envelope.payload.limitGb),
        percentage: `${envelope.payload.percentage}%`,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleJitElevationRequested(
    envelope: EventEnvelope<{
      requestId: string;
      tenantId: string;
      principal: string;
      role: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'JIT_ELEVATION_REQUESTED',
      recipientPrincipalId: 'tenant-admin',
      templateContext: {
        requestId: envelope.payload.requestId,
        principal: envelope.payload.principal,
        role: envelope.payload.role,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleIncidentDeclared(
    envelope: EventEnvelope<{
      incidentId: string;
      tenantId: string;
      title: string;
      severity: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'INCIDENT_DECLARED',
      recipientPrincipalId: 'incident-commander',
      templateContext: {
        incidentId: envelope.payload.incidentId,
        title: envelope.payload.title,
        severity: envelope.payload.severity,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleConnectorAuthorizationFailed(
    envelope: EventEnvelope<{
      connectorId: string;
      tenantId: string;
      connectorName: string;
      environmentName?: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'CONNECTOR_AUTHORIZATION_FAILED',
      recipientPrincipalId: 'connector-owner',
      templateContext: {
        connectorId: envelope.payload.connectorId,
        connector_name: envelope.payload.connectorName,
        environment_name: envelope.payload.environmentName || 'Production',
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleAiOutputBlocked(
    envelope: EventEnvelope<{
      useCaseId: string;
      tenantId: string;
      reason: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'AI_OUTPUT_BLOCKED',
      recipientPrincipalId: 'ai-governance-officer',
      templateContext: {
        useCaseId: envelope.payload.useCaseId,
        reason: envelope.payload.reason,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleMaintenanceScheduled(
    envelope: EventEnvelope<{
      maintenanceId: string;
      tenantId: string;
      windowStart: string;
      windowEnd: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'MAINTENANCE_SCHEDULED',
      recipientPrincipalId: 'tenant-admin',
      templateContext: {
        maintenanceId: envelope.payload.maintenanceId,
        windowStart: envelope.payload.windowStart,
        windowEnd: envelope.payload.windowEnd,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handleInvoiceIssued(
    envelope: EventEnvelope<{
      invoiceId: string;
      tenantId: string;
      invoiceNumber: string;
      amountDue: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'INVOICE_ISSUED',
      recipientPrincipalId: 'billing-contact',
      templateContext: {
        invoiceId: envelope.payload.invoiceId,
        invoice_number: envelope.payload.invoiceNumber,
        amount_due_display: envelope.payload.amountDue,
      },
      correlationId: envelope.correlationId,
    });
  }

  private async handlePrivacyRequestReceived(
    envelope: EventEnvelope<{
      requestId: string;
      tenantId: string;
      requestType: string;
    }>,
  ): Promise<void> {
    await this.dispatchService.dispatch({
      tenantId: envelope.payload.tenantId,
      eventId: envelope.eventId,
      eventType: 'PRIVACY_REQUEST_RECEIVED',
      recipientPrincipalId: 'privacy-officer',
      templateContext: {
        requestId: envelope.payload.requestId,
        privacy_request_reference: envelope.payload.requestId,
      },
      correlationId: envelope.correlationId,
    });
  }
}
