import { ConnectorCatalogService } from './connector-catalog.service';

/**
 * A connection test may only say HEALTHY when it actually reached the
 * provider. Providers without a live check report UNVERIFIED.
 */
describe('ConnectorCatalogService.testConnector', () => {
  const instance = {
    id: 'conn-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    source_region: 'eu-west-1',
    deletedAt: null,
    definition: { provider: 'okta' },
  };

  function build(connector: Record<string, unknown>) {
    const prisma = {
      connectorInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
    } as any;
    const registry = {
      has: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue(connector),
    } as any;
    return new ConnectorCatalogService(prisma, registry, {} as any, {} as any);
  }

  it('reports UNVERIFIED and never calls a provider that has no live check', async () => {
    const testConnection = jest
      .fn()
      .mockResolvedValue({ status: 'HEALTHY', latencyMs: 52 });
    const result = await build({ testConnection }).testConnector(
      'tenant-1',
      'conn-1',
    );

    expect(testConnection).not.toHaveBeenCalled();
    expect(result.status).toBe('UNVERIFIED');
    expect(result.reason).toMatch(/not tested/);
  });

  it('relays the result of a provider that declares a live check', async () => {
    const testConnection = jest
      .fn()
      .mockResolvedValue({ status: 'AUTHENTICATION_FAILED' });
    const result = await build({
      liveConnectivityCheck: true,
      testConnection,
    }).testConnector('tenant-1', 'conn-1');

    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('AUTHENTICATION_FAILED');
  });
});
