import { Injectable } from '@nestjs/common';
import { EvaluatorInput, EvaluatorOutput, EvaluatorRunner } from '../evaluator-runner.interface';

/**
 * Demo evaluator matching the demo control exactly ("Privileged identities
 * must have MFA enabled" — MFA-only, spec correction #5): every identity in
 * `configuration.expectedPopulation` must have at least one evidence record
 * whose content declares `mfaEnabled: true` for that identity. Coverage
 * gaps in the population always yield PARTIAL, never a silent PASS.
 */
@Injectable()
export class MfaCoverageEvaluator implements EvaluatorRunner {
  readonly key = 'mfa-coverage-evaluator';

  async run(input: EvaluatorInput): Promise<EvaluatorOutput> {
    const expectedPopulation = (input.configuration.expectedPopulation as string[]) ?? [];
    if (expectedPopulation.length === 0) {
      return { result: 'UNKNOWN', rationale: 'No expected population configured', limitations: ['expectedPopulation is empty'] };
    }

    const mfaEnabledIdentities = new Set(
      input.evidenceRecords.filter((r) => r.content?.mfaEnabled === true).map((r) => String(r.content.identityId)),
    );
    const mfaDisabledIdentities = new Set(
      input.evidenceRecords.filter((r) => r.content?.mfaEnabled === false).map((r) => String(r.content.identityId)),
    );

    const missing = expectedPopulation.filter((id) => !mfaEnabledIdentities.has(id) && !mfaDisabledIdentities.has(id));
    const nonCompliant = expectedPopulation.filter((id) => mfaDisabledIdentities.has(id));
    const compliant = expectedPopulation.filter((id) => mfaEnabledIdentities.has(id));

    const limitations: string[] = [];
    if (missing.length > 0) limitations.push(`No MFA evidence found for ${missing.length} of ${expectedPopulation.length} identities: ${missing.join(', ')}`);

    if (nonCompliant.length > 0) {
      return {
        result: 'FAIL',
        rationale: `${nonCompliant.length} privileged identities have MFA disabled: ${nonCompliant.join(', ')}`,
        limitations,
      };
    }
    if (missing.length > 0) {
      return {
        result: compliant.length > 0 ? 'PARTIAL' : 'UNKNOWN',
        rationale: `${compliant.length}/${expectedPopulation.length} privileged identities have confirmed MFA-enabled evidence; the rest have no evidence`,
        limitations,
        confidence: compliant.length / expectedPopulation.length,
      };
    }

    return {
      result: 'PASS',
      rationale: `All ${expectedPopulation.length} privileged identities have MFA-enabled evidence`,
      limitations: [],
      confidence: 1,
    };
  }
}
