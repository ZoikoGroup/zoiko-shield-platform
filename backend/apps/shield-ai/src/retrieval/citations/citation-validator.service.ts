import { Injectable } from '@nestjs/common';

export interface CitationValidationResult {
  valid: boolean;
  validatedCitations: Array<{ sourceType: string; sourceId: string }>;
  invalidRefs: string[];
}

/**
 * Material AI claims must point to actual retrieved sources (spec §11).
 * A citation naming something outside the RetrievalBundle's source_refs
 * is never trusted — it's dropped and the output is flagged DEGRADED,
 * never silently presented as fully supported.
 */
@Injectable()
export class CitationValidatorService {
  validate(
    citedSourceRefs: string[],
    bundleSourceRefs: string[],
  ): CitationValidationResult {
    const bundleSet = new Set(bundleSourceRefs);
    const validatedCitations: Array<{ sourceType: string; sourceId: string }> =
      [];
    const invalidRefs: string[] = [];

    for (const ref of citedSourceRefs) {
      if (bundleSet.has(ref)) {
        const [sourceType, sourceId] = ref.split(':');
        validatedCitations.push({
          sourceType: sourceType.toUpperCase(),
          sourceId,
        });
      } else {
        invalidRefs.push(ref);
      }
    }

    return { valid: invalidRefs.length === 0, validatedCitations, invalidRefs };
  }
}
