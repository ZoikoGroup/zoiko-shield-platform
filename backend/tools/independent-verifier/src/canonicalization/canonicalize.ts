/**
 * Byte-for-byte duplicate of shield-core's ContentHashService canonicalization
 * algorithm (apps/shield-core/src/modules/evidence/hashing/content-hash.service.ts)
 * — deliberately duplicated, no shared package exists between the verifier
 * and the platform (same precedent as shield-action duplicating this same
 * algorithm). Recursive key-sort only — array element order is preserved,
 * not sorted.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}
