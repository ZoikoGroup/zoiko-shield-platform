import {
  EpochAggregatorService,
  TenantEpochInput,
} from './epoch-aggregator.service';
import { MerkleTreeService } from './merkle-tree.service';
import { Rfc3161WitnessService } from '../witnesses/rfc3161/rfc3161-witness.service';

describe('EpochAggregatorService', () => {
  let aggregator: EpochAggregatorService;
  let merkleService: MerkleTreeService;
  let rfc3161Service: Rfc3161WitnessService;

  beforeEach(() => {
    merkleService = new MerkleTreeService();
    rfc3161Service = new Rfc3161WitnessService();
    aggregator = new EpochAggregatorService(merkleService, rfc3161Service);
  });

  it('should seal an epoch with empty tenants list cleanly', async () => {
    const seal = await aggregator.sealEpoch([]);
    expect(seal.epochNumber).toBeGreaterThan(1000);
    expect(seal.tenantsCount).toBe(0);
    expect(seal.globalEpochRoot).toBeDefined();
    expect(seal.tsaWitness.signature).toBeDefined();
  });

  it('should aggregate multiple tenant roots into a global epoch tree and generate inclusion proofs', async () => {
    const tenants: TenantEpochInput[] = [
      {
        tenantId: 'tenant-acme-bank',
        tenantMerkleRoot: 'a'.repeat(64),
        evidenceRecordsCount: 150,
      },
      {
        tenantId: 'tenant-cyber-defense',
        tenantMerkleRoot: 'b'.repeat(64),
        evidenceRecordsCount: 320,
      },
      {
        tenantId: 'tenant-healthcare-vault',
        tenantMerkleRoot: 'c'.repeat(64),
        evidenceRecordsCount: 95,
      },
    ];

    const seal = await aggregator.sealEpoch(tenants);

    expect(seal.tenantsCount).toBe(3);
    expect(seal.totalEvidenceCount).toBe(565);
    expect(seal.globalEpochRoot).toBeDefined();
    expect(seal.tsaWitness.witnessType).toBe('RFC3161_TSA');
    expect(seal.tsaWitness.signature).toBeDefined();
    expect(seal.tenantInclusionProofs['tenant-acme-bank']).toBeDefined();
    expect(seal.tenantInclusionProofs['tenant-cyber-defense']).toBeDefined();
  });
});
