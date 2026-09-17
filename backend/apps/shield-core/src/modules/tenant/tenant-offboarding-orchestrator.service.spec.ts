import { TenantOffboardingOrchestratorService } from './tenant-offboarding-orchestrator.service';
import { CryptographicShreddingService } from '../privacy/cryptographic-shredding.service';

describe('TenantOffboardingOrchestratorService', () => {
  let orchestrator: TenantOffboardingOrchestratorService;
  let shredder: CryptographicShreddingService;

  beforeAll(() => {
    process.env.SUBJECT_KEY_WRAPPING_SECRET =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  beforeEach(() => {
    shredder = new CryptographicShreddingService();
    orchestrator = new TenantOffboardingOrchestratorService(shredder);
  });

  it('should orchestrate tenant offboarding, shred keys, and generate master attestation', async () => {
    const tenantId = 'tenant-gdpr-offboard-001';
    const result = await orchestrator.orchestrateTenantOffboarding({
      tenantId,
      initiatorActorId: 'admin-privacy-officer-01',
      reason: 'Contract termination and right-to-be-forgotten request',
      subjectIdsToShred: ['sub-user-01', 'sub-user-02'],
    });

    expect(result.status).toBe('PURGED');
    expect(result.tenantId).toBe(tenantId);
    expect(result.shreddedCertificates.length).toBe(2);
    expect(result.masterAttestationDigest).toBeDefined();
    expect(result.masterAttestationDigest.length).toBe(64);
  });
});
