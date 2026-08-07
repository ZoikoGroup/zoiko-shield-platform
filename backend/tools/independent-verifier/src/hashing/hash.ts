import { createHash } from 'crypto';
import { canonicalize } from '../canonicalization/canonicalize';

export function sha256Hex(bytesOrString: Buffer | string): string {
  return createHash('sha256').update(bytesOrString).digest('hex');
}

export function hashCanonicalJson(value: unknown): { contentHash: string; canonicalBytes: string } {
  const canonicalBytes = canonicalize(value);
  return { contentHash: sha256Hex(canonicalBytes), canonicalBytes };
}
