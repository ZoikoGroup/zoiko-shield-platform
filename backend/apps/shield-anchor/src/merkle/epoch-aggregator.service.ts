import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MerkleTreeService } from './merkle-tree.service';
import { Rfc3161WitnessService } from '../witnesses/rfc3161/rfc3161-witness.service';

export interface TenantEpochInput {
  tenantId: string;
  tenantMerkleRoot: string;
  evidenceRecordsCount: number;
}

export interface EpochSealReceipt {
  epochNumber: number;
  epochId: string;
  globalEpochRoot: string;
  tenantsCount: number;
  totalEvidenceCount: number;
  tsaWitness: {
    witnessType: string;
    serialNumber: string;
    genTime: string;
    signature: string;
  };
  tenantInclusionProofs: Record<string, string[]>; // tenantId -> Merkle audit path
  sealedAt: string;
  epochSealDigest: string;
}

@Injectable()
export class EpochAggregatorService {
  private readonly logger = new Logger(EpochAggregatorService.name);
  private currentEpochNumber = 1001;

  constructor(
    private readonly merkleTreeService: MerkleTreeService,
    private readonly rfc3161WitnessService: Rfc3161WitnessService,
  ) {}

  /**
   * Aggregates tenant Merkle roots into a global epoch checkpoint sealed by RFC 3161 TSA.
   */
  async sealEpoch(tenants: TenantEpochInput[]): Promise<EpochSealReceipt> {
    const epochNumber = this.currentEpochNumber++;
    const epochId = `epoch-${epochNumber}-${crypto.randomUUID().slice(0, 8)}`;

    this.logger.log(
      `Sealing Epoch #${epochNumber} with ${tenants.length} participating tenants...`,
    );

    if (tenants.length === 0) {
      const emptyRoot = crypto
        .createHash('sha256')
        .update('EMPTY_EPOCH')
        .digest('hex');
      const tsaReceipt = await this.rfc3161WitnessService.attest(emptyRoot);
      return {
        epochNumber,
        epochId,
        globalEpochRoot: emptyRoot,
        tenantsCount: 0,
        totalEvidenceCount: 0,
        tsaWitness: {
          witnessType: tsaReceipt.witnessType,
          serialNumber: tsaReceipt.witnessId || 'SN-000',
          genTime: new Date().toISOString(),
          signature: tsaReceipt.signature || 'SIMULATED_TSA_SIG',
        },
        tenantInclusionProofs: {},
        sealedAt: new Date().toISOString(),
        epochSealDigest: crypto
          .createHash('sha256')
          .update(emptyRoot)
          .digest('hex'),
      };
    }

    // Build Domain-Separated Leaves
    const tenantLeaves = tenants.map((t) =>
      crypto
        .createHash('sha256')
        .update(`TENANT_LEAF:${t.tenantId}:${t.tenantMerkleRoot}`)
        .digest('hex'),
    );

    const merkleBuild = this.merkleTreeService.build(tenantLeaves);
    const globalEpochRoot = merkleBuild.root;

    // Attest against RFC 3161 TSA
    const tsaReceipt = await this.rfc3161WitnessService.attest(globalEpochRoot);

    // Extract Inclusion Proofs for each tenant
    const tenantInclusionProofs: Record<string, string[]> = {};
    for (let i = 0; i < tenants.length; i++) {
      const steps = merkleBuild.proofs[i] || [];
      tenantInclusionProofs[tenants[i].tenantId] = steps.map(
        (s) => s.siblingHash,
      );
    }

    const totalEvidenceCount = tenants.reduce(
      (acc, t) => acc + t.evidenceRecordsCount,
      0,
    );

    const epochSealDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          epochNumber,
          globalEpochRoot,
          tsaSig: tsaReceipt.signature,
        }),
      )
      .digest('hex');

    return {
      epochNumber,
      epochId,
      globalEpochRoot,
      tenantsCount: tenants.length,
      totalEvidenceCount,
      tsaWitness: {
        witnessType: tsaReceipt.witnessType,
        serialNumber:
          tsaReceipt.witnessId || `SN-${crypto.randomBytes(4).toString('hex')}`,
        genTime: new Date().toISOString(),
        signature: tsaReceipt.signature || 'SIMULATED_TSA_SIG',
      },
      tenantInclusionProofs,
      sealedAt: new Date().toISOString(),
      epochSealDigest,
    };
  }
}
