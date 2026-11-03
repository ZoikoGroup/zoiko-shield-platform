import { createHash } from 'crypto';

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

/**
 * Domain-separated leaf hash: SHA256(0x00 || canonical_leaf_bytes)
 */
export function hashMerkleLeaf(canonicalLeafBytes: string): Buffer {
  return sha256(
    Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from(canonicalLeafBytes, 'utf-8'),
    ]),
  );
}

/**
 * Domain-separated branch hash: SHA256(0x01 || left || right)
 */
export function hashMerkleBranch(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/**
 * Computes the ZS-MERKLE-V2 (RFC 6962 §2.1) Merkle root for an array of leaf
 * string digests. Empty input yields SHA-256 of the empty string, as RFC 6962 defines MTH({}).
 */
export function computeDomainSeparatedMerkleRoot(leaves: string[]): string {
  if (!leaves || leaves.length === 0) {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }

  const hashes = leaves.map((l) => hashMerkleLeaf(l));
  const mth = (lo: number, hi: number): Buffer => {
    if (hi - lo === 1) return hashes[lo];
    const mid = lo + splitPoint(hi - lo);
    return hashMerkleBranch(mth(lo, mid), mth(mid, hi));
  };
  return mth(0, hashes.length).toString('hex');
}
