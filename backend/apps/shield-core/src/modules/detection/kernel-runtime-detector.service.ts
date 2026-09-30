import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type KernelRuntimeEventType =
  | 'KUBERNETES_CONTAINER_ESCAPE'
  | 'NAMESPACE_PRIVILEGE_ESCALATION'
  | 'UNAUTHORIZED_RAW_SOCKET_CREATION'
  | 'KERNEL_MODULE_TAMPERING'
  | 'EXEC_FROM_MEMFD_ANONYMOUS';

export interface KernelTelemetryEvent {
  eventId: string;
  tenantId: string;
  sourceSensor: 'TETRAGON_PROBE' | 'FALCO_SENSOR' | 'TRACE_KERNEL_PROBE';
  k8sNamespace?: string;
  k8sPodName?: string;
  containerId?: string;
  hostPid: number;
  containerPid: number;
  binaryPath: string;
  parentBinaryPath?: string;
  syscallName: string;
  eventType: KernelRuntimeEventType;
  details: Record<string, any>;
  observedAt: string;
}

export interface KernelThreatFinding {
  findingId: string;
  tenantId: string;
  eventType: KernelRuntimeEventType;
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  threatDetected: boolean;
  affectedK8sWorkload: string;
  mitigationRecommendation: string;
  confidenceScore: number;
  detectedAt: string;
}

@Injectable()
export class KernelRuntimeDetectorService {
  private readonly logger = new Logger(KernelRuntimeDetectorService.name);

  /**
   * Ingests and evaluates in-cluster kernel telemetry and container security runtime events.
   */
  analyzeKernelEvent(event: KernelTelemetryEvent): KernelThreatFinding {
    const findingId = `kernel-find-${randomUUID()}`;
    const workloadStr = `${event.k8sNamespace || 'default'}/${event.k8sPodName || 'unknown-pod'} (PID: ${event.hostPid})`;

    let severity: 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH';
    let recommendation = 'Inspect host container runtime isolation.';
    let confidence = 0.95;

    switch (event.eventType) {
      case 'KUBERNETES_CONTAINER_ESCAPE':
        severity = 'CRITICAL';
        confidence = 0.99;
        recommendation =
          'Immediately isolate host node and terminate compromised container namespace.';
        break;
      case 'NAMESPACE_PRIVILEGE_ESCALATION':
        severity = 'CRITICAL';
        confidence = 0.98;
        recommendation =
          'Revoke container cap_sys_admin and enforce PodSecurityStandards.';
        break;
      case 'KERNEL_MODULE_TAMPERING':
        severity = 'CRITICAL';
        confidence = 0.99;
        recommendation =
          'Kernel integrity compromised. Trigger regional host failover and drain workload.';
        break;
      case 'UNAUTHORIZED_RAW_SOCKET_CREATION':
        severity = 'HIGH';
        confidence = 0.92;
        recommendation = 'Block raw socket network namespace capability.';
        break;
      case 'EXEC_FROM_MEMFD_ANONYMOUS':
        severity = 'HIGH';
        confidence = 0.94;
        recommendation =
          'Fileless execution detected in memory. Quarantining workload process.';
        break;
    }

    this.logger.warn(
      `[KERNEL_RUNTIME_DETECTION] Tenant '${event.tenantId}' threat detected on Workload '${workloadStr}': ${event.eventType} (Severity: ${severity})`,
    );

    return {
      findingId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      severity,
      threatDetected: true,
      affectedK8sWorkload: workloadStr,
      mitigationRecommendation: recommendation,
      confidenceScore: confidence,
      detectedAt: new Date().toISOString(),
    };
  }
}
