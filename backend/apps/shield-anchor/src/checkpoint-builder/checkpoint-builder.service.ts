import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAnchorHeadService } from '../tenant-chain-head/tenant-anchor-head.service';
import { MerkleTreeService } from '../merkle/merkle-tree.service';
import { Inject } from '@nestjs/common';
import type { CheckpointSigner } from '../signing/checkpoint-signer.interface';
import { CHECKPOINT_SIGNER } from '../signing/checkpoint-signer.token';
import { SigningKeyService } from '../key-management/signing-key.service';
import { WitnessService } from '../witnesses/witness.service';

export interface BuildCheckpointInput {
  tenantId: string;
  ledgerSequence: number;
  ledgerHeadHash: string;
  packageId?: string;
  packageVersion?: number;
  manifestCoreHash?: string;
}

/**
 * Anchors a commitment built from the ledger head + package material —
 * never validates continuity against a previous ledgerSequence (the same
 * ledger head may be anchored by multiple packages/checkpoints, spec
 * correction #4). The only continuity enforced here is the anchor's own
 * sequence via TenantAnchorHeadService's CAS — that IS the
 * anti-equivocation guarantee.
 */
@Injectable()
export class CheckpointBuilderService {
  private readonly logger = new Logger(CheckpointBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAnchorHeadService: TenantAnchorHeadService,
    private readonly merkleTreeService: MerkleTreeService,
    @Inject(CHECKPOINT_SIGNER) private readonly signer: CheckpointSigner,
    private readonly signingKeyService: SigningKeyService,
    private readonly witnessService: WitnessService,
  ) {}

  async build(input: BuildCheckpointInput) {
    const head = await this.tenantAnchorHeadService.readHead(input.tenantId);
    const anchorSequence = head.last_anchor_sequence + 1;

    const leaves = [input.ledgerHeadHash, input.manifestCoreHash].filter(
      (v): v is string => !!v,
    );
    const merkleResult = this.merkleTreeService.build(leaves);
    const signResult = await this.signer.sign(merkleResult.root);
    await this.signingKeyService.recordIfNew(
      signResult.signingKeyId,
      signResult.algorithm,
      signResult.publicKey,
    );

    const checkpointId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.tenantAnchorHead.updateMany({
        where: { tenant_id: input.tenantId, version: head.version },
        data: {
          last_anchor_sequence: anchorSequence,
          last_checkpoint_id: checkpointId,
          last_checkpoint_hash: merkleResult.root,
          version: head.version + 1,
        },
      });
      if (cas.count !== 1) {
        throw new ConflictException(
          `TenantAnchorHead for '${input.tenantId}' was concurrently updated — retry, do not fork`,
        );
      }

      await tx.checkpoint.create({
        data: {
          id: checkpointId,
          tenant_id: input.tenantId,
          anchor_sequence: anchorSequence,
          ledger_sequence: input.ledgerSequence,
          ledger_head_hash: input.ledgerHeadHash,
          package_id: input.packageId,
          package_version: input.packageVersion,
          manifest_core_hash: input.manifestCoreHash,
          leaf_hashes: JSON.stringify(leaves),
          merkle_root: merkleResult.root,
          tree_profile: merkleResult.treeProfile,
          hash_algorithm: merkleResult.hashAlgorithm,
          canonicalization_profile: 'zs-checkpoint-v1',
          signing_key_id: signResult.signingKeyId,
          signature: signResult.signature,
          status: 'SIGNED',
        },
      });
    });

    const witnessOutcome = await this.witnessService.collectReceipts(
      checkpointId,
      merkleResult.root,
    );
    const checkpoint = await this.prisma.checkpoint.update({
      where: { id: checkpointId },
      data: {
        witness_assurance_state: witnessOutcome.witnessAssuranceState,
        status: 'PUBLISHED',
        published_at: new Date(),
      },
    });

    const proofsByLeafIndex: Record<string, unknown> = {};
    for (const [idx, proof] of Object.entries(merkleResult.proofs)) {
      proofsByLeafIndex[idx] = proof;
    }

    return {
      checkpoint,
      merkleRoot: merkleResult.root,
      proofsByLeafIndex,
      signature: signResult.signature,
      signingKey: {
        keyId: signResult.signingKeyId,
        publicKey: signResult.publicKey,
        algorithm: signResult.algorithm,
        status: 'ACTIVE',
      },
      witnessReceipts: witnessOutcome.receipts.map((r) => ({
        witnessId: r.witness_id,
        witnessType: r.witness_type,
        receiptHash: r.receipt_hash,
        signature: r.signature,
        publicKey: r.public_key,
        algorithm: r.algorithm,
        status: r.status,
      })),
      witnessAssuranceState: witnessOutcome.witnessAssuranceState,
    };
  }
}
