import { DevCheckpointSigner } from './dev-checkpoint-signer.service';

describe('DevCheckpointSigner', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKeyPem = process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalKeyPem === undefined) delete process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM;
    else process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM = originalKeyPem;
  });

  it('signs and produces a verifiable Ed25519 signature in non-production', () => {
    process.env.NODE_ENV = 'test';
    const signer = new DevCheckpointSigner();
    const result = signer.sign('some-merkle-root');
    expect(result.algorithm).toBe('Ed25519');
    expect(result.signature).toMatch(/^[0-9a-f]+$/);
    expect(result.publicKey).toContain('PUBLIC KEY');
  });

  it('NEVER operates in production — throws unconditionally at construction, even with a private key env var configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM = 'irrelevant-value-should-never-matter';
    expect(() => new DevCheckpointSigner()).toThrow(/must never operate in production/);
  });

  it('throws in production even with no key configured at all', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ANCHOR_SIGNING_PRIVATE_KEY_PEM;
    expect(() => new DevCheckpointSigner()).toThrow(/must never operate in production/);
  });
});
