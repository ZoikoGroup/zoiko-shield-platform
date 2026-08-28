import { CloudHsmSignerService } from './cloud-hsm-signer.service';

describe('CloudHsmSignerService', () => {
  let signer: CloudHsmSignerService;

  beforeEach(() => {
    signer = new CloudHsmSignerService();
  });

  it('should generate active ECDSA P-256 HSM key metadata', () => {
    const meta = signer.getActiveKeyMetadata();
    expect(meta.keyId).toBeDefined();
    expect(meta.algorithm).toBe('ECDSA_P256_SHA256');
    expect(meta.fipsLevel).toBe('FIPS_140_3_LEVEL_3');
    expect(meta.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('should sign live commands and successfully verify cryptographic signature', () => {
    const command = {
      tenantId: 'tenant-acme-01',
      actionCommandId: 'cmd-isolate-001',
      nonce: 'nonce-12345',
      payload: { hostId: 'PROD-SRV-99', action: 'ISOLATE_ENDPOINT' },
    };

    const signed = signer.sign(command, 'LIVE');
    expect(signed.signature.startsWith('hsm:')).toBe(true);
    expect(signed.signedBy).toContain('CloudHSM');

    const isValid = signer.verifySignature(command, 'LIVE', signed.signature);
    expect(isValid).toBe(true);
  });

  it('should reject invalid or tampered command payloads during verification', () => {
    const command = {
      tenantId: 'tenant-acme-01',
      actionCommandId: 'cmd-isolate-001',
      nonce: 'nonce-12345',
      payload: { hostId: 'PROD-SRV-99', action: 'ISOLATE_ENDPOINT' },
    };

    const signed = signer.sign(command, 'LIVE');

    const tamperedCommand = {
      ...command,
      payload: { hostId: 'PROD-SRV-99', action: 'TERMINATE_HOST' }, // Tampered action
    };

    const isValid = signer.verifySignature(
      tamperedCommand,
      'LIVE',
      signed.signature,
    );
    expect(isValid).toBe(false);
  });
});
