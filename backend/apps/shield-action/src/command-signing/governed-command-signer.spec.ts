import * as crypto from 'crypto';
import { SignedCommandBrokerService } from '../broker/signed-command-broker.service';
import { DevGovernedCommandSigner } from './dev-governed-command-signer.service';
import { ProductionGovernedCommandSigner } from './production-governed-command-signer.service';
import { canonicalCommandPayload } from './command-signer.interface';

describe('Governed command signing', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKeyId = process.env.ACTION_COMMAND_KMS_KEY_VERSION;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalKeyId === undefined) {
      delete process.env.ACTION_COMMAND_KMS_KEY_VERSION;
    } else {
      process.env.ACTION_COMMAND_KMS_KEY_VERSION = originalKeyId;
    }
  });

  it('refuses to use the development signer in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new DevGovernedCommandSigner()).toThrow(
      /must never operate in production/,
    );
  });

  it('refuses to start the production signer without a key in custody', () => {
    delete process.env.ACTION_COMMAND_KMS_KEY_VERSION;
    expect(() => new ProductionGovernedCommandSigner()).toThrow(
      /ACTION_COMMAND_KMS_KEY_VERSION is required in production/,
    );
  });

  it('refuses a key name that is not a Cloud KMS key version', () => {
    // A crypto key without a version signs nothing: Cloud KMS would answer
    // NOT_FOUND on the first signature, at the moment a command is issued.
    process.env.ACTION_COMMAND_KMS_KEY_VERSION =
      'projects/p/locations/l/keyRings/r/cryptoKeys/k';
    expect(() => new ProductionGovernedCommandSigner()).toThrow(
      /not a Cloud KMS key version resource name/,
    );
  });

  it('signs and verifies a command round-trip', async () => {
    const signer = new DevGovernedCommandSigner();
    const payload = {
      commandId: 'cmd-1',
      tenantId: 'tenant-a',
      actionType: 'ISOLATE_ENDPOINT',
      targetRef: 'host-1',
      authorityLevel: 'R1',
      approvalRef: 'appr-1',
      policyVersion: '1.0',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
      executionMode: 'LIVE' as const,
    };
    const signed = await signer.sign(payload);
    await expect(
      signer.verify(payload, signed.signature, signed.publicKey),
    ).resolves.toBe(true);
  });

  it('rejects a signature over different bytes', async () => {
    const signer = new DevGovernedCommandSigner();
    const payload = {
      commandId: 'cmd-1',
      tenantId: 'tenant-a',
      actionType: 'ISOLATE_ENDPOINT',
      targetRef: 'host-1',
      authorityLevel: 'R1',
      approvalRef: 'appr-1',
      policyVersion: '1.0',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
      executionMode: 'LIVE' as const,
    };
    const signed = await signer.sign(payload);
    await expect(
      signer.verify(
        { ...payload, targetRef: 'host-2' },
        signed.signature,
        signed.publicKey,
      ),
    ).resolves.toBe(false);
  });

  it('rejects a command forged by recomputing the old SHA-256 "signature"', async () => {
    // The broker used to accept `sha256(envelope fields)` as its signature, so
    // anyone who could read an envelope could mint a valid-looking one for any
    // target they liked. This reconstructs exactly that forgery.
    const broker = new SignedCommandBrokerService(new DevGovernedCommandSigner());
    const genuine = await broker.createSignedCommand(
      'tenant-alpha',
      'ISOLATE_ENDPOINT',
      'host-legitimate',
      'R1',
      'appr-1',
      '1.0',
    );

    const forged = {
      ...genuine,
      commandId: `cmd-${crypto.randomUUID()}`,
      targetRef: 'host-attacker-chose-this',
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const legacyPayload = `${forged.commandId}|${forged.tenantId}|${forged.actionType}|${forged.targetRef}|${forged.authorityLevel}|${forged.approvalRef}|${forged.policyVersion}|${forged.expiresAt}|${forged.nonce}`;
    forged.signature = crypto
      .createHash('sha256')
      .update(legacyPayload)
      .digest('hex');

    const receipt = await broker.dispatchGovernedCommand(forged);
    expect(receipt.executionStatus).toBe('REJECTED_VALIDATION_FAILURE');
    expect(receipt.observedState).toBe('NO_CHANGE');
  });

  it('binds execution mode into the signature', async () => {
    // A command approved for simulation must not verify as a live one.
    const signer = new DevGovernedCommandSigner();
    const payload = {
      commandId: 'cmd-1',
      tenantId: 'tenant-a',
      actionType: 'ISOLATE_ENDPOINT',
      targetRef: 'host-1',
      authorityLevel: 'R1',
      approvalRef: 'appr-1',
      policyVersion: '1.0',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce-1',
      executionMode: 'SIMULATION' as const,
    };
    const signed = await signer.sign(payload);
    await expect(
      signer.verify(
        { ...payload, executionMode: 'LIVE' },
        signed.signature,
        signed.publicKey,
      ),
    ).resolves.toBe(false);
  });

  it('serializes the payload in a fixed field order', () => {
    const a = canonicalCommandPayload({
      commandId: 'c',
      tenantId: 't',
      actionType: 'A',
      targetRef: 'r',
      authorityLevel: 'R1',
      approvalRef: 'ap',
      policyVersion: '1',
      expiresAt: 'e',
      nonce: 'n',
      executionMode: 'LIVE',
    });
    expect(a).toBe('c|t|A|r|R1|ap|1|e|n|LIVE');
  });
});
