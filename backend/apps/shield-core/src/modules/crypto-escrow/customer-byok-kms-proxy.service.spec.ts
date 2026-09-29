import { CustomerByokKmsProxyService } from './customer-byok-kms-proxy.service';

describe('CustomerByokKmsProxyService', () => {
  let service: CustomerByokKmsProxyService;

  beforeEach(() => {
    service = new CustomerByokKmsProxyService();
  });

  it('should configure and retrieve BYOK key configuration under Topology T4', async () => {
    const tenantId = 'tenant-byok-1';
    const config = await service.configureByokKey(
      tenantId,
      'AWS_KMS',
      'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      'prod-custody-key',
      60,
    );

    expect(config.tenantId).toBe(tenantId);
    expect(config.provider).toBe('AWS_KMS');
    expect(config.custodyTopology).toBe('T4_CUSTOMER_MANAGED_PROXY');
    expect(config.status).toBe('ACTIVE');

    const fetched = await service.getByokConfiguration(tenantId);
    expect(fetched.keyAlias).toBe('prod-custody-key');
  });

  it('should sign payload and produce verifiable custody receipt', async () => {
    const tenantId = 'tenant-byok-2';
    await service.configureByokKey(
      tenantId,
      'GCP_CLOUD_KMS',
      'gcp-kms://projects/test/locations/global/keyRings/ring/cryptoKeys/key',
      'gcp-primary',
    );

    const payload = 'test-security-manifest-data';
    const result = await service.signWithCustomerKey(tenantId, payload);

    expect(result.signature).toBeDefined();
    expect(result.custodyReceipt.topology).toBe('T4_CUSTOMER_MANAGED_PROXY');
    expect(result.custodyReceipt.receiptId).toContain('byok-rcpt-');
  });

  it('should successfully probe customer KMS key latency', async () => {
    const tenantId = 'tenant-byok-3';
    const probe = await service.probeCustomerKey(tenantId);

    expect(probe.healthy).toBe(true);
    expect(probe.latencyMs).toBeGreaterThanOrEqual(1);
    expect(probe.checkedAt).toBeDefined();
  });
});
