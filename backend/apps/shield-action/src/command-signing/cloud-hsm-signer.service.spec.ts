import * as crypto from 'crypto';

const KEY_VERSION =
  'projects/p/locations/europe-west2/keyRings/zoikoshield/cryptoKeys/action-hsm-command/cryptoKeyVersions/1';

/**
 * GcpKmsSigner's own cryptographic correctness (real ECDSA via Cloud KMS) is
 * this class's own concern. What this spec proves is that CloudHsmSignerService
 * correctly delegates to it: constructs with the right key version, builds the
 * right canonical payload, refuses to construct without a key, and correctly
 * surfaces a tamper/mismatch as a failed verification. The mock below is a
 * self-consistent stand-in (deterministic keyed digest, not real ECDSA) so
 * that a correct call sequence round-trips and a wrong one — including a
 * tampered payload — provably does not.
 */
const signedMessages = new Map<string, string>();
const fakeSign = jest.fn(async (message: string) => {
  const sig = crypto
    .createHmac('sha256', 'test-kms-key-material')
    .update(message)
    .digest('hex');
  signedMessages.set(sig, message);
  return sig;
});
const fakeVerify = jest.fn(async (message: string, signatureHex: string) => {
  return signedMessages.get(signatureHex) === message;
});
const fakePublicKey = jest.fn(
  async () => '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
);

jest.mock('../../../../libs/kms/src/gcp-kms-signer', () => ({
  GcpKmsSigner: jest.fn().mockImplementation((keyVersionName: string) => ({
    keyId: keyVersionName,
    algorithm: 'EC_SIGN_P256_SHA256',
    sign: fakeSign,
    verify: fakeVerify,
    publicKey: fakePublicKey,
  })),
}));

import { CloudHsmSignerService } from './cloud-hsm-signer.service';

describe('CloudHsmSignerService', () => {
  const originalEnv = process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION;

  afterEach(() => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = originalEnv;
    jest.clearAllMocks();
    signedMessages.clear();
  });

  it('refuses to construct without a KMS key version — no in-process key generation fallback', () => {
    delete process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION;
    expect(() => new CloudHsmSignerService()).toThrow(
      /ACTION_HSM_COMMAND_KMS_KEY_VERSION is required/,
    );
  });

  it('constructs the real GcpKmsSigner with the configured key version', () => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = KEY_VERSION;

    const { GcpKmsSigner } = require('../../../../libs/kms/src/gcp-kms-signer');
    new CloudHsmSignerService();
    expect(GcpKmsSigner).toHaveBeenCalledWith(KEY_VERSION);
  });

  it('reports honest custody metadata — software-protected KMS key, not a fabricated HSM/FIPS claim', async () => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = KEY_VERSION;
    const signer = new CloudHsmSignerService();

    const meta = await signer.getActiveKeyMetadata();
    expect(meta.keyId).toBe(KEY_VERSION);
    expect(meta.hsmEnclaveId).toBe('GCP_KMS_SOFTWARE_PROTECTED');
    expect(meta.fipsLevel).toBe('NOT_APPLICABLE_SOFTWARE_PROTECTION_LEVEL');
    expect(meta.hsmEnclaveId).not.toContain('HSM_ENCLAVE');
    expect(meta.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('signs live commands through the KMS signer and successfully verifies the signature', async () => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = KEY_VERSION;
    const signer = new CloudHsmSignerService();

    const command = {
      tenantId: 'tenant-acme-01',
      actionCommandId: 'cmd-isolate-001',
      nonce: 'nonce-12345',
      payload: { hostId: 'PROD-SRV-99', action: 'ISOLATE_ENDPOINT' },
    };

    const signed = await signer.sign(command, 'LIVE');
    expect(signed.signature.startsWith(`gcpkms:${KEY_VERSION}:`)).toBe(true);
    expect(signed.signedBy).toBe(`GcpKms:${KEY_VERSION}`);
    expect(fakeSign).toHaveBeenCalledWith(
      JSON.stringify({
        tenantId: command.tenantId,
        actionCommandId: command.actionCommandId,
        nonce: command.nonce,
        executionMode: 'LIVE',
        payload: command.payload,
      }),
    );

    const isValid = await signer.verifySignature(
      command,
      'LIVE',
      signed.signature,
    );
    expect(isValid).toBe(true);
  });

  it('rejects a signature after the command payload is tampered with', async () => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = KEY_VERSION;
    const signer = new CloudHsmSignerService();

    const command = {
      tenantId: 'tenant-acme-01',
      actionCommandId: 'cmd-isolate-001',
      nonce: 'nonce-12345',
      payload: { hostId: 'PROD-SRV-99', action: 'ISOLATE_ENDPOINT' },
    };
    const signed = await signer.sign(command, 'LIVE');

    const tamperedCommand = {
      ...command,
      payload: { hostId: 'PROD-SRV-99', action: 'TERMINATE_HOST' },
    };

    const isValid = await signer.verifySignature(
      tamperedCommand,
      'LIVE',
      signed.signature,
    );
    expect(isValid).toBe(false);
  });

  it('rejects a malformed signature string rather than throwing', async () => {
    process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION = KEY_VERSION;
    const signer = new CloudHsmSignerService();
    const command = {
      tenantId: 'tenant-acme-01',
      actionCommandId: 'cmd-isolate-001',
      nonce: 'nonce-12345',
      payload: {},
    };

    await expect(
      signer.verifySignature(command, 'LIVE', 'hsm:not-a-real-key:deadbeef'),
    ).resolves.toBe(false);
    expect(fakeVerify).not.toHaveBeenCalled();
  });
});
