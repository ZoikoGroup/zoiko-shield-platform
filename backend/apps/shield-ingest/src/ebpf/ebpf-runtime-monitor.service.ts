import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type EbpfSyscallType =
  | 'sys_enter_execve'
  | 'sys_enter_connect'
  | 'sys_enter_ptrace'
  | 'container_escape_attempt';

export interface RawEbpfProbeEvent {
  probeId: string;
  hostName: string;
  containerId?: string;
  containerName?: string;
  syscall: EbpfSyscallType;
  pid: number;
  uid: number;
  binaryPath: string;
  commandLine: string;
  targetAddress?: string;
  targetPid?: number;
  timestampEpochNs: number;
}

export interface OcsfContainerRuntimeFinding {
  findingId: string;
  classUid: 4001 | 4002; // OCSF Process Activity or Container Runtime
  categoryUid: 4; // System Activity
  severityId: 1 | 3 | 5 | 6; // Informational, Medium, High, Fatal/Critical
  activityId: number;
  actor: {
    process: {
      pid: number;
      binaryPath: string;
      commandLine: string;
    };
    user: {
      uid: number;
    };
  };
  container?: {
    id: string;
    name: string;
  };
  threatDetails?: {
    isBreakoutAttempt: boolean;
    ruleName: string;
    mitreTechniqueId: string;
  };
  canonicalHash: string;
  ingestedAt: string;
}

/**
 * eBPF Kernel Probe Telemetry Ingest & Container Runtime Monitor
 * Specification: ZS-T0-BE-ARCH-001 §12 (Zero-Copy Kernel Telemetry & Container Defense)
 */
@Injectable()
export class EbpfRuntimeMonitorService {
  private readonly logger = new Logger(EbpfRuntimeMonitorService.name);

  /**
   * Ingests and normalizes high-performance Linux eBPF probe telemetry to OCSF schema.
   */
  processEbpfProbe(raw: RawEbpfProbeEvent): OcsfContainerRuntimeFinding {
    const findingId = `ebpf-finding-${crypto.randomUUID()}`;
    const ingestedAt = new Date().toISOString();

    let severityId: 1 | 3 | 5 | 6 = 1;
    let threatDetails: OcsfContainerRuntimeFinding['threatDetails'] | undefined;

    // Detect Container Breakout / Privilege Escalation Attacks
    if (
      raw.syscall === 'container_escape_attempt' ||
      (raw.containerId && raw.binaryPath === '/nsenter')
    ) {
      severityId = 6; // Critical
      threatDetails = {
        isBreakoutAttempt: true,
        ruleName: 'EBPF-RULE-CONTAINER-ESCAPE-DETECTED',
        mitreTechniqueId: 'T1611', // Escape to Host
      };
      this.logger.error(
        `🚨 [EBPF CONTAINER ESCAPE DETECTED] Host: ${raw.hostName} Container: ${raw.containerName || raw.containerId} Process: ${raw.binaryPath}`,
      );
    } else if (raw.syscall === 'sys_enter_ptrace') {
      severityId = 5; // High
      threatDetails = {
        isBreakoutAttempt: false,
        ruleName: 'EBPF-RULE-PROCESS-INJECTION-PTRACE',
        mitreTechniqueId: 'T1055', // Process Injection
      };
      this.logger.warn(
        `🚨 [EBPF PTRACE INJECTION] Host: ${raw.hostName} Target PID: ${raw.targetPid} by PID: ${raw.pid}`,
      );
    }

    const canonicalHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ findingId, raw, ingestedAt }))
      .digest('hex');

    return {
      findingId,
      classUid: raw.containerId ? 4002 : 4001,
      categoryUid: 4,
      severityId,
      activityId: 1,
      actor: {
        process: {
          pid: raw.pid,
          binaryPath: raw.binaryPath,
          commandLine: raw.commandLine,
        },
        user: {
          uid: raw.uid,
        },
      },
      container: raw.containerId
        ? {
            id: raw.containerId,
            name: raw.containerName || 'k8s-pod',
          }
        : undefined,
      threatDetails,
      canonicalHash,
      ingestedAt,
    };
  }
}
