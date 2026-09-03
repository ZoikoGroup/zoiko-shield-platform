/**
 * CrowdStrike Falcon FDR OCSF v1.1.0 Normalization Adapter
 * Maps Falcon ProcessRollup2 / EDR events into OCSF Class 1007 (PROCESS_ACTIVITY).
 * Governed by ZS-ENG-INT-001 §07 & ZS-ENG-DRS-001 §06.
 */
import { NormalizedOcsfEvent } from './entra.adapter';

export class CrowdStrikeOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const isTerminate = payload.eventSimpleName === 'ProcessTerminate' || payload.activity === 'TERMINATE';
    const isSuspicious =
      (payload.CommandLine && (payload.CommandLine.includes('mimikatz') || payload.CommandLine.includes('powershell -enc'))) ||
      payload.severity === 'CRITICAL' ||
      payload.severity === 'HIGH';

    const actorUserId = payload.UserName || payload.actorUserId || payload.user?.id || 'system';
    const actorEmail = payload.UserEmail || payload.actorEmail || `${actorUserId}@endpoint.local`;

    return {
      eventClass: 'PROCESS_ACTIVITY',
      eventCategory: 'HOST_SYSTEM',
      eventActivity: isTerminate ? 'PROCESS_TERMINATE' : 'PROCESS_LAUNCH',
      severity: isSuspicious ? 'CRITICAL' : 'MEDIUM',
      actorUserId,
      actorEmail,
      sourceIp: payload.LocalIP || payload.sourceIp || '127.0.0.1',
      destinationIp: payload.RemoteIP || payload.destinationIp,
      resourceId: payload.TargetProcessId || payload.ProcessId || payload.FileName || 'proc-unknown',
      resourceType: 'HOST_PROCESS',
      action: isTerminate ? 'TERMINATE' : 'EXECUTE',
      outcome: 'SUCCESS',
      rawPayload: payload,
      unmappedPayload: {
        ComputerName: payload.ComputerName,
        ParentBaseFileName: payload.ParentBaseFileName,
        SHA256HashData: payload.SHA256HashData,
        CommandLine: payload.CommandLine,
        AgentId: payload.AgentId,
      },
    };
  }
}
