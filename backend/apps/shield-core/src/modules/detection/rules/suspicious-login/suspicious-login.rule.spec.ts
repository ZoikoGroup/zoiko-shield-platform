import { SuspiciousLoginRule } from './suspicious-login.rule';
import { DetectionInput } from '../../runtime/detection-rule.interface';

describe('SuspiciousLoginRule', () => {
  const rule = new SuspiciousLoginRule();

  const baseEvent: DetectionInput['event'] = {
    id: 'evt-1',
    tenant_id: 'tenant-a',
    environment_id: 'env-1',
    event_class: 'AUTHENTICATION',
    event_category: 'IDENTITY',
    event_activity: 'security.identity.signin.v1',
    actor_user_id: 'user-1',
    actor_email: 'user@example.com',
    source_ip: '203.0.113.5',
    destination_ip: null,
    resource_id: null,
    action: 'SIGN_IN',
    outcome: 'FAILURE',
    occurred_at: new Date(),
  };

  it('MATCHes on a failed sign-in for a privileged identity (known positive)', () => {
    const result = rule.evaluate({
      tenantId: 'tenant-a',
      event: baseEvent,
      identity: {
        id: 'identity-1',
        status: 'ACTIVE',
        identity_type: 'MANAGED_IDENTITY',
      },
      asset: null,
      contextHealth: 'RESOLVED',
      configuration: {},
    });

    expect(result.result).toBe('MATCH');
    expect(
      result.factors.find((f) => f.name === 'FAILED_OUTCOME')?.contribution,
    ).toBeGreaterThan(0);
  });

  it('does NOT match a successful sign-in (known negative)', () => {
    const result = rule.evaluate({
      tenantId: 'tenant-a',
      event: { ...baseEvent, outcome: 'SUCCESS' },
      identity: {
        id: 'identity-1',
        status: 'ACTIVE',
        identity_type: 'MANAGED_IDENTITY',
      },
      asset: null,
      contextHealth: 'RESOLVED',
      configuration: {},
    });

    expect(result.result).toBe('NO_MATCH');
  });

  it('returns INDETERMINATE (not NO_MATCH) when required identity context is missing (spec §25)', () => {
    const result = rule.evaluate({
      tenantId: 'tenant-a',
      event: baseEvent,
      identity: null,
      asset: null,
      contextHealth: 'UNRESOLVED',
      configuration: {},
    });

    expect(result.result).toBe('INDETERMINATE');
    expect(result.incompleteData).toBe(true);
    expect(
      result.factors.find((f) => f.name === 'PRIVILEGED_IDENTITY')
        ?.indeterminate,
    ).toBe(true);
  });

  it('does not match a failed sign-in for a non-privileged identity', () => {
    const result = rule.evaluate({
      tenantId: 'tenant-a',
      event: baseEvent,
      identity: { id: 'identity-1', status: 'ACTIVE', identity_type: 'HUMAN' },
      asset: null,
      contextHealth: 'RESOLVED',
      configuration: {},
    });

    expect(result.result).toBe('NO_MATCH');
  });

  it('reduces confidence and flags incompleteData when context health is PARTIAL, without changing MATCH to something else', () => {
    const result = rule.evaluate({
      tenantId: 'tenant-a',
      event: baseEvent,
      identity: {
        id: 'identity-1',
        status: 'ACTIVE',
        identity_type: 'MANAGED_IDENTITY',
      },
      asset: null,
      contextHealth: 'PARTIAL',
      configuration: {},
    });

    expect(result.result).toBe('MATCH');
    expect(result.incompleteData).toBe(true);
    expect(result.confidence).toBeLessThan(0.85);
  });
});
