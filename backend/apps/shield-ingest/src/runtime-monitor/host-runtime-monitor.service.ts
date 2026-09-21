import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type HostSyscallType =
  | 'sys_enter_execve'
  | 'sys_enter_connect'
  | 'sys_enter_ptrace'
  | 'container_escape_attempt';

export interface RawHostProbeEvent {
  probeId: string;
  hostName: string;
  containerId?: string;
  containerName?: string;
  syscall: HostSyscallType;
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
 * Host Runtime Kernel Telemetry Ingest & Container Security Monitor
 * Specification: ZS-T0-BE-ARCH-001 §12 (Host Runtime Telemetry & Container Defense)
 */
@Injectable()
export class HostRuntimeMonitorService {
  private readonly logger = new Logger(HostRuntimeMonitorService.name);

  /**
   * Ingests and normalizes host runtime probe telemetry to OCSF schema.
   */
  processHostProbe(raw: RawHostProbeEvent): OcsfContainerRuntimeFinding {
    const findingId = `host-finding-${crypto.randomUUID()}`;
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
        ruleName: 'HOST-RULE-CONTAINER-ESCAPE-DETECTED',
        mitreTechniqueId: 'T1611', // Escape to Host
      };
      this.logger.error(
        `🚨 [CONTAINER ESCAPE DETECTED] Host: ${raw.hostName} Container: ${raw.containerName || raw.containerId} Process: ${raw.binaryPath}`,
      );
    } else if (raw.syscall === 'sys_enter_ptrace') {
      severityId = 5; // High
      threatDetails = {
        isBreakoutAttempt: false,
        ruleName: 'HOST-RULE-PROCESS-INJECTION-PTRACE',
        mitreTechniqueId: 'T1055', // Process Injection
      };
      this.logger.warn(
        `🚨 [HOST PTRACE INJECTION] Host: ${raw.hostName} Target PID: ${raw.targetPid} by PID: ${raw.pid}`,
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
