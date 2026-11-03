/**
 * Standalone Zero-Dependency Merkle Verifier (ZS-MERKLE-V1 and ZS-MERKLE-V2 profiles)
 *
 * Implements offline cryptographic verification of ZoikoShield audit packages
 * with zero dependencies on platform-internal code or services. Deliberately
 * duplicates shield-anchor's MerkleTreeService so the verifier never trusts
 * platform code.
 *
 * Architecture: ADR-01 (Zero-Dependency Offline Verifier)
 */
import { createHash } from 'crypto';

/** Legacy: odd levels duplicate the last node. Verify-only for pre-V2 checkpoints. */
export const TREE_PROFILE_V1 = 'ZS-MERKLE-V1';
/** RFC 6962 §2.1 Merkle Tree Hash. */
export const TREE_PROFILE_V2 = 'ZS-MERKLE-V2';
export const STANDALONE_TREE_PROFILE = TREE_PROFILE_V2;
export const SUPPORTED_TREE_PROFILES = [TREE_PROFILE_V1, TREE_PROFILE_V2];
export type TreeProfile = typeof TREE_PROFILE_V1 | typeof TREE_PROFILE_V2;
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

export function isSupportedTreeProfile(
  profile: string,
): profile is TreeProfile {
  return SUPPORTED_TREE_PROFILES.includes(profile);
}

/**
 * Packages issued before tree profiles were versioned carry no profile and
 * were all built under V1. An explicit but unknown profile is rejected.
 */
export function resolveDeclaredTreeProfile(declared: unknown): TreeProfile {
  if (declared === undefined || declared === null || declared === '') {
    return TREE_PROFILE_V1;
  }
  if (typeof declared === 'string' && isSupportedTreeProfile(declared)) {
    return declared;
  }
  throw new Error(`Unsupported Merkle tree profile: ${String(declared)}`);
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
  build(
    leaves: string[],
    profile: TreeProfile = STANDALONE_TREE_PROFILE,
  ): StandaloneMerkleBuildResult {
    if (!leaves || leaves.length === 0) {
      throw new Error('StandaloneMerkleVerifier: requires at least one leaf');
    }
    if (!isSupportedTreeProfile(profile)) {
      throw new Error(
        `StandaloneMerkleVerifier: unsupported tree profile ${profile}`,
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

  /** RFC 9162 §2.1.4.2: proves the tree of `oldSize` is a prefix of the tree of `newSize`. */
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

  private buildRfc6962(leafHashes: Buffer[]): {
    root: Buffer;
    paths: MerkleProofStep[][];
  } {
    const paths: MerkleProofStep[][] = leafHashes.map(() => []);
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
