import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  MerkleTreeService,
  TREE_PROFILE_V2,
} from '../merkle/merkle-tree.service';

export interface AnchorEmailManifestInput {
  manifestId: string;
  tenantId: string;
  canonicalEventHashes: string[];
  sourceInventory: Array<Record<string, unknown>>;
  exclusions: Array<Record<string, unknown>>;
  coverageGaps: Array<Record<string, unknown>>;
  verifierVersion?: string;
}

export interface VerifyEmailManifestInput {
  canonicalEventHashes: string[];
  sourceInventory: Array<Record<string, unknown>>;
  exclusions: Array<Record<string, unknown>>;
  coverageGaps: Array<Record<string, unknown>>;
  expectedMerkleRoot: string;
  expectedDetachedChecksum: string;
}

/**
 * Cryptographic Email Evidence Manifest Anchoring & Gap-Honest Verification (WF-09, T14, T15, E09).
 * Uses `TREE_PROFILE_V2` (RFC 6962) and never equates a valid Merkle proof with full source completeness.
 */
@Injectable()
export class EmailEvidenceService {
  constructor(private readonly merkleTree: MerkleTreeService) {}

  anchorManifest(input: AnchorEmailManifestInput) {
    const leaves =
      input.canonicalEventHashes.length > 0
        ? input.canonicalEventHashes
        : ['EMPTY_CAPTURED_SET'];
    const built = this.merkleTree.build(leaves, TREE_PROFILE_V2);
    const detachedChecksum = this.computeDetachedChecksum({
      merkleRoot: built.root,
      canonicalEventHashes: input.canonicalEventHashes,
      sourceInventory: input.sourceInventory,
      exclusions: input.exclusions,
      coverageGaps: input.coverageGaps,
    });

    const hasKnownGaps =
      input.coverageGaps.length > 0 || input.exclusions.length > 0;

    return {
      manifestId: input.manifestId,
      tenantId: input.tenantId,
      merkleRoot: built.root,
      treeProfile: built.treeProfile,
      hashAlgorithm: built.hashAlgorithm,
      proofsByLeafIndex: built.proofs,
      detachedChecksum,
      verifierVersion: input.verifierVersion || '1.0.0',
      hasKnownGaps,
      status: input.canonicalEventHashes.length > 0 ? 'SEALED' : 'SEALED',
      assuranceStatement: hasKnownGaps
        ? 'The captured evidence is intact. Some source events may be missing for this period.'
        : 'Captured evidence hashes anchored; refer to source coverage denominator and policy versions.',
    };
  }

  verifyManifest(input: VerifyEmailManifestInput) {
    const leaves =
      input.canonicalEventHashes.length > 0
        ? input.canonicalEventHashes
        : ['EMPTY_CAPTURED_SET'];
    const recomputedTree = this.merkleTree.build(leaves, TREE_PROFILE_V2);
    const recomputedChecksum = this.computeDetachedChecksum({
      merkleRoot: recomputedTree.root,
      canonicalEventHashes: input.canonicalEventHashes,
      sourceInventory: input.sourceInventory,
      exclusions: input.exclusions,
      coverageGaps: input.coverageGaps,
    });

    const rootMatches = recomputedTree.root === input.expectedMerkleRoot;
    const checksumMatches =
      recomputedChecksum === input.expectedDetachedChecksum;
    const verified = rootMatches && checksumMatches;
    const hasKnownGaps =
      input.coverageGaps.length > 0 || input.exclusions.length > 0;

    return {
      verified,
      status: verified ? 'VERIFIED' : 'VERIFICATION_FAILED',
      rootMatches,
      checksumMatches,
      recomputedMerkleRoot: recomputedTree.root,
      recomputedDetachedChecksum: recomputedChecksum,
      hasKnownGaps,
      missingPeriodsCount: input.coverageGaps.length,
      exclusionsCount: input.exclusions.length,
      statement: !verified
        ? 'Verification failed: canonical event hashes or manifest checksum do not match anchored root.'
        : hasKnownGaps
          ? 'The captured evidence is intact. Some source events may be missing for this period.'
          : 'The captured evidence is intact and matches the anchored Merkle root.',
    };
  }

  private computeDetachedChecksum(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
  }
}
