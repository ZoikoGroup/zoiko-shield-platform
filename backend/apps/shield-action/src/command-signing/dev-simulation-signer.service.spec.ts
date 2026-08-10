import { DevSimulationSigner } from './dev-simulation-signer.service';

describe('DevSimulationSigner', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('signs a command in SIMULATION mode', () => {
    process.env.NODE_ENV = 'test';
    const signer = new DevSimulationSigner();
    const signed = signer.sign(
      { tenantId: 't1', actionCommandId: 'cmd1', nonce: 'n1', payload: { actionType: 'REVOKE_SESSIONS' } },
      'SIMULATION',
    );
    expect(signed.signature).toMatch(/^dev-sim:[0-9a-f]{64}$/);
    expect(signed.signedBy).toBe('DevSimulationSigner');
  });

  it('throws when asked to sign a LIVE command', () => {
    process.env.NODE_ENV = 'test';
    const signer = new DevSimulationSigner();
    expect(() =>
      signer.sign({ tenantId: 't1', actionCommandId: 'cmd1', nonce: 'n1', payload: {} }, 'LIVE'),
    ).toThrow('DevSimulationSigner cannot sign live commands');
  });

  it('throws in production even for a SIMULATION request', () => {
    process.env.NODE_ENV = 'production';
    const signer = new DevSimulationSigner();
    expect(() =>
      signer.sign({ tenantId: 't1', actionCommandId: 'cmd1', nonce: 'n1', payload: {} }, 'SIMULATION'),
    ).toThrow('DevSimulationSigner is prohibited in production');
  });
});
