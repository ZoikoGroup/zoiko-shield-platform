import { TeeEnclaveAttestationService } from './tee-enclave-attestation.service';
import { UnauthorizedException } from '@nestjs/common';

describe('TeeEnclaveAttestationService', () => {
  let teeService: TeeEnclaveAttestationService;

  beforeEach(() => {
    teeService = new TeeEnclaveAttestationService();
  });

  it('should verify legitimate AMD SEV-SNP hardware enclave quote', () => {
    const quote = {
      architecture: 'AMD_SEV_SNP' as const,
      pcr0Measurement: 'a6c382348508e331b262b9f36b69cbd8f615598fa20fb9725f49d3b769f3ff2a',
      pcr1Measurement: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      pcr2Measurement: 'aaaabbbbccccddddeeeeffff1111222233334444555566667777888899990000',
      enclavePublicKeyDerHex: '3059301306072a8648ce3d020106082a8648ce3d03010703420004...',
      isProductionMode: true,
      vendorCertificateChain: ['amd-vcek-cert-base64', 'amd-root-ca-base64'],
      signatureDerHex: '3045022100...',
    };

    const receipt = teeService.verifyEnclaveQuote(quote);

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.status).toBe('ATTESTED_CONFIDENTIAL_ENCLAVE');
    expect(receipt.architecture).toBe('AMD_SEV_SNP');
    expect(receipt.pcr0Valid).toBe(true);
    expect(receipt.enclaveIdentityDigest).toBeDefined();
  });

  it('should reject debug mode enclave quotes', () => {
    const debugQuote = {
      architecture: 'INTEL_SGX_TDX' as const,
      pcr0Measurement: 'a6c382348508e331b262b9f36b69cbd8f615598fa20fb9725f49d3b769f3ff2a',
      pcr1Measurement: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      pcr2Measurement: 'aaaabbbbccccddddeeeeffff1111222233334444555566667777888899990000',
      enclavePublicKeyDerHex: '3059...',
      isProductionMode: false, // Debug mode!
      vendorCertificateChain: [],
      signatureDerHex: '3045...',
    };

    expect(() => {
      teeService.verifyEnclaveQuote(debugQuote);
    }).toThrow(UnauthorizedException);
  });

  it('should reject quotes with unauthorized PCR0 measurement', () => {
    const untrustedQuote = {
      architecture: 'AWS_NITRO_ENCLAVE' as const,
      pcr0Measurement: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // Unknown binary hash
      pcr1Measurement: '1111...',
      pcr2Measurement: '2222...',
      enclavePublicKeyDerHex: '3059...',
      isProductionMode: true,
      vendorCertificateChain: [],
      signatureDerHex: '3045...',
    };

    expect(() => {
      teeService.verifyEnclaveQuote(untrustedQuote);
    }).toThrow(UnauthorizedException);
  });
});
