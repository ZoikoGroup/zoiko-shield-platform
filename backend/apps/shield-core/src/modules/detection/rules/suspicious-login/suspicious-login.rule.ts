import { Injectable } from '@nestjs/common';
import {
  DetectionRule,
  DetectionInput,
  DetectionResult,
  DetectionFactor,
} from '../../runtime/detection-rule.interface';
import {
  SUSPICIOUS_LOGIN_KEY,
  SuspiciousLoginConfiguration,
  DEFAULT_SUSPICIOUS_LOGIN_CONFIG,
} from './suspicious-login.schema';

/**
 * Spec §21/§22: outcome == FAILURE AND identity is privileged AND risk
 * state meets threshold. The canonical Entra sign-in payload today has no
 * directory-role/privileged flag, so that factor is honestly reported
 * INDETERMINATE rather than assumed false or invented — this rule can
 * currently reach MATCH only via the factors it can actually observe
 * (failed outcome), and is INDETERMINATE whenever the privileged-identity
 * factor can't be resolved, never silently NO_MATCH.
 */
@Injectable()
export class SuspiciousLoginRule implements DetectionRule {
  readonly key = SUSPICIOUS_LOGIN_KEY;

  evaluate(input: DetectionInput): DetectionResult {
    const config: SuspiciousLoginConfiguration = {
      ...DEFAULT_SUSPICIOUS_LOGIN_CONFIG,
      ...input.configuration,
    };

    const factors: DetectionFactor[] = [];
    const reasons: string[] = [];
    let incompleteData = false;

    const outcomeFailed =
      (input.event.outcome || '').toUpperCase() === 'FAILURE';
    factors.push({
      name: 'FAILED_OUTCOME',
      contribution: outcomeFailed ? 40 : 0,
    });

    let privilegedIdentity: boolean | undefined;
    if (!input.identity) {
      privilegedIdentity = undefined;
      factors.push({
        name: 'PRIVILEGED_IDENTITY',
        contribution: 0,
        indeterminate: true,
      });
      incompleteData = true;
      reasons.push(
        'Identity context unresolved — privileged-identity factor is INDETERMINATE, not assumed false',
      );
    } else {
      privilegedIdentity = config.privilegedIdentityTypes.includes(
        input.identity.identity_type,
      );
      factors.push({
        name: 'PRIVILEGED_IDENTITY',
        contribution: privilegedIdentity ? 40 : 0,
      });
    }

    if (input.contextHealth === 'PARTIAL' || input.contextHealth === 'STALE') {
      incompleteData = true;
      reasons.push(
        `Context health is ${input.contextHealth} — result confidence reduced`,
      );
    }

    if (!outcomeFailed) {
      return {
        result: 'NO_MATCH',
        factors,
        incompleteData,
        reasons: [...reasons, 'Sign-in outcome was not FAILURE'],
      };
    }

    if (privilegedIdentity === undefined) {
      return {
        result: 'INDETERMINATE',
        factors,
        incompleteData: true,
        reasons: [
          ...reasons,
          'Cannot determine privileged-identity factor required by this rule',
        ],
      };
    }

    if (outcomeFailed && privilegedIdentity) {
      return {
        result: 'MATCH',
        factors,
        confidence: incompleteData ? 0.6 : 0.85,
        incompleteData,
        reasons: [...reasons, 'Failed sign-in for a privileged identity'],
      };
    }

    return {
      result: 'NO_MATCH',
      factors,
      incompleteData,
      reasons: [...reasons, 'Identity is not privileged'],
    };
  }
}
