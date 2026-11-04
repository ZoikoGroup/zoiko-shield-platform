/** Appended to the system prompt so real models report which retrieved sources they used. */
export const CITATION_INSTRUCTION =
  'Respond with a single JSON object. Include a "citedSourceRefs" array listing, ' +
  'verbatim, each sourceRef from the Security Retrieval Context that supports your ' +
  'answer. Use an empty array if no retrieved source supports it. Never invent a sourceRef.';

const CITATION_FIELDS = ['citedSourceRefs', 'citations', 'sourceRefs'] as const;

/**
 * Citations come only from what the model itself returned: its structured
 * citation array, or else retrieved refs it named verbatim in the text.
 * Refs are not filtered against the bundle here — the citation validator
 * must see invented refs so it can degrade the output.
 */
export function extractCitedSourceRefs(
  content: string,
  retrievedSourceRefs: string[],
): string[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      for (const field of CITATION_FIELDS) {
        const value = (parsed as Record<string, unknown>)[field];
        if (Array.isArray(value)) {
          return [
            ...new Set(
              value.filter(
                (v): v is string => typeof v === 'string' && v.length > 0,
              ),
            ),
          ];
        }
      }
    }
  } catch {
    // Not JSON: fall through to verbatim mentions.
  }
  return retrievedSourceRefs.filter(
    (ref) => ref.length > 0 && content.includes(ref),
  );
}
