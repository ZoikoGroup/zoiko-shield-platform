import { Injectable } from '@nestjs/common';
import {
  DetectionRule,
  DetectionInput,
  DetectionResult,
  DetectionFactor,
} from '../../runtime/detection-rule.interface';
import {
  CLOUD_PRIVILEGE_ESCALATION_KEY,
  CloudPrivilegeEscalationConfiguration,
  DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG,
} from './cloud-privilege-escalation.schema';

/**
 * ZS-CLOUD-001: Cloud IAM Privilege Escalation (MITRE ATT&CK T1078.004 / T1098)
 * Evaluates OCSF CLOUD_AUDIT and SECURITY_FINDING events for unauthorized administrative policy assignments.
 * Governed by ZS-ENG-DRS-001 §07 & ZS-T0-TECH-001 §07.
 */
@Injectable()
export class CloudPrivilegeEscalationRule implements DetectionRule {
  readonly key = CLOUD_PRIVILEGE_ESCALATION_KEY;

  evaluate(input: DetectionInput): DetectionResult {
    const config: CloudPrivilegeEscalationConfiguration = {
      ...DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG,
      ...input.configuration,
    };

    const factors: DetectionFactor[] = [];
    const reasons: string[] = [];
    let incompleteData = false;

    const isCloudEvent =
      (input.event.event_class || '').toUpperCase() === 'CLOUD_AUDIT' ||
      (input.event.event_class || '').toUpperCase() === 'SECURITY_FINDING';

    if (!isCloudEvent) {
      return {
        result: 'NO_MATCH',
        factors: [{ name: 'EVENT_CLASS_MISMATCH', contribution: 0 }],
        incompleteData: false,
        reasons: ['Event class is neither CLOUD_AUDIT nor SECURITY_FINDING'],
      };
    }

    const actionName = input.event.action || input.event.event_activity || '';
    const resourceName = input.event.resource_id || '';

    const isEscalationAction = config.escalationActions.some((action) =>
      actionName.toLowerCase().includes(action.toLowerCase()),
    );
    const isSensitivePolicy = config.sensitivePolicies.some((policy) =>
      resourceName.toLowerCase().includes(policy.toLowerCase()) ||
      actionName.toLowerCase().includes(policy.toLowerCase()),
    );

    factors.push({
      name: 'IAM_MUTATION_ACTION',
      contribution: isEscalationAction ? 45 : 0,
    });

    factors.push({
      name: 'ADMINISTRATIVE_PRIVILEGE_TARGET',
      contribution: isSensitivePolicy ? 45 : 10,
    });

    if (!input.identity) {
      factors.push({
        name: 'ACTOR_AUTHORIZATION_CONTEXT',
        contribution: 0,
        indeterminate: true,
      });
      incompleteData = true;
      reasons.push('Actor authorization context unresolved');
    } else {
      const isPrivilegedUser = input.identity.identity_type === 'ROOT' || input.identity.identity_type === 'ADMIN';
      factors.push({
        name: 'ACTOR_AUTHORIZATION_CONTEXT',
        contribution: isPrivilegedUser ? 10 : 30, // Higher risk when standard user executes admin policy attachment
      });
    }

    if (input.contextHealth === 'PARTIAL' || input.contextHealth === 'STALE') {
      incompleteData = true;
      reasons.push(`Context health is ${input.contextHealth}`);
    }

    if (isEscalationAction || isSensitivePolicy) {
      return {
        result: 'MATCH',
        factors,
        confidence: incompleteData ? 0.7 : 0.9,
        incompleteData,
        reasons: [
          ...reasons,
          `Detected Cloud IAM privilege escalation attempt (Action: '${actionName}', Resource: '${resourceName}')`,
        ],
      };
    }

    return {
      result: 'NO_MATCH',
      factors,
      incompleteData,
      reasons: [...reasons, 'No privilege escalation patterns detected'],
    };
  }
}
