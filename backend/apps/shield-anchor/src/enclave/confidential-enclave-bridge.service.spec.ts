import { Test, TestingModule } from '@nestjs/testing';
import {
  ConfidentialEnclaveBridgeService,
  EnclaveAttestationQuote,
} from './confidential-enclave-bridge.service';

describe('ConfidentialEnclaveBridgeService', () => {
  let service: ConfidentialEnclaveBridgeService;

  const validPcr0 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const mockQuote: EnclaveAttestationQuote = {
    enclaveId: 'enclave-nitro-secops-01',
    platform: 'AWS_NITRO',
    pcr0: validPcr0,
    pcr1: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    pcr2: 'f6e5d4c3b2a10000000000000000000000000000000000000000000000000000',
    hardwareRootOfTrust: 'aws-nitro-pki-chain-thumbprint-99',
    enclavePublicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----',
    signature: '3045022100a1b2c3d4e5f6...valid_hardware_nitro_sig',
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfidentialEnclaveBridgeService],
    }).compile();

    service = module.get<ConfidentialEnclaveBridgeService>(ConfidentialEnclaveBridgeService);
  });

  it('should successfully verify a valid hardware quote and issue an EAT token', () => {
    const token = service.verifyAttestationQuote(mockQuote, validPcr0);
    expect(token.verified).toBe(true);
    expect(token.status).toBe('VALID');
    expect(token.enclaveId).toBe('enclave-nitro-secops-01');
    expect(token.receiptProof).toBeDefined();
  });

  it('should reject quotes with mismatched PCR0 measurement', () => {
    const alteredQuote = { ...mockQuote, pcr0: 'deadbeef00000000000000000000000000000000000000000000000000000000' };
    const token = service.verifyAttestationQuote(alteredQuote, validPcr0);
    expect(token.verified).toBe(false);
    expect(token.status).toBe('PCR_MISMATCH');
  });

  it('should generate a confidential compute receipt bound to a verified EAT token', () => {
    const token = service.verifyAttestationQuote(mockQuote, validPcr0);
    const receipt = service.generateEnclaveReceipt(
      token.eatId,
      'tenant-bank-1',
      'hash-raw-telemetry-payload',
      'hash-computed-intel-matches',
    );

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.enclaveId).toBe(token.enclaveId);
    expect(receipt.attestationTokenId).toBe(token.eatId);
    expect(receipt.tenantId).toBe('tenant-bank-1');
  });
});
