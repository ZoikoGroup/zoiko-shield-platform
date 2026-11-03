import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Legacy profile: pads odd levels by duplicating the last node, so leaf sets
 * [a,b,c] and [a,b,c,c] share a root (the CVE-2012-2459 class). Retained only
 * so checkpoints already anchored under it stay verifiable — never build new
 * trees with it.
 */
export const TREE_PROFILE_V1 = 'ZS-MERKLE-V1';
/** RFC 6962 §2.1 Merkle Tree Hash: split at the largest power of two < n, no padding. */
export const TREE_PROFILE_V2 = 'ZS-MERKLE-V2';
export const TREE_PROFILE = TREE_PROFILE_V2;
export const SUPPORTED_TREE_PROFILES = [TREE_PROFILE_V1, TREE_PROFILE_V2];
export type TreeProfile = typeof TREE_PROFILE_V1 | typeof TREE_PROFILE_V2;
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

/** Largest power of two strictly less than n (n >= 2). */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function isValidTreeSize(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 1 && n < 2 ** 31;
}

/**
 * leaf hash   = SHA256(0x00 || canonical_leaf_bytes)
 * branch hash = SHA256(0x01 || left_hash_bytes || right_hash_bytes)
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

  isSupportedProfile(profile: string): profile is TreeProfile {
    return SUPPORTED_TREE_PROFILES.includes(profile);
  }

  build(
    leaves: string[],
    profile: TreeProfile = TREE_PROFILE,
  ): MerkleBuildResult {
    if (leaves.length === 0) {
      throw new Error('MerkleTreeService.build requires at least one leaf');
    }
    if (!this.isSupportedProfile(profile)) {
      throw new Error(
        `MerkleTreeService.build: unsupported tree profile ${profile}`,
      );
    }

    const leafHashes = leaves.map((l) => this.hashLeaf(l));
    const { root, paths } =
      profile === TREE_PROFILE_V1
        ? this.buildLegacyV1(leafHashes)
        : this.buildRfc6962(leafHashes);

    const proofs: Record<number, MerkleProofStep[]> = {};
    paths.forEach((p, i) => {
      proofs[i] = p;
    });

    return {
      root: root.toString('hex'),
      proofs,
      treeProfile: profile,
      hashAlgorithm: HASH_ALGORITHM,
    };
  }

  /** Convenience alias to compute the Merkle root directly from leaves. */
  computeRoot(leaves: string[], profile: TreeProfile = TREE_PROFILE): string {
    return this.build(leaves, profile).root;
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

  /**
   * RFC 6962 §2.1.2 consistency proof that the first `oldSize` leaves of
   * `leaves` form a prefix of the full tree. ZS-MERKLE-V2 only.
   */
  consistencyProof(oldSize: number, leaves: string[]): string[] {
    const n = leaves.length;
    if (!isValidTreeSize(n) || !isValidTreeSize(oldSize) || oldSize > n) {
      throw new Error(
        `MerkleTreeService.consistencyProof: invalid sizes old=${oldSize} new=${n}`,
      );
    }
    const hashes = leaves.map((l) => this.hashLeaf(l));
    const mth = (lo: number, hi: number): Buffer =>
      this.subtreeRoot(hashes, lo, hi);

    const subproof = (
      m: number,
      lo: number,
      hi: number,
      complete: boolean,
    ): Buffer[] => {
      const size = hi - lo;
      if (m === size) return complete ? [] : [mth(lo, hi)];
      const k = splitPoint(size);
      if (m <= k)
        return [...subproof(m, lo, lo + k, complete), mth(lo + k, hi)];
      return [...subproof(m - k, lo + k, hi, false), mth(lo, lo + k)];
    };

    return subproof(oldSize, 0, n, true).map((b) => b.toString('hex'));
  }

  /** RFC 9162 §2.1.4.2 consistency proof verification. */
  verifyConsistency(
    oldSize: number,
    newSize: number,
    oldRoot: string,
    newRoot: string,
    proof: string[],
  ): boolean {
    if (
      !isValidTreeSize(oldSize) ||
      !isValidTreeSize(newSize) ||
      oldSize > newSize
    ) {
      return false;
    }
    if (oldSize === newSize) {
      return proof.length === 0 && oldRoot === newRoot;
    }

    let path: Buffer[] = proof.map((h) => Buffer.from(h, 'hex'));
    if (isPowerOfTwo(oldSize)) path = [Buffer.from(oldRoot, 'hex'), ...path];
    if (path.length === 0) return false;

    let fn = oldSize - 1;
    let sn = newSize - 1;
    while (fn % 2 === 1) {
      fn = Math.floor(fn / 2);
      sn = Math.floor(sn / 2);
    }

    let fr: Buffer = path[0];
    let sr: Buffer = path[0];
    for (const c of path.slice(1)) {
      if (sn === 0) return false;
      if (fn % 2 === 1 || fn === sn) {
        fr = this.hashBranch(c, fr);
        sr = this.hashBranch(c, sr);
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      } else {
        sr = this.hashBranch(sr, c);
      }
      fn = Math.floor(fn / 2);
      sn = Math.floor(sn / 2);
    }

    return (
      sn === 0 &&
      fr.toString('hex') === oldRoot &&
      sr.toString('hex') === newRoot
    );
  }

  private subtreeRoot(hashes: Buffer[], lo: number, hi: number): Buffer {
    if (hi - lo === 1) return hashes[lo];
    const k = splitPoint(hi - lo);
    return this.hashBranch(
      this.subtreeRoot(hashes, lo, lo + k),
      this.subtreeRoot(hashes, lo + k, hi),
    );
  }

  private buildRfc6962(leafHashes: Buffer[]): {
    root: Buffer;
    paths: MerkleProofStep[][];
  } {
    const paths: MerkleProofStep[][] = leafHashes.map(() => []);
    // Subtrees finish before their parent appends, so each path is built bottom-up.
    const rec = (lo: number, hi: number): Buffer => {
      if (hi - lo === 1) return leafHashes[lo];
      const mid = lo + splitPoint(hi - lo);
      const left = rec(lo, mid);
      const right = rec(mid, hi);
      const leftHex = left.toString('hex');
      const rightHex = right.toString('hex');
      for (let i = lo; i < mid; i++)
        paths[i].push({ siblingHash: rightHex, position: 'RIGHT' });
      for (let i = mid; i < hi; i++)
        paths[i].push({ siblingHash: leftHex, position: 'LEFT' });
      return this.hashBranch(left, right);
    };
    return { root: rec(0, leafHashes.length), paths };
  }

  private buildLegacyV1(leafHashes: Buffer[]): {
    root: Buffer;
    paths: MerkleProofStep[][];
  } {
    let level = leafHashes;
    const paths: MerkleProofStep[][] = leafHashes.map(() => []);
    let indexMap: number[] = leafHashes.map((_, i) => i);

    while (level.length > 1) {
      const nextLevel: Buffer[] = [];
      const nextIndexMap: number[] = new Array(indexMap.length);

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i];
        const parentIndex = nextLevel.length;
        nextLevel.push(this.hashBranch(left, right));

        for (let leafIdx = 0; leafIdx < indexMap.length; leafIdx++) {
          if (indexMap[leafIdx] === i) {
            paths[leafIdx].push({
              siblingHash: right.toString('hex'),
              position: 'RIGHT',
            });
            nextIndexMap[leafIdx] = parentIndex;
          } else if (indexMap[leafIdx] === i + 1 && i + 1 < level.length) {
            paths[leafIdx].push({
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

    return { root: level[0], paths };
  }
}
