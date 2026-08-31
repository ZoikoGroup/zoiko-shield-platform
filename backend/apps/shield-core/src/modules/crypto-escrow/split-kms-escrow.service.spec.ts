import { SplitKmsEscrowService } from './split-kms-escrow.service';

describe('SplitKmsEscrowService', () => {
  let escrowService: SplitKmsEscrowService;

  beforeEach(() => {
    escrowService = new SplitKmsEscrowService();
  });

  it('should generate split master key across 3 cloud providers and reconstruct exact plaintext key', () => {
    const tenantId = 'tenant-sovereign-bank-01';
    const config = {
      awsKmsKeyArn: 'arn:aws:kms:us-east-1:112233445566:key/aws-root-key',
      azureKeyVaultUri:
        'https://sovereign-vault.vault.azure.net/keys/azure-root-key',
      gcpKmsKeyName:
        'projects/p/locations/europe-west3/keyRings/r/cryptoKeys/gcp-root-key',
    };

    const { masterKeyHex, wrappedPackage } =
      escrowService.generateAndWrapSplitMasterKey(
        tenantId,
        'EVIDENCE_VAULT_ENCRYPTION',
        config,
      );

    expect(masterKeyHex).toBeDefined();
    expect(wrappedPackage.keyId).toBeDefined();
    expect(wrappedPackage.shares.length).toBe(3);
    expect(wrappedPackage.attestationDigest).toBeDefined();

    // Reconstruct
    const reconstructedHex =
      escrowService.unwrapAndReconstructMasterKey(wrappedPackage);
    expect(reconstructedHex).toBe(masterKeyHex);
  });
});
