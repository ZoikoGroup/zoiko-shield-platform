import { WorkloadTokenBrokerService } from './workload-token-broker.service';

describe('WorkloadTokenBrokerService (Zero-Trust mTLS Workload Attestation)', () => {
  let broker: WorkloadTokenBrokerService;

  beforeEach(() => {
    broker = new WorkloadTokenBrokerService();
  });

  it('1. should issue and verify a valid SPIFFE workload token', () => {
    const issued = broker.issueToken(
      'shield-core',
      'shield-action',
      'tenant-acme-bank',
      300,
    );

    expect(issued.token).toBeDefined();
    expect(issued.spiffeId).toBe(
      'spiffe://zoikoshield.internal/ns/production/sa/shield-core',
    );
    expect(issued.expiresInSeconds).toBe(300);

    const verified = broker.verifyToken(issued.token, 'shield-action');
    expect(verified.sourceService).toBe('shield-core');
    expect(verified.targetService).toBe('shield-action');
    expect(verified.tenantId).toBe('tenant-acme-bank');
  });

  it('2. should reject tokens with target service mismatch', () => {
    const issued = broker.issueToken(
      'shield-core',
      'shield-ai',
      'tenant-acme-bank',
    );

    expect(() => {
      // Sent to shield-action instead of intended shield-ai
      broker.verifyToken(issued.token, 'shield-action');
    }).toThrow('WORKLOAD_TARGET_MISMATCH');
  });

  it('3. should reject replay attacks using the same single-use nonce', () => {
    const issued = broker.issueToken(
      'shield-ingest',
      'shield-anchor',
      'tenant-acme-bank',
    );

    // First verification succeeds
    const firstVerify = broker.verifyToken(issued.token, 'shield-anchor');
    expect(firstVerify.sourceService).toBe('shield-ingest');

    // Second replay verification must fail
    expect(() => {
      broker.verifyToken(issued.token, 'shield-anchor');
    }).toThrow('WORKLOAD_REPLAY_ATTACK_DETECTED');
  });

  it('4. should reject expired tokens', () => {
    const issued = broker.issueToken(
      'shield-ai',
      'shield-core',
      'tenant-acme-bank',
      -10, // Expired 10s ago
    );

    expect(() => {
      broker.verifyToken(issued.token, 'shield-core');
    }).toThrow('WORKLOAD_TOKEN_EXPIRED');
  });
});
