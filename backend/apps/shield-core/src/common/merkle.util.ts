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

/**
 * Computes the ZS-MERKLE-V1 Merkle root for an array of leaf string digests.
 */
export function computeDomainSeparatedMerkleRoot(leaves: string[]): string {
  if (!leaves || leaves.length === 0) {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256 of empty
  }

  let level: Buffer[] = leaves.map((l) => hashMerkleLeaf(l));

  while (level.length > 1) {
    const nextLevel: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      nextLevel.push(hashMerkleBranch(left, right));
    }
    level = nextLevel;
  }

  return level[0].toString('hex');
}
