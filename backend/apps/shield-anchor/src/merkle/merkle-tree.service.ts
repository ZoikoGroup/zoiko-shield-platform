import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const TREE_PROFILE = 'ZS-MERKLE-V1';
export const HASH_ALGORITHM = 'SHA-256';

export interface MerkleProofStep {
  siblingHash: string;
  position: 'LEFT' | 'RIGHT';
}

export interface MerkleBuildResult {
  root: string;
  proofs: Record<number, MerkleProofStep[]>;
  treeProfile: string;
  hashAlgorithm: string;
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

/**
 * ZS-MERKLE-V1 — domain-separated so a leaf can never be replayed as an
 * internal node (spec correction #2, not a bare unspecified sha256(left+right)
 * contract):
 *   leaf hash   = SHA256(0x00 || canonical_leaf_bytes)
 *   branch hash = SHA256(0x01 || left_hash_bytes || right_hash_bytes)
 * Odd node counts duplicate the last node at that level (documented,
 * deterministic — never silently dropped).
 */
@Injectable()
export class MerkleTreeService {
  hashLeaf(canonicalLeafBytes: string): Buffer {
    return sha256(
      Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from(canonicalLeafBytes, 'utf-8'),
      ]),
    );
  }

  hashBranch(left: Buffer, right: Buffer): Buffer {
    return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
  }

  build(leaves: string[]): MerkleBuildResult {
    if (leaves.length === 0) {
      throw new Error('MerkleTreeService.build requires at least one leaf');
    }

    let level: Buffer[] = leaves.map((l) => this.hashLeaf(l));
    // path[i] accumulates the proof steps for original leaf index i as we ascend.
    const path: MerkleProofStep[][] = leaves.map(() => []);
    // indexMap[i] = this node's index within the current level.
    let indexMap: number[] = leaves.map((_, i) => i);

    while (level.length > 1) {
      const nextLevel: Buffer[] = [];
      const nextIndexMap: number[] = new Array(indexMap.length);

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last node on odd count
        const parentIndex = nextLevel.length;
        nextLevel.push(this.hashBranch(left, right));

        for (let leafIdx = 0; leafIdx < indexMap.length; leafIdx++) {
          if (indexMap[leafIdx] === i) {
            path[leafIdx].push({
              siblingHash: right.toString('hex'),
              position: 'RIGHT',
            });
            nextIndexMap[leafIdx] = parentIndex;
          } else if (indexMap[leafIdx] === i + 1 && i + 1 < level.length) {
            path[leafIdx].push({
              siblingHash: left.toString('hex'),
              position: 'LEFT',
            });
            nextIndexMap[leafIdx] = parentIndex;
          }
        }
      }

      level = nextLevel;
      indexMap = nextIndexMap;
    }

    const proofs: Record<number, MerkleProofStep[]> = {};
    leaves.forEach((_, i) => {
      proofs[i] = path[i];
    });

    return {
      root: level[0].toString('hex'),
      proofs,
      treeProfile: TREE_PROFILE,
      hashAlgorithm: HASH_ALGORITHM,
    };
  }

  /** Recomputes the root from a leaf's canonical bytes + its proof path — used both here and duplicated in the independent verifier. */
  verifyInclusion(
    canonicalLeafBytes: string,
    proof: MerkleProofStep[],
    expectedRoot: string,
  ): boolean {
    let current = this.hashLeaf(canonicalLeafBytes);
    for (const step of proof) {
      const sibling = Buffer.from(step.siblingHash, 'hex');
      current =
        step.position === 'RIGHT'
          ? this.hashBranch(current, sibling)
          : this.hashBranch(sibling, current);
    }
    return current.toString('hex') === expectedRoot;
  }
}
