import { Test, TestingModule } from '@nestjs/testing';
import {
  BftMultiWitnessQuorumService,
  BftEpochQuorumRequest,
} from './bft-multi-witness-quorum.service';

describe('BftMultiWitnessQuorumService', () => {
  let service: BftMultiWitnessQuorumService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BftMultiWitnessQuorumService],
    }).compile();

    service = module.get<BftMultiWitnessQuorumService>(
      BftMultiWitnessQuorumService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should authenticate epoch quorum when 3 of 4 witness signatures are valid', () => {
    const request: BftEpochQuorumRequest = {
      epochNumber: 2001,
      merkleRoot:
        'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      totalWitnessNodes: 4,
      requiredThreshold: 3,
      witnessSignatures: [
        {
          witnessNodeId: 'witness-kms-primary',
          witnessType: 'PRIMARY_CLOUD_KMS',
          signatureAlgorithm: 'RSA_PSS_SHA256',
          signatureHex: 'sig-kms-01234567',
          publicKeyFingerprint: 'fp-kms',
          notarizedAt: new Date().toISOString(),
        },
        {
          witnessNodeId: 'witness-attested-hardware-node',
          witnessType: 'EXTERNAL_HARDWARE_ATTESTED',
          signatureAlgorithm: 'ECDSA_P256',
          signatureHex: 'sig-hardware-01234567',
          publicKeyFingerprint: 'fp-attested',
          notarizedAt: new Date().toISOString(),
        },
        {
          witnessNodeId: 'witness-pqc-ml-dsa',
          witnessType: 'POST_QUANTUM_NOTARY',
          signatureAlgorithm: 'FIPS_204_ML_DSA_65',
          signatureHex: 'sig-pqc-01234567',
          publicKeyFingerprint: 'fp-pqc',
          notarizedAt: new Date().toISOString(),
        },
      ],
    };

    const receipt = service.evaluateEpochQuorum(request);

    expect(receipt.quorumStatus).toBe('QUORUM_VERIFIED_AUTHENTICATED');
    expect(receipt.validSignaturesCount).toBe(3);
    expect(receipt.antiEquivocationVerified).toBe(true);
    expect(receipt.notarizedCommitmentDigest).toBeDefined();
  });

  it('should detect equivocation attack if divergent Merkle root is submitted for same epoch', () => {
    const rootA =
      'root-hash-aaa-111111111111111111111111111111111111111111111111111111111111';
    const rootB =
      'root-hash-bbb-222222222222222222222222222222222222222222222222222222222222';

    service.evaluateEpochQuorum({
      epochNumber: 2002,
      merkleRoot: rootA,
      totalWitnessNodes: 3,
      requiredThreshold: 2,
      witnessSignatures: [
        {
          witnessNodeId: 'w1',
          witnessType: 'PRIMARY_CLOUD_KMS',
          signatureAlgorithm: 'RSA_PSS_SHA256',
          signatureHex: 'sig-w1-valid',
          publicKeyFingerprint: 'fp1',
          notarizedAt: new Date().toISOString(),
        },
        {
          witnessNodeId: 'w2',
          witnessType: 'POST_QUANTUM_NOTARY',
          signatureAlgorithm: 'FIPS_204_ML_DSA_65',
          signatureHex: 'sig-w2-valid',
          publicKeyFingerprint: 'fp2',
          notarizedAt: new Date().toISOString(),
        },
      ],
    });

    const equivocationAttempt = service.evaluateEpochQuorum({
      epochNumber: 2002,
      merkleRoot: rootB,
      totalWitnessNodes: 3,
      requiredThreshold: 2,
      witnessSignatures: [
        {
          witnessNodeId: 'w1',
          witnessType: 'PRIMARY_CLOUD_KMS',
          signatureAlgorithm: 'RSA_PSS_SHA256',
          signatureHex: 'sig-w1-valid',
          publicKeyFingerprint: 'fp1',
          notarizedAt: new Date().toISOString(),
        },
      ],
    });

    expect(equivocationAttempt.quorumStatus).toBe(
      'EQUIVOCATION_ATTACK_DETECTED',
    );
    expect(equivocationAttempt.antiEquivocationVerified).toBe(false);
  });
});
