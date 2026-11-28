import { ConnectorsProxyController } from './connectors-proxy.controller';

function build() {
  const getConnectorActivity = jest.fn().mockResolvedValue({ statusCode: 200, data: { total: 1 } });
  const controller = new ConnectorsProxyController({ getConnectorActivity } as any);
  const call = (limit?: string, header = 'tenant-1', user: any = { tenantId: 'tenant-1' }) =>
    controller.getConnectorActivity(header, user, 'conn-1', limit);
  return { call, getConnectorActivity };
}

describe('GET connectors/:id/activity (core to ingest)', () => {
  it('forwards the tenant, connector and page size, and returns ingest\'s answer', async () => {
    const { call, getConnectorActivity } = build();
    expect(await call('20')).toEqual({ statusCode: 200, data: { total: 1 } });
    expect(getConnectorActivity).toHaveBeenCalledWith('tenant-1', 'conn-1', 20);
  });

  it('leaves the default to ingest when no usable size is given', async () => {
    const { call, getConnectorActivity } = build();
    for (const limit of [undefined, '', 'abc', '0', '-3', 'NaN']) {
      getConnectorActivity.mockClear();
      await call(limit);
      expect(getConnectorActivity).toHaveBeenCalledWith('tenant-1', 'conn-1', undefined);
    }
  });

  it('caps the size at 50 and rounds down', async () => {
    const { call, getConnectorActivity } = build();
    await call('9999');
    expect(getConnectorActivity).toHaveBeenLastCalledWith('tenant-1', 'conn-1', 50);
    await call('7.9');
    expect(getConnectorActivity).toHaveBeenLastCalledWith('tenant-1', 'conn-1', 7);
  });

  it('refuses a tenant header that is not the caller\'s tenant', async () => {
    const { call, getConnectorActivity } = build();
    await expect(call('10', 'someone-elses-tenant')).rejects.toBeDefined();
    expect(getConnectorActivity).not.toHaveBeenCalled();
  });
});
