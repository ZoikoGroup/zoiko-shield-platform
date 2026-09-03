import { Injectable } from '@nestjs/common';
import {
  DetectionRule,
  DetectionInput,
  DetectionResult,
  DetectionFactor,
} from '../../runtime/detection-rule.interface';
import {
  SUSPICIOUS_PROCESS_KEY,
  SuspiciousProcessConfiguration,
  DEFAULT_SUSPICIOUS_PROCESS_CONFIG,
} from './suspicious-process.schema';

/**
 * ZS-PROC-001: Suspicious Credential Dumping Process (MITRE ATT&CK T1003.001)
 * Evaluates OCSF PROCESS_ACTIVITY events for known credential dumpers (e.g. Mimikatz, Procdump, LSASS injection).
 * Governed by ZS-ENG-DRS-001 §07 & ZS-T0-TECH-001 §07.
 */
@Injectable()
export class SuspiciousProcessRule implements DetectionRule {
  readonly key = SUSPICIOUS_PROCESS_KEY;

  evaluate(input: DetectionInput): DetectionResult {
    const config: SuspiciousProcessConfiguration = {
      ...DEFAULT_SUSPICIOUS_PROCESS_CONFIG,
      ...input.configuration,
    };

    const factors: DetectionFactor[] = [];
    const reasons: string[] = [];
    let incompleteData = false;

    const isProcessEvent =
      (input.event.event_class || '').toUpperCase() === 'PROCESS_ACTIVITY' ||
      (input.event.action || '').toUpperCase() === 'EXECUTE';

    if (!isProcessEvent) {
      return {
        result: 'NO_MATCH',
        factors: [{ name: 'EVENT_CLASS_MISMATCH', contribution: 0 }],
        incompleteData: false,
        reasons: ['Event class is not PROCESS_ACTIVITY'],
      };
    }

    const processName = (input.event.resource_id || '').toLowerCase();
    const actionDetails = (input.event.action || '').toLowerCase();

    const nameMatch = config.suspiciousProcessNames.some((name) =>
      processName.includes(name.toLowerCase()),
    );
    const commandMatch = config.suspiciousCommandLinePatterns.some((pat) =>
      actionDetails.includes(pat.toLowerCase()) || processName.includes(pat.toLowerCase()),
    );

    factors.push({
      name: 'SUSPICIOUS_PROCESS_NAME',
      contribution: nameMatch ? 50 : 0,
    });

    factors.push({
      name: 'MALICIOUS_COMMAND_LINE',
      contribution: commandMatch ? 50 : 0,
    });

    if (input.asset) {
      const isCriticalAsset = input.asset.criticality === 'HIGH' || input.asset.criticality === 'CRITICAL';
      factors.push({
        name: 'ASSET_CRITICALITY',
        contribution: isCriticalAsset ? 20 : 5,
      });
    } else {
      factors.push({
        name: 'ASSET_CRITICALITY',
        contribution: 0,
        indeterminate: true,
      });
      incompleteData = true;
      reasons.push('Asset criticality context unresolved');
    }

    if (input.contextHealth === 'PARTIAL' || input.contextHealth === 'STALE') {
      incompleteData = true;
      reasons.push(`Context health is ${input.contextHealth}`);
    }

    if (nameMatch || commandMatch) {
      return {
        result: 'MATCH',
        factors,
        confidence: incompleteData ? 0.75 : 0.95,
        incompleteData,
        reasons: [
          ...reasons,
          `Detected credential dumping activity (Process: '${input.event.resource_id}', Command: '${input.event.action}')`,
        ],
      };
    }

    return {
      result: 'NO_MATCH',
      factors,
      incompleteData,
      reasons: [...reasons, 'No suspicious process patterns detected'],
    };
  }
}
