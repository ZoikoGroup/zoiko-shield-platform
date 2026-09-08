/**
 * Standalone Zero-Dependency Merkle Verifier (ZS-MERKLE-V1 Profile)
 *
 * Implements offline cryptographic verification of ZoikoShield audit packages
 * with zero dependencies on platform-internal code or services.
 *
 * Specification: ZS-T0-AUD-001 §4 / TUT-05 (Zero-Dependency Offline Verifier)
 */
import { createHash } from 'crypto';

export const STANDALONE_TREE_PROFILE = 'ZS-MERKLE-V1';
export const STANDALONE_HASH_ALGORITHM = 'SHA-256';

export interface MerkleProofStep {
  siblingHash: string;
  position: 'LEFT' | 'RIGHT';
}

export interface StandaloneMerkleBuildResult {
  root: string;
  proofs: Record<number, MerkleProofStep[]>;
  treeProfile: string;
  hashAlgorithm: string;
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

export class StandaloneMerkleVerifier {
  /**
   * Domain-separated leaf hash: SHA256(0x00 || canonical_leaf_bytes)
   */
  hashLeaf(canonicalLeafBytes: string): Buffer {
    return sha256(
      Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from(canonicalLeafBytes, 'utf-8'),
      ]),
    );
  }

  /**
   * Domain-separated branch hash: SHA256(0x01 || left_bytes || right_bytes)
   */
  hashBranch(left: Buffer, right: Buffer): Buffer {
    return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
  }

  /**
   * Builds the Merkle root and inclusion proofs for an array of canonical leaf strings.
   */
  build(leaves: string[]): StandaloneMerkleBuildResult {
    if (!leaves || leaves.length === 0) {
      throw new Error('StandaloneMerkleVerifier: requires at least one leaf');
    }

    let level: Buffer[] = leaves.map((l) => this.hashLeaf(l));
    const path: MerkleProofStep[][] = leaves.map(() => []);
    let indexMap: number[] = leaves.map((_, i) => i);

    while (level.length > 1) {
      const nextLevel: Buffer[] = [];
      const nextIndexMap: number[] = new Array(indexMap.length);

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i]; // Duplicate last node on odd count
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
      treeProfile: STANDALONE_TREE_PROFILE,
      hashAlgorithm: STANDALONE_HASH_ALGORITHM,
    };
  }

  /**
   * Recomputes the root from a leaf's canonical bytes and its proof path.
   */
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
