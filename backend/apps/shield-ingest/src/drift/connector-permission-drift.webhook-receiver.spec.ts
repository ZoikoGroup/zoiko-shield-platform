import { ConnectorPermissionDriftService } from './connector-permission-drift.service';

function build(connectors: unknown[], secretSource: 'CONNECTOR' | 'OPERATOR' | 'SHARED_DEV' | 'NONE' | undefined) {
  const prisma: any = { connectorInstance: { findMany: jest.fn().mockResolvedValue(connectors) } };
  const kafka: any = { publishEvent: jest.fn().mockResolvedValue(undefined) };
  const health: any = {
    updateHealth: jest.fn().mockResolvedValue(undefined),
    updatePermissionStatus: jest.fn().mockResolvedValue(undefined),
  };
  const permission: any = {
    declareRequired: jest.fn().mockResolvedValue(undefined),
    reconcileGranted: jest.fn().mockResolvedValue({ newlyMissing: [] }),
    getGranted: jest.fn().mockResolvedValue([]),
    getMissingRequired: jest.fn().mockResolvedValue([]),
  };
  const secrets: any =
    secretSource === undefined ? undefined : { signingSecretSource: jest.fn().mockResolvedValue(secretSource) };
  const service = new ConnectorPermissionDriftService(prisma, kafka, health, permission, secrets);
  return { service, health, permission, kafka, secrets };
}

const conn = (provider: string, id = 'c1') => ({
  id,
  tenant_id: 't1',
  connectorDefId: 'def',
  definition: { provider },
  state: 'DEGRADED',
});

describe('permission drift sweep: inbound webhook receivers', () => {
  it('does NOT flag a receiver that has a signing secret (the bug: it was reported as having lost webhook:receive)', async () => {
    const { service, health, permission, kafka } = build([conn('generic-webhook')], 'CONNECTOR');
    await service.sweepPermissionDrift();

    expect(permission.reconcileGranted).toHaveBeenCalledWith('c1', ['webhook:receive', 'hmac:verify']);
    expect(health.updatePermissionStatus).toHaveBeenCalledWith('c1', 't1', 'OK');
    expect(health.updateHealth).not.toHaveBeenCalled(); // no "Critical permissions lost", no failure count
    expect(kafka.publishEvent).not.toHaveBeenCalled(); // no drift event
  });

  it('counts an operator-supplied or shared development secret as able to verify', async () => {
    for (const source of ['OPERATOR', 'SHARED_DEV'] as const) {
      const { service, health } = build([conn('generic-webhook')], source);
      await service.sweepPermissionDrift();
      expect(health.updatePermissionStatus).toHaveBeenCalledWith('c1', 't1', 'OK');
    }
  });

  it('reports missing verification honestly (permissions degraded) but does not mark the connector itself failed', async () => {
    const { service, health, permission } = build([conn('generic-webhook')], 'NONE');
    await service.sweepPermissionDrift();

    expect(permission.reconcileGranted).toHaveBeenCalledWith('c1', ['webhook:receive']);
    expect(health.updatePermissionStatus).toHaveBeenCalledWith('c1', 't1', 'DEGRADED');
    // hmac:verify is not critical, so the connector state is left alone
    expect(health.updateHealth).not.toHaveBeenCalled();
  });

  it('treats a service without the secret store as having no verifier, not as a crash', async () => {
    const { service, health } = build([conn('generic-webhook')], undefined);
    await service.sweepPermissionDrift();
    expect(health.updatePermissionStatus).toHaveBeenCalledWith('c1', 't1', 'DEGRADED');
  });

  it('judges a GitHub webhook receiver by the webhook baseline, not by GitHub API scopes', async () => {
    const { service, permission, health } = build([conn('github')], 'CONNECTOR');
    await service.sweepPermissionDrift();

    expect(permission.declareRequired).toHaveBeenCalledWith('t1', 'c1', 'generic-webhook', ['webhook:receive', 'hmac:verify']);
    expect(health.updatePermissionStatus).toHaveBeenCalledWith('c1', 't1', 'OK');
    expect(health.updateHealth).not.toHaveBeenCalled();
  });

  it('never reads the stored grant rows for a receiver (nothing ever sets them)', async () => {
    const { service, permission } = build([conn('generic-webhook')], 'CONNECTOR');
    await service.sweepPermissionDrift();
    expect(permission.getGranted).not.toHaveBeenCalled();
  });
});

describe('permission drift sweep: pull-style connectors are unchanged', () => {
  it('still reads stored grants and still degrades the connector when a critical scope is lost', async () => {
    const { service, health, permission, secrets } = build([conn('crowdstrike', 'cs-1')], 'CONNECTOR');
    permission.getGranted.mockResolvedValue([]); // nothing granted
    await service.sweepPermissionDrift();

    expect(permission.getGranted).toHaveBeenCalledWith('cs-1');
    expect(secrets.signingSecretSource).not.toHaveBeenCalled();
    expect(health.updateHealth).toHaveBeenCalledWith('cs-1', 't1', 'DEGRADED', expect.stringContaining('Critical permissions lost'));
  });
});

describe('inboundReceiverGrants', () => {
  it('always grants webhook:receive and adds hmac:verify only when something can verify', async () => {
    expect(await build([], 'CONNECTOR').service.inboundReceiverGrants('c')).toEqual(['webhook:receive', 'hmac:verify']);
    expect(await build([], 'NONE').service.inboundReceiverGrants('c')).toEqual(['webhook:receive']);
  });
});
