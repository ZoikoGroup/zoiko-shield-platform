import { KeyRotationOrchestratorService } from './key-rotation-orchestrator.service';

describe('KeyRotationOrchestratorService', () => {
  let orchestrator: KeyRotationOrchestratorService;

  beforeEach(() => {
    orchestrator = new KeyRotationOrchestratorService();
  });

  it('should initialize TMK v1 with ACTIVE status', () => {
    const key = orchestrator.initializeTenantMasterKey('tenant-acme-bank');

    expect(key.keyId).toBeDefined();
    expect(key.version).toBe(1);
    expect(key.status).toBe('ACTIVE');
    expect(key.algorithm).toBe('AES-256-GCM');
    expect(key.derivedKeyDigest).toBeDefined();
  });

  it('should rotate key to v2, set v1 to RETIRED_READ_ONLY, and produce forward secrecy proof', () => {
    const tenantId = 'tenant-acme-bank';
    const keyV1 = orchestrator.initializeTenantMasterKey(tenantId);

    const rotation = orchestrator.rotateTenantMasterKey(tenantId);

    expect(rotation.oldKeyId).toBe(keyV1.keyId);
    expect(rotation.newVersion).toBe(2);
    expect(rotation.forwardSecrecyProofDigest).toBeDefined();

    const allKeys = orchestrator.getTenantKeys(tenantId);
    expect(allKeys.length).toBe(2);

    const retiredV1 = allKeys.find((k) => k.version === 1);
    const activeV2 = allKeys.find((k) => k.version === 2);

    expect(retiredV1?.status).toBe('RETIRED_READ_ONLY');
    expect(activeV2?.status).toBe('ACTIVE');
  });
});
