import { ConnectorRegistry } from './connector-registry';
import { SecurityConnector } from './connector.interface';

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;
  const fakeConnector = {} as SecurityConnector;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('resolves a registered provider by key instead of requiring callers to branch on provider name', () => {
    registry.register('microsoft-entra', fakeConnector);

    expect(registry.get('microsoft-entra')).toBe(fakeConnector);
    expect(registry.has('microsoft-entra')).toBe(true);
  });

  it('throws for an unregistered provider key rather than returning undefined', () => {
    expect(() => registry.get('aws')).toThrow("No connector registered for provider key 'aws'");
  });

  it('reports has() as false for a provider that was never registered', () => {
    expect(registry.has('github')).toBe(false);
  });
});
