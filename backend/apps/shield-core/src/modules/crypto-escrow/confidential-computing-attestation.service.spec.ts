import { ConfidentialComputingAttestationService } from './confidential-computing-attestation.service';

describe('ConfidentialComputingAttestationService', () => {
  let service: ConfidentialComputingAttestationService;

  beforeEach(() => {
    service = new ConfidentialComputingAttestationService();
  });

  it('should verify hardware quote and produce genuine attestation report', async () => {
    const report = await service.verifyAttestation({
      tenantId: 'tenant-cc-1',
      platformType: 'AMD_SEV_SNP',
      quoteOrReportHex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      expectedMeasurementDigest: '',
      nonce: 'nonce-12345',
      hostIdentifier: 'k8s-worker-secure-01',
    });

    expect(report.verificationStatus).toBe('VERIFIED_GENUINE');
    expect(report.platformType).toBe('AMD_SEV_SNP');
    expect(report.hardwareVerificationReceipt.signatureDigest).toBeDefined();
  });

  it('should return tenant attestation posture summary', async () => {
    const posture = await service.getTenantAttestationPosture('tenant-cc-2');
    expect(posture.tenantId).toBe('tenant-cc-2');
    expect(posture.totalHostsAttested).toBeGreaterThanOrEqual(1);
    expect(posture.genuineHosts).toBeGreaterThanOrEqual(1);
  });
});
