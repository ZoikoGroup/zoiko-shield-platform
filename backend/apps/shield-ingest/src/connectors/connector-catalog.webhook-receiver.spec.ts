import { BadRequestException } from '@nestjs/common';
import { ConnectorCatalogService } from './connector-catalog.service';

const instance = (provider: string) => ({
  id: 'conn-1',
  tenant_id: 'tenant-1',
  environment_id: 'env-1',
  source_region: 'us-east-1',
  deletedAt: null,
  definition: { provider },
});

function build(opts: {
  provider?: string;
  hasAdapter?: boolean;
  source?: 'CONNECTOR' | 'OPERATOR' | 'SHARED_DEV' | 'NONE';
  accepted?: number;
  lastAt?: Date | null;
}) {
  const prisma: any = {
    connectorInstance: { findFirst: jest.fn().mockResolvedValue(instance(opts.provider ?? 'generic-webhook')) },
    rawEvent: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: opts.accepted ?? 0 },
        _max: { received_at: opts.lastAt ?? null },
      }),
    },
  };
  const registry: any = { has: jest.fn().mockReturnValue(opts.hasAdapter ?? false), get: jest.fn() };
  const syncService: any = { runSync: jest.fn().mockResolvedValue(undefined) };
  const secrets: any = { signingSecretSource: jest.fn().mockResolvedValue(opts.source ?? 'CONNECTOR') };
  const health: any = { recordWebhookDelivery: jest.fn().mockResolvedValue(undefined) };
  const service = new ConnectorCatalogService(prisma, registry, syncService, {} as any, secrets, health);
  // the health read that syncConnector returns
  jest.spyOn(service, 'getConnectorHealth').mockResolvedValue({ state: 'DEGRADED' } as any);
  return { service, prisma, registry, syncService, health, secrets };
}

describe('testConnector: inbound webhook receivers report evidence', () => {
  const LAST = new Date('2026-11-27T13:34:39.749Z');

  it('VERIFIED once a signed delivery has arrived, and corrects a stale health state', async () => {
    const { service, health } = build({ accepted: 3, lastAt: LAST });
    const r: any = await service.testConnector('tenant-1', 'conn-1');

    expect(r.status).toBe('VERIFIED');
    expect(r.deliveriesReceived).toBe(3);
    expect(r.lastDeliveryAt).toBe(LAST.toISOString());
    expect(r.signingSecret).toBe('CONNECTOR');
    expect(health.recordWebhookDelivery).toHaveBeenCalledWith('conn-1', 'tenant-1', LAST, { force: true });
  });

  it('UNVERIFIED, with what to do, when nothing has been delivered yet; and does not touch health', async () => {
    const { service, health } = build({ accepted: 0, lastAt: null });
    const r: any = await service.testConnector('tenant-1', 'conn-1');

    expect(r.status).toBe('UNVERIFIED');
    expect(r.reason).toMatch(/No signed delivery has been received yet/);
    expect(r.reason).toMatch(/Redeliver/);
    expect(r.lastDeliveryAt).toBeNull();
    expect(health.recordWebhookDelivery).not.toHaveBeenCalled();
  });

  it('UNVERIFIED when there is no signing secret, even if events exist', async () => {
    const { service, health } = build({ source: 'NONE', accepted: 5, lastAt: LAST });
    const r: any = await service.testConnector('tenant-1', 'conn-1');
    expect(r.status).toBe('UNVERIFIED');
    expect(r.reason).toMatch(/no signing secret/);
    expect(health.recordWebhookDelivery).not.toHaveBeenCalled();
  });

  it('counts only accepted deliveries', async () => {
    const { service, prisma } = build({ accepted: 1, lastAt: LAST });
    await service.testConnector('tenant-1', 'conn-1');
    expect(prisma.rawEvent.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { connector_id: 'conn-1', processing_status: 'ACCEPTED' } }),
    );
  });

  it('works for a GitHub receiver too', async () => {
    const { service } = build({ provider: 'github', accepted: 1, lastAt: LAST });
    expect(((await service.testConnector('tenant-1', 'conn-1')) as any).status).toBe('VERIFIED');
  });

  it('a failure to refresh health does not fail the test', async () => {
    const { service, health } = build({ accepted: 1, lastAt: LAST });
    health.recordWebhookDelivery.mockRejectedValue(new Error('db down'));
    expect(((await service.testConnector('tenant-1', 'conn-1')) as any).status).toBe('VERIFIED');
  });

  it('still refuses a provider with no adapter that is not a receiver', async () => {
    const { service } = build({ provider: 'mystery', hasAdapter: false });
    await expect(service.testConnector('tenant-1', 'conn-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('syncConnector: nothing to pull from a push-only receiver', () => {
  it('does not run a sync, so it cannot record a failure', async () => {
    const { service, syncService } = build({});
    const r: any = await service.syncConnector('tenant-1', 'conn-1');
    expect(syncService.runSync).not.toHaveBeenCalled();
    expect(r).toEqual({ state: 'DEGRADED' }); // reports health as it is
  });

  it('still syncs a pull-style connector', async () => {
    const { service, syncService } = build({ provider: 'okta', hasAdapter: true });
    await service.syncConnector('tenant-1', 'conn-1');
    expect(syncService.runSync).toHaveBeenCalledWith('conn-1');
  });
});
