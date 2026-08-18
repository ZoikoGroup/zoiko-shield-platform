import { Injectable } from '@nestjs/common';
import {
  CitationValidatorService,
  CitationValidationResult,
} from '../retrieval/citations/citation-validator.service';

export interface EvaluationResult {
  safetyResult: 'PASSED' | 'DEGRADED' | 'REJECTED';
  citations: CitationValidationResult;
  limitations: string[];
}

/**
 * Runs before an AiOutput is ever returned to shield-core (spec §11/§12).
 * Invalid citations degrade the result rather than being silently
 * dropped from view — the caller always learns the output has unverified
 * claims. Limitations always populated, never empty-by-omission.
 */
@Injectable()
export class EvaluationService {
  constructor(private readonly citationValidator: CitationValidatorService) {}

  evaluate(params: {
    citedSourceRefs: string[];
    bundleSourceRefs: string[];
    completenessState: string;
    freshnessState: string;
    modelConfidence?: number;
  }): EvaluationResult {
    const citations = this.citationValidator.validate(
      params.citedSourceRefs,
      params.bundleSourceRefs,
    );
    const limitations: string[] = [];

    if (!citations.valid) {
      limitations.push(
        `${citations.invalidRefs.length} citation(s) could not be validated against retrieved sources and were dropped`,
      );
    }
    if (params.completenessState !== 'COMPLETE') {
      limitations.push(
        `Retrieval completeness is ${params.completenessState} — some relevant evidence may be missing`,
      );
    }
    if (params.freshnessState !== 'CURRENT') {
      limitations.push(
        `Retrieved context freshness is ${params.freshnessState}`,
      );
    }
    if ((params.modelConfidence ?? 1) < 0.4) {
      limitations.push('Model confidence is low');
    }
    if (citations.validatedCitations.length === 0) {
      limitations.push(
        'No validated citations support this output — treat as unverified',
      );
    }

    let safetyResult: EvaluationResult['safetyResult'] = 'PASSED';
    if (!citations.valid || citations.validatedCitations.length === 0) {
      safetyResult = 'DEGRADED';
    }

    return { safetyResult, citations, limitations };
  }
}
