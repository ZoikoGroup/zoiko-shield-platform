import { VerifiableCredentialService } from './verifiable-credential.service';
import { UnauthorizedException } from '@nestjs/common';

describe('VerifiableCredentialService', () => {
  let vcService: VerifiableCredentialService;

  beforeEach(() => {
    vcService = new VerifiableCredentialService();
  });

  it('should issue and cryptographically verify a valid W3C Verifiable Credential', () => {
    const subjectDid = 'did:key:zSubject998811223344';

    const vc = vcService.issueVerifiableCredential({
      subjectDid,
      claims: {
        operatorId: 'operator-alice-99',
        tenantId: 'tenant-enterprise-01',
        role: 'SECOPS_PRIVILEGED_OPERATOR',
        clearanceLevel: 'TIER_1_CRITICAL',
        grantedScopes: ['soar:execute:freeze', 'kms:decrypt:evidence'],
      },
      validityDurationHours: 8,
    });

    expect(vc.id).toBeDefined();
    expect(vc.issuer.id).toBe(vcService.getIssuerDid());
    expect(vc.proof.jwsSignatureHex).toBeDefined();

    const verification = vcService.verifyVerifiableCredential(vc);
    expect(verification.isValid).toBe(true);
    expect(verification.claims.operatorId).toBe('operator-alice-99');
    expect(verification.claims.role).toBe('SECOPS_PRIVILEGED_OPERATOR');
    expect(verification.attestationDigest).toBeDefined();
  });

  it('should reject expired verifiable credentials', () => {
    const subjectDid = 'did:key:zSubjectExpired';

    const vc = vcService.issueVerifiableCredential({
      subjectDid,
      claims: {
        operatorId: 'operator-expired',
        tenantId: 'tenant-01',
        role: 'SECURITY_ENGINEER',
        clearanceLevel: 'TIER_2_ELEVATED',
        grantedScopes: ['alerts:read'],
      },
      validityDurationHours: -1, // Expired 1 hour ago
    });

    expect(() => {
      vcService.verifyVerifiableCredential(vc);
    }).toThrow(UnauthorizedException);
  });

  it('should reject tampered verifiable credentials', () => {
    const subjectDid = 'did:key:zSubjectTamper';

    const vc = vcService.issueVerifiableCredential({
      subjectDid,
      claims: {
        operatorId: 'operator-bob',
        tenantId: 'tenant-01',
        role: 'COMPLIANCE_AUDITOR',
        clearanceLevel: 'TIER_3_READONLY',
        grantedScopes: ['audit:read'],
      },
      validityDurationHours: 4,
    });

    // Tamper with clearance level after signing
    vc.credentialSubject.claims.clearanceLevel = 'TIER_1_CRITICAL';

    expect(() => {
      vcService.verifyVerifiableCredential(vc);
    }).toThrow(UnauthorizedException);
  });
});
