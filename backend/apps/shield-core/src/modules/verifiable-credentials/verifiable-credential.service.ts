import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface VerifiableCredentialClaim {
  operatorId: string;
  tenantId: string;
  role:
    'SECOPS_PRIVILEGED_OPERATOR' | 'SECURITY_ENGINEER' | 'COMPLIANCE_AUDITOR';
  clearanceLevel: 'TIER_1_CRITICAL' | 'TIER_2_ELEVATED' | 'TIER_3_READONLY';
  grantedScopes: string[];
}

export interface W3CVerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: {
    id: string; // did:key:zIssuer...
    name: string;
  };
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: {
    id: string; // did:key:zSubject...
    claims: VerifiableCredentialClaim;
  };
  proof: {
    type: 'JsonWebSignature2020' | 'Ed25519Signature2020';
    created: string;
    proofPurpose: 'assertionMethod';
    verificationMethod: string;
    jwsSignatureHex: string;
  };
}

export interface VerificationResult {
  isValid: boolean;
  subjectDid: string;
  issuerDid: string;
  claims: VerifiableCredentialClaim;
  attestationDigest: string;
  verifiedAt: string;
}

/**
 * Decentralized Verifiable Credentials (W3C DID/VC) Service
 * Specification: ZS-T0-TECH-001 §15 (Decentralized Identity & Zero-Trust Access)
 */
@Injectable()
export class VerifiableCredentialService {
  private readonly logger = new Logger(VerifiableCredentialService.name);

  // Issuer Keypair (P-256 ECDSA for standard DID verification)
  private readonly issuerKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  private readonly issuerDid = `did:key:zIssuer${crypto
    .createHash('sha256')
    .update(
      this.issuerKeyPair.publicKey.export({ type: 'spki', format: 'der' }),
    )
    .digest('hex')
    .slice(0, 32)}`;

  getIssuerDid(): string {
    return this.issuerDid;
  }

  /**
   * Issues a signed W3C Verifiable Credential to an operator subject.
   */
  issueVerifiableCredential(req: {
    subjectDid: string;
    claims: VerifiableCredentialClaim;
    validityDurationHours: number;
  }): W3CVerifiableCredential {
    const vcId = `urn:uuid:${crypto.randomUUID()}`;
    const issuanceDate = new Date().toISOString();
    const expirationDate = new Date(
      Date.now() + req.validityDurationHours * 3600 * 1000,
    ).toISOString();

    const unsignedVcPayload = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://schema.zoikoshield.corp/credentials/v1',
      ],
      id: vcId,
      type: ['VerifiableCredential', 'SecurityOperatorClearanceCredential'],
      issuer: {
        id: this.issuerDid,
        name: 'ZoikoShield Master Identity Authority',
      },
      issuanceDate,
      expirationDate,
      credentialSubject: {
        id: req.subjectDid,
        claims: req.claims,
      },
    };

    // Sign payload with issuer private key
    const signer = crypto.createSign('SHA256');
    signer.update(JSON.stringify(unsignedVcPayload));
    signer.end();
    const jwsSignatureHex = signer.sign(this.issuerKeyPair.privateKey, 'hex');

    const signedVc: W3CVerifiableCredential = {
      ...unsignedVcPayload,
      proof: {
        type: 'JsonWebSignature2020',
        created: issuanceDate,
        proofPurpose: 'assertionMethod',
        verificationMethod: `${this.issuerDid}#key-1`,
        jwsSignatureHex,
      },
    };

    this.logger.log(
      `Issued W3C Verifiable Credential [${signedVc.id}] to Subject [${req.subjectDid}]`,
    );
    return signedVc;
  }

  /**
   * Cryptographically validates a W3C Verifiable Credential.
   */
  verifyVerifiableCredential(vc: W3CVerifiableCredential): VerificationResult {
    const now = Date.now();
    const exp = new Date(vc.expirationDate).getTime();

    if (now > exp) {
      this.logger.warn(
        `🚨 [VC REJECTED] Verifiable Credential ${vc.id} expired at ${vc.expirationDate}!`,
      );
      throw new UnauthorizedException('Verifiable credential expired');
    }

    if (vc.issuer.id !== this.issuerDid) {
      this.logger.warn(
        `🚨 [VC REJECTED] Untrusted Issuer DID: ${vc.issuer.id}`,
      );
      throw new UnauthorizedException('Untrusted credential issuer');
    }

    // Extract payload for signature verification
    const { proof, ...unsignedVcPayload } = vc;
    const verifier = crypto.createVerify('SHA256');
    verifier.update(JSON.stringify(unsignedVcPayload));
    verifier.end();

    const isSigValid = verifier.verify(
      this.issuerKeyPair.publicKey,
      proof.jwsSignatureHex,
      'hex',
    );
    if (!isSigValid) {
      this.logger.warn(
        `🚨 [VC REJECTED] Cryptographic signature mismatch on VC ${vc.id}!`,
      );
      throw new UnauthorizedException(
        'Invalid cryptographic proof signature on credential',
      );
    }

    const verifiedAt = new Date().toISOString();
    const attestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ vcId: vc.id, proof: vc.proof, verifiedAt }))
      .digest('hex');

    this.logger.log(
      `✔ Verified W3C Verifiable Credential [${vc.id}] for Operator [${vc.credentialSubject.claims.operatorId}]`,
    );

    return {
      isValid: true,
      subjectDid: vc.credentialSubject.id,
      issuerDid: vc.issuer.id,
      claims: vc.credentialSubject.claims,
      attestationDigest,
      verifiedAt,
    };
  }
}
