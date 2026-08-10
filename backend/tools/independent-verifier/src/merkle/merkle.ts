import { createHash } from 'crypto';

export const SUPPORTED_TREE_PROFILES = ['ZS-MERKLE-V1'];

export interface MerkleProofStep {
  siblingHash: string;
  position: 'LEFT' | 'RIGHT';
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

/**
 * Duplicate of shield-anchor's MerkleTreeService algorithm
 * (apps/shield-anchor/src/merkle/merkle-tree.service.ts) — ZS-MERKLE-V1
 * only. The verifier reads treeProfile from the package and REJECTS any
 * other value rather than guessing an algorithm (spec correction #2).
 */
export function isSupportedTreeProfile(profile: string): boolean {
  return SUPPORTED_TREE_PROFILES.includes(profile);
}

function hashLeaf(canonicalLeafBytes: string): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(canonicalLeafBytes, 'utf-8')]));
}

function hashBranch(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

export function verifyInclusion(canonicalLeafBytes: string, proof: MerkleProofStep[], expectedRoot: string): boolean {
  let current = hashLeaf(canonicalLeafBytes);
  for (const step of proof) {
    const sibling = Buffer.from(step.siblingHash, 'hex');
    current = step.position === 'RIGHT' ? hashBranch(current, sibling) : hashBranch(sibling, current);
  }
  return current.toString('hex') === expectedRoot;
}

export function recomputeRootFromLeaves(leaves: string[]): string {
  let level: Buffer[] = leaves.map((l) => hashLeaf(l));
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
