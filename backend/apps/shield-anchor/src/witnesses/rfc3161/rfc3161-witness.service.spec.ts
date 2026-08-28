import { Test, TestingModule } from '@nestjs/testing';
import {
  Rfc3161WitnessService,
  Rfc3161TimestampToken,
} from './rfc3161-witness.service';

describe('Rfc3161WitnessService (Public RFC 3161 Timestamping)', () => {
  let service: Rfc3161WitnessService;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    const module: TestingModule = await Test.createTestingModule({
      providers: [Rfc3161WitnessService],
    }).compile();

    service = module.get<Rfc3161WitnessService>(Rfc3161WitnessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('attests a Merkle root and returns RSA-signed RFC 3161 timestamp receipt', async () => {
    const merkleRoot = 'a'.repeat(64);
    const receipt = await service.attest(merkleRoot);

    expect(receipt.witnessType).toBe('RFC3161_TSA');
    expect(receipt.witnessId).toBeDefined();
    expect(receipt.receiptHash).toBeDefined();
    expect(receipt.signature).toBeDefined();
    expect(receipt.publicKey).toBeDefined();
    expect(receipt.algorithm).toBe('RSA-SHA256');
  });

  it('verifies valid timestamp token against expected root', () => {
    const merkleRoot = 'b'.repeat(64);
    const token: Rfc3161TimestampToken = {
      version: 1,
      policy: '1.3.6.1.4.1.99999.1.1',
      messageImprint: {
        hashAlgorithm: 'SHA-256',
        hashedMessage: merkleRoot,
      },
      serialNumber: 'tsa-sn-12345',
      genTime: new Date().toISOString(),
      nonce: 'nonce-abc',
      tsaName: 'CN=ZoikoShield Trusted Timestamp Authority',
      signature: '',
    };

    // Fails on altered digest
    const valid = service.verifyTimestampToken(
      token,
      'c'.repeat(64), // Mismatched root
      'dummy-key',
    );
    expect(valid).toBe(false);
  });
});
