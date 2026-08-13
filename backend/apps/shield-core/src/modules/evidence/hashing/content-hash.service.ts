import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const CANONICALIZATION_PROFILE = 'zs-json-v1';

/**
 * SHA-256 over a stable canonical representation (spec §23) — never over
 * an unstable JSON.stringify of an object with non-deterministic key
 * order. Canonicalization sorts keys recursively before serializing.
 */
@Injectable()
export class ContentHashService {
  canonicalize(value: unknown): string {
    return JSON.stringify(this.sortKeysDeep(value));
  }

  hash(bytes: Buffer | string): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  hashCanonicalJson(value: unknown): {
    contentHash: string;
    canonicalBytes: string;
  } {
    const canonicalBytes = this.canonicalize(value);
    return { contentHash: this.hash(canonicalBytes), canonicalBytes };
  }

  private sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeysDeep(item));
    }
    if (value !== null && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortKeysDeep((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  }
}
