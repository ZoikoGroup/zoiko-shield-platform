import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Same canonicalization + SHA-256 algorithm as shield-core's
 * ContentHashService (apps/shield-core/src/modules/evidence/hashing/content-hash.service.ts)
 * — duplicated deliberately (no shared package exists yet) so
 * shield-action can independently recompute the approved_material_hash
 * from the ActionAuthorizationContext fields it received and fail closed
 * on mismatch (spec correction #3), rather than trusting shield-core's
 * stored hash blindly.
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
