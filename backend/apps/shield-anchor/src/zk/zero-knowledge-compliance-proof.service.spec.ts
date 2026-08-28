import { ZeroKnowledgeComplianceProofService } from './zero-knowledge-compliance-proof.service';

describe('ZeroKnowledgeComplianceProofService', () => {
  let zkService: ZeroKnowledgeComplianceProofService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    zkService = new ZeroKnowledgeComplianceProofService();
  });

  it('should generate and verify zero-knowledge range proof without leaking raw value', () => {
    // Statement: SOC2 Availability SLA uptime is at least 99.90% and at most 100.00%
    const proof = zkService.generateComplianceRangeProof({
      statement: 'SOC2_TYPE2_AVAILABILITY_MONTHLY_UPTIME',
      privateValue: 99.994, // True private SLA metric
      minAllowed: 99.9,
      maxAllowed: 100.0,
    });

    expect(proof.proofId).toBeDefined();
    expect(proof.pedersenCommitmentHex).toBeDefined();
    expect(proof.nizkChallengeHex).toBeDefined();

    // Verify proof
    const receipt = zkService.verifyComplianceRangeProof(proof);
    expect(receipt.isProofValid).toBe(true);
    expect(receipt.valueIsWithinRange).toBe(true);
    expect(receipt.rawTelemetryExposed).toBe(false);
    expect(receipt.attestationDigest).toBeDefined();
  });

  it('should reject generation when private value violates compliance bounds', () => {
    expect(() => {
      zkService.generateComplianceRangeProof({
        statement: 'SOC2_LATENCY_MAX_MS',
        privateValue: 450, // Bad SLA latency
        minAllowed: 0,
        maxAllowed: 100, // Maximum allowed SLA latency
      });
    }).toThrow();
  });
});
