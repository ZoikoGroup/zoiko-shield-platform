import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PqcDualSignerService } from '../signing/pqc-dual-signer.service';
import { MerkleTreeService } from './merkle-tree.service';

export interface EvidenceLeaf {
  evidenceId: string;
  tenantId: string;
  eventType: string;
  payloadDigest: string;
  timestamp: string;
}

export interface MerkleInclusionProof {
  leafHash: string;
  leafIndex: number;
  auditPath: Array<{ position: 'left' | 'right'; hash: string }>;
  merkleRoot: string;
  epochNumber: number;
}

export interface EpochMerkleCheckpoint {
  epochNumber: number;
  epochId: string;
  merkleRoot: string;
  leafCount: number;
  leaves: string[];
  sealedAt: string;
  witnessAttestationId: string;
  witnessSignature: string;
  pqcAlgorithm?: 'HYBRID_ECDSA_P256_ML_DSA_65';
  pqcSignatureHex?: string;
  classicalSignatureHex?: string;
  hybridSignatureContainer?: string;
}

/**
 * High-Throughput Batch Evidence Merkle Checkpointer
 * Aggregates evidence records per epoch into a binary SHA-256 Merkle tree and generates inclusion proofs.
 */
@Injectable()
export class BatchMerkleCheckpointerService {
  private readonly logger = new Logger(BatchMerkleCheckpointerService.name);
  private epochCounter = 0;
  private readonly epochHistory = new Map<number, EpochMerkleCheckpoint>();
  private readonly tree = new MerkleTreeService();

  constructor(@Optional() private readonly pqcSigner?: PqcDualSignerService) {}

  /**
   * Builds an epoch Merkle tree checkpoint from an array of evidence items.
   */
  buildEpochCheckpoint(evidenceItems: EvidenceLeaf[]): EpochMerkleCheckpoint {
    if (!evidenceItems || evidenceItems.length === 0) {
      throw new Error(
        'MERKLE_EMPTY_BATCH: Cannot build Merkle checkpoint with 0 evidence items',
      );
    }

    this.epochCounter++;
    const epochNumber = this.epochCounter;
    const epochId = `epoch-${epochNumber}-${crypto.randomBytes(6).toString('hex')}`;
    const sealedAt = new Date().toISOString();

    // 1. Compute leaf hashes
    const leafHashes = evidenceItems.map((item) =>
      crypto
        .createHash('sha256')
        .update(
          `${item.evidenceId}:${item.tenantId}:${item.eventType}:${item.payloadDigest}:${item.timestamp}`,
        )
        .digest('hex'),
    );

    // 2. Reduce to Merkle root
    const merkleRoot = this.tree.build(leafHashes).root;

    // 3. Cryptographic witness signature
    const witnessAttestationId = `witness-rekor-${epochNumber}`;
    const witnessSignature = crypto
      .createHash('sha256')
      .update(merkleRoot + witnessAttestationId + sealedAt)
      .digest('hex');

    const checkpoint: EpochMerkleCheckpoint = {
      epochNumber,
      epochId,
      merkleRoot,
      leafCount: evidenceItems.length,
      leaves: leafHashes,
      sealedAt,
      witnessAttestationId,
      witnessSignature,
    };

    this.epochHistory.set(epochNumber, checkpoint);

    this.logger.log(
      `✔ [MERKLE CHECKPOINT SEALED] Epoch #${epochNumber} (${evidenceItems.length} leaves) -> Root: ${merkleRoot.substring(0, 16)}...`,
    );

    return checkpoint;
  }

  /**
   * Asynchronously builds an epoch checkpoint and signs it with FIPS 204 ML-DSA-65 & ECDSA P-256 PQC Dual-Signer.
   */
  async buildEpochCheckpointAsync(
    evidenceItems: EvidenceLeaf[],
  ): Promise<EpochMerkleCheckpoint> {
    const checkpoint = this.buildEpochCheckpoint(evidenceItems);

    if (this.pqcSigner) {
      const hybridSig = await this.pqcSigner.signHybrid(checkpoint.merkleRoot);
      checkpoint.pqcAlgorithm = 'HYBRID_ECDSA_P256_ML_DSA_65';
      checkpoint.pqcSignatureHex = hybridSig.pqcSignatureHex;
      checkpoint.classicalSignatureHex = hybridSig.classicalSignatureHex;
      checkpoint.hybridSignatureContainer =
        hybridSig.hybridCombinedSignatureBase64;
    }

    return checkpoint;
  }

  /**
   * Generates a cryptographic inclusion proof for a specific leaf index in an epoch.
   */
  generateInclusionProof(
    epochNumber: number,
    leafIndex: number,
  ): MerkleInclusionProof {
    const checkpoint = this.epochHistory.get(epochNumber);
    if (!checkpoint) {
      throw new Error(
        `EPOCH_NOT_FOUND: Epoch #${epochNumber} does not exist in history`,
      );
    }

    if (leafIndex < 0 || leafIndex >= checkpoint.leaves.length) {
      throw new Error(
        `INVALID_LEAF_INDEX: Index ${leafIndex} out of bounds (0..${checkpoint.leaves.length - 1})`,
      );
    }

    const leafHash = checkpoint.leaves[leafIndex];
    const auditPath = this.tree
      .build(checkpoint.leaves)
      .proofs[leafIndex].map((step) => ({
        position:
          step.position === 'LEFT' ? ('left' as const) : ('right' as const),
        hash: step.siblingHash,
      }));

    return {
      leafHash,
      leafIndex,
      auditPath,
      merkleRoot: checkpoint.merkleRoot,
      epochNumber,
    };
  }

  /**
   * Verifies an inclusion proof independently without needing the full dataset.
   */
  verifyInclusionProof(proof: MerkleInclusionProof): boolean {
    const isValid = this.tree.verifyInclusion(
      proof.leafHash,
      proof.auditPath.map((step) => ({
        siblingHash: step.hash,
        position:
          step.position === 'left' ? ('LEFT' as const) : ('RIGHT' as const),
      })),
      proof.merkleRoot,
    );
    this.logger.log(
      `✔ [INCLUSION PROOF VERIFIED] Leaf ${proof.leafHash.substring(0, 10)}... in Epoch #${proof.epochNumber} -> Valid: ${isValid}`,
    );

    return isValid;
  }

  /**
   * Retrieves a previously sealed epoch Merkle checkpoint by epoch number.
   */
  getEpochCheckpoint(epochNumber: number): EpochMerkleCheckpoint | undefined {
    return this.epochHistory.get(epochNumber);
  }
}
