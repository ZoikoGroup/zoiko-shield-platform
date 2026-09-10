import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';

export interface SlaAlarm {
  alarmId: string;
  tenantId: string;
  controlId: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARNING';
  reason: string;
  currentMetricValue: number;
  slaThreshold: number;
  triggeredAt: string;
}

export interface ComplianceDriftState {
  tenantId: string;
  status: 'COMPLIANT' | 'DRIFT_WARNING' | 'NON_COMPLIANT';
  overallScore: number;
  activeAlarms: SlaAlarm[];
  evaluatedAt: string;
}

/**
 * Continuous Compliance Drift & SLA Alarm Monitor (§55)
 * 
 * Capabilities:
 * 1. Monitors continuous control assessment results and live telemetry latency.
 * 2. Compares active metrics against SOC 2, ISO 27001, and HIPAA SLA bounds (e.g. latency < 30s, pass rate >= 95%).
 * 3. Triggers structured SLA alarms and publishes to Kafka.
 */
@Injectable()
export class ComplianceDriftMonitorService {
  private readonly logger = new Logger(ComplianceDriftMonitorService.name);
  private readonly tenantStates = new Map<string, ComplianceDriftState>();

  constructor(private readonly kafkaProducer?: KafkaProducerService) {}

  /**
   * Evaluates telemetry latency, connector health, and control scores to identify compliance drift.
   */
  async evaluateComplianceDrift(
    tenantId: string,
    telemetryMetrics: {
      ingestionLatencyMs: number;
      complianceScore: number;
      activeConnectorCount: number;
      unmanagedAdminCount: number;
    },
  ): Promise<ComplianceDriftState> {
    const alarms: SlaAlarm[] = [];
    const now = new Date().toISOString();

    // 1. Ingestion SLA check (Latency < 30,000ms)
    if (telemetryMetrics.ingestionLatencyMs > 30000) {
      alarms.push({
        alarmId: `sla-lat-${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        controlId: 'SOC2-CC6.1-LATENCY',
        severity: 'HIGH',
        reason: `Telemetry ingestion latency (${telemetryMetrics.ingestionLatencyMs}ms) exceeds SLA ceiling of 30,000ms.`,
        currentMetricValue: telemetryMetrics.ingestionLatencyMs,
        slaThreshold: 30000,
        triggeredAt: now,
      });
    }

    // 2. Continuous Assurance overall score check (>= 95.0%)
    if (telemetryMetrics.complianceScore < 95.0) {
      alarms.push({
        alarmId: `sla-score-${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        controlId: 'ISO27001-A.9.2-POSTURE',
        severity: telemetryMetrics.complianceScore < 80.0 ? 'CRITICAL' : 'WARNING',
        reason: `Overall compliance posture score (${telemetryMetrics.complianceScore}%) fell below continuous assurance threshold of 95.0%.`,
        currentMetricValue: telemetryMetrics.complianceScore,
        slaThreshold: 95.0,
        triggeredAt: now,
      });
    }

    // 3. Standing unmanaged admin access check
    if (telemetryMetrics.unmanagedAdminCount > 5) {
      alarms.push({
        alarmId: `sla-admin-${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        controlId: 'SOC2-CC6.1-IAM',
        severity: 'HIGH',
        reason: `Standing unmanaged admin count (${telemetryMetrics.unmanagedAdminCount}) exceeds maximum policy ceiling of 5.`,
        currentMetricValue: telemetryMetrics.unmanagedAdminCount,
        slaThreshold: 5,
        triggeredAt: now,
      });
    }

    const status: ComplianceDriftState['status'] =
      alarms.some((a) => a.severity === 'CRITICAL')
        ? 'NON_COMPLIANT'
        : alarms.length > 0
        ? 'DRIFT_WARNING'
        : 'COMPLIANT';

    const state: ComplianceDriftState = {
      tenantId,
      status,
      overallScore: telemetryMetrics.complianceScore,
      activeAlarms: alarms,
      evaluatedAt: now,
    };

    this.tenantStates.set(tenantId, state);

    if (alarms.length > 0 && this.kafkaProducer) {
      await this.kafkaProducer.publishEvent(
        'canonical.compliance.drift.alarm.v1',
        'compliance.drift.alarm.triggered.v1',
        state,
        { correlationId: crypto.randomUUID() },
      );
    }

    return state;
  }

  getDriftState(tenantId: string): ComplianceDriftState | undefined {
    return this.tenantStates.get(tenantId);
  }
}
