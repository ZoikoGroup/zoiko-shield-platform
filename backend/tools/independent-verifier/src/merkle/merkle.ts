import { createHash } from 'crypto';

/** Legacy: odd levels duplicate the last node. Verify-only for pre-V2 checkpoints. */
export const TREE_PROFILE_V1 = 'ZS-MERKLE-V1';
/** RFC 6962 §2.1 Merkle Tree Hash. */
export const TREE_PROFILE_V2 = 'ZS-MERKLE-V2';
export const SUPPORTED_TREE_PROFILES = [TREE_PROFILE_V1, TREE_PROFILE_V2];
export type TreeProfile = typeof TREE_PROFILE_V1 | typeof TREE_PROFILE_V2;

export interface MerkleProofStep {
  siblingHash: string;
  position: 'LEFT' | 'RIGHT';
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

/**
 * Duplicate of shield-anchor's MerkleTreeService algorithm
 * (apps/shield-anchor/src/merkle/merkle-tree.service.ts). The verifier reads
 * treeProfile from the package and REJECTS any other value rather than
 * guessing an algorithm (spec correction #2).
 */
export function isSupportedTreeProfile(profile: string): profile is TreeProfile {
  return SUPPORTED_TREE_PROFILES.includes(profile);
}

function hashLeaf(canonicalLeafBytes: string): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(canonicalLeafBytes, 'utf-8')]));
}

function hashBranch(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

// Inclusion folding is identical for both profiles: positions are carried in the proof.
export function verifyInclusion(canonicalLeafBytes: string, proof: MerkleProofStep[], expectedRoot: string): boolean {
  let current = hashLeaf(canonicalLeafBytes);
  for (const step of proof) {
    const sibling = Buffer.from(step.siblingHash, 'hex');
    current = step.position === 'RIGHT' ? hashBranch(current, sibling) : hashBranch(sibling, current);
  }
  return current.toString('hex') === expectedRoot;
}

export function recomputeRootFromLeaves(leaves: string[], profile: TreeProfile = TREE_PROFILE_V2): string {
  if (leaves.length === 0) {
    throw new Error('recomputeRootFromLeaves requires at least one leaf');
  }
  if (!isSupportedTreeProfile(profile)) {
    throw new Error(`Unsupported Merkle tree profile: ${profile}`);
  }
  const hashes = leaves.map((l) => hashLeaf(l));

  if (profile === TREE_PROFILE_V2) {
    const mth = (lo: number, hi: number): Buffer => {
      if (hi - lo === 1) return hashes[lo];
      const mid = lo + splitPoint(hi - lo);
      return hashBranch(mth(lo, mid), mth(mid, hi));
    };
    return mth(0, hashes.length).toString('hex');
  }

  let level = hashes;
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashBranch(left, right));
    }
    level = next;
  }
  return level[0].toString('hex');
}
