import { ConnectorHealthService } from './health.service';

function build(instance: Record<string, unknown> | null) {
  const prisma: any = {
    connectorInstance: {
      findUnique: jest.fn().mockResolvedValue(instance),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    connectorHealthStatus: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const kafka: any = { publishEvent: jest.fn().mockResolvedValue(undefined) };
  return { prisma, kafka, service: new ConnectorHealthService(prisma, kafka) };
}

describe('ConnectorHealthService.recordWebhookDelivery', () => {
  const AT = new Date('2026-11-27T13:34:39Z');

  it('moves a degraded receiver to CONNECTED, clears its failures and stamps the delivery time', async () => {
    const { service, prisma, kafka } = build({ state: 'DEGRADED', deletedAt: null });
    await service.recordWebhookDelivery('c1', 't1', AT);

    expect(prisma.connectorInstance.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { state: 'CONNECTED' } });
    expect(prisma.connectorHealthStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ state: 'CONNECTED', consecutiveFailures: 0 }) }),
    );
    expect(prisma.connectorHealthStatus.update).toHaveBeenCalledWith({
      where: { instanceId: 'c1' },
      data: { lastSuccessfulConnectionAt: AT, lastSuccessfulSyncAt: AT, lastErrorCode: null },
    });
    expect(kafka.publishEvent).toHaveBeenCalledTimes(1); // the state really changed
  });

  it('connects a brand-new receiver on its first delivery', async () => {
    const { service, prisma } = build({ state: 'NOT_CONNECTED', deletedAt: null });
    await service.recordWebhookDelivery('c1', 't1', AT);
    expect(prisma.connectorInstance.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { state: 'CONNECTED' } });
  });

  it('only refreshes the evidence when already connected: no state change, no event', async () => {
    const { service, prisma, kafka } = build({ state: 'CONNECTED', deletedAt: null });
    await service.recordWebhookDelivery('c1', 't1', AT);
    expect(prisma.connectorInstance.update).not.toHaveBeenCalled();
    expect(kafka.publishEvent).not.toHaveBeenCalled();
    expect(prisma.connectorHealthStatus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ consecutiveFailures: 0, lastSuccessfulConnectionAt: AT, lastSuccessfulSyncAt: AT }),
      }),
    );
  });

  it('never overrides a state a person or the provider chose', async () => {
    for (const state of ['DISCONNECTED', 'AUTHENTICATION_FAILED', 'PERMISSION_REVOKED', 'RATE_LIMITED', 'AWAITING_ADMIN_CONSENT']) {
      const { service, prisma } = build({ state, deletedAt: null });
      await service.recordWebhookDelivery('c1', 't1', AT);
      expect(prisma.connectorInstance.update).not.toHaveBeenCalled();
      expect(prisma.connectorHealthStatus.upsert).not.toHaveBeenCalled();
    }
  });

  it('ignores a retired or missing connector', async () => {
    for (const inst of [null, { state: 'DEGRADED', deletedAt: new Date() }]) {
      const { service, prisma } = build(inst);
      await service.recordWebhookDelivery('c1', 't1', AT);
      expect(prisma.connectorInstance.update).not.toHaveBeenCalled();
    }
  });

  it('writes at most once per 30 seconds per connector, however busy the webhook', async () => {
    const { service, prisma } = build({ state: 'CONNECTED', deletedAt: null });
    await service.recordWebhookDelivery('c1', 't1', AT);
    await service.recordWebhookDelivery('c1', 't1', AT);
    await service.recordWebhookDelivery('c1', 't1', AT);
    expect(prisma.connectorInstance.findUnique).toHaveBeenCalledTimes(1);
    await service.recordWebhookDelivery('other', 't1', AT); // a different connector is not throttled
    expect(prisma.connectorInstance.findUnique).toHaveBeenCalledTimes(2);
  });

  it('lets an explicit test bypass the limit', async () => {
    const { service, prisma } = build({ state: 'CONNECTED', deletedAt: null });
    await service.recordWebhookDelivery('c1', 't1', AT);
    await service.recordWebhookDelivery('c1', 't1', AT, { force: true });
    expect(prisma.connectorInstance.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('ConnectorHealthService.monitorConnectorHeartbeats', () => {
  const longAgo = new Date(Date.now() - 6 * 3600 * 1000);
  const row = (provider: string, id: string) => ({
    id,
    tenant_id: 't1',
    state: 'CONNECTED',
    definition: { provider },
    connectorHealthStatus: { lastSuccessfulConnectionAt: longAgo },
  });

  it('does not report a quiet webhook receiver as having missed heartbeats', async () => {
    const { service, prisma } = build(null);
    prisma.connectorInstance.findMany.mockResolvedValue([row('generic-webhook', 'hook'), row('github', 'gh')]);
    await service.monitorConnectorHeartbeats();
    expect(prisma.connectorInstance.update).not.toHaveBeenCalled();
    expect(prisma.connectorHealthStatus.upsert).not.toHaveBeenCalled();
  });

  it('still degrades a pull-style connector that has gone silent', async () => {
    const { service, prisma } = build(null);
    prisma.connectorInstance.findMany.mockResolvedValue([row('okta', 'okta-1'), row('generic-webhook', 'hook')]);
    await service.monitorConnectorHeartbeats();
    expect(prisma.connectorInstance.update).toHaveBeenCalledTimes(1);
    expect(prisma.connectorInstance.update).toHaveBeenCalledWith({ where: { id: 'okta-1' }, data: { state: 'DEGRADED' } });
  });
});
