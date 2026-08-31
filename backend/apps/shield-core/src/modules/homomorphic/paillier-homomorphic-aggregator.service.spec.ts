import { PaillierHomomorphicAggregatorService } from './paillier-homomorphic-aggregator.service';

describe('PaillierHomomorphicAggregatorService', () => {
  let homoService: PaillierHomomorphicAggregatorService;

  beforeEach(() => {
    homoService = new PaillierHomomorphicAggregatorService();
  });

  it('should encrypt, homomorphically add ciphertexts without decryption, and recover exact sum', () => {
    const val1 = 45;
    const val2 = 55;

    const c1 = homoService.encrypt(val1);
    const c2 = homoService.encrypt(val2);

    // Homomorphic addition in ciphertext domain
    const cSum = homoService.addCiphertexts(c1, c2);

    // Decrypt sum
    const decryptedSum = homoService.decrypt(cSum);
    expect(decryptedSum).toBe(val1 + val2); // 100
  });

  it('should homomorphically aggregate multi-tenant telemetry payloads', () => {
    const payloads = [
      { metricName: 'api_calls_count', tenantId: 'tenant-a', ciphertextHex: homoService.encrypt(120).toString(16) },
      { metricName: 'api_calls_count', tenantId: 'tenant-b', ciphertextHex: homoService.encrypt(80).toString(16) },
      { metricName: 'api_calls_count', tenantId: 'tenant-c', ciphertextHex: homoService.encrypt(50).toString(16) },
    ];

    const receipt = homoService.aggregateEncryptedMetrics('api_calls_count', payloads);

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.contributingTenantsCount).toBe(3);
    expect(receipt.decryptedVerificationSum).toBe(250); // 120 + 80 + 50
    expect(receipt.attestationDigest).toBeDefined();
  });
});
