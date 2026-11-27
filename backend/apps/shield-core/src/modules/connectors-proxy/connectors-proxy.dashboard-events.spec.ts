import { ConnectorsProxyController } from './connectors-proxy.controller';

function build() {
  const getEventMetrics = jest.fn().mockResolvedValue({ statusCode: 200, data: { receivedInWindow: 1 } });
  const controller = new ConnectorsProxyController({ getEventMetrics } as any);
  const call = (hours?: string, header = 'tenant-1', user: any = { tenantId: 'tenant-1' }) =>
    controller.getEventMetrics(header, user, hours);
  return { call, getEventMetrics };
}

describe('GET dashboard/events (core to ingest)', () => {
  it('forwards the tenant and the window to ingest and returns its answer', async () => {
    const { call, getEventMetrics } = build();
    expect(await call('168')).toEqual({ statusCode: 200, data: { receivedInWindow: 1 } });
    expect(getEventMetrics).toHaveBeenCalledWith('tenant-1', 168);
  });

  it('leaves the window to ingest\'s default when none is given or it is unusable', async () => {
    const { call, getEventMetrics } = build();
    for (const hours of [undefined, '', 'abc', '0', '-5', 'NaN']) {
      getEventMetrics.mockClear();
      await call(hours);
      expect(getEventMetrics).toHaveBeenCalledWith('tenant-1', undefined);
    }
  });

  it('caps the window at 90 days and rounds down', async () => {
    const { call, getEventMetrics } = build();
    await call('99999');
    expect(getEventMetrics).toHaveBeenLastCalledWith('tenant-1', 2160);
    await call('36.9');
    expect(getEventMetrics).toHaveBeenLastCalledWith('tenant-1', 36);
  });

  it('refuses a tenant header that is not the caller\'s tenant', async () => {
    const { call, getEventMetrics } = build();
    await expect(call('24', 'someone-elses-tenant', { tenantId: 'tenant-1' })).rejects.toBeDefined();
    expect(getEventMetrics).not.toHaveBeenCalled();
  });
});
