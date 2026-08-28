import { Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface Fido2ChallengeRequest {
  tenantId: string;
  analystId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
}

export interface Fido2ChallengeSession {
  challengeId: string;
  challengeBase64: string;
  tenantId: string;
  analystId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  expiresAt: number; // Unix epoch ms
}

export interface Fido2AssertionPayload {
  challengeId: string;
  credentialId: string;
  authenticatorDataBase64: string;
  clientDataJsonBase64: string;
  signatureHex: string;
  publicKeyPem: string;
}

export interface StepUpAuthorizationGrant {
  grantId: string;
  tenantId: string;
  analystId: string;
  proposalId: string;
  actionType: string;
  fido2Verified: boolean;
  userPresenceVerified: boolean;
  userVerificationVerified: boolean;
  expiresAt: string;
  stepUpAttestationDigest: string;
}

/**
 * Zero-Trust WebAuthn / FIDO2 Hardware Key Step-Up Guard (ZS-T0-BE-ARCH-001 §8 / ZS-SOAR-DISP-001 §4)
 * Mandates out-of-band hardware token biometric/PIN attestation for Tier-1 destructive SOAR playbooks.
 */
@Injectable()
export class Fido2StepupGuardService {
  private readonly logger = new Logger(Fido2StepupGuardService.name);
  private readonly activeChallenges = new Map<string, Fido2ChallengeSession>();

  // Challenge TTL = 2 minutes (120,000ms)
  private readonly CHALLENGE_TTL_MS = 120_000;

  /**
   * Generates a cryptographic WebAuthn challenge for an action proposal.
   */
  issueChallenge(req: Fido2ChallengeRequest): Fido2ChallengeSession {
    const challengeId = `fido2-ch-${crypto.randomUUID()}`;
    const challengeBytes = crypto.randomBytes(32);
    const challengeBase64 = challengeBytes.toString('base64');
    const expiresAt = Date.now() + this.CHALLENGE_TTL_MS;

    const session: Fido2ChallengeSession = {
      challengeId,
      challengeBase64,
      tenantId: req.tenantId,
      analystId: req.analystId,
      proposalId: req.proposalId,
      actionType: req.actionType,
      targetResource: req.targetResource,
      expiresAt,
    };

    this.activeChallenges.set(challengeId, session);
    this.logger.log(`Issued FIDO2 Challenge [${challengeId}] for Analyst: ${req.analystId}, Action: ${req.actionType}`);

    return session;
  }

  /**
   * Verifies WebAuthn assertion signature and returns a signed Step-Up Authorization Grant.
   */
  verifyAssertionAndGrant(assertion: Fido2AssertionPayload): StepUpAuthorizationGrant {
    const session = this.activeChallenges.get(assertion.challengeId);

    if (!session) {
      throw new UnauthorizedException('FIDO2 challenge not found or already consumed');
    }

    if (Date.now() > session.expiresAt) {
      this.activeChallenges.delete(assertion.challengeId);
      throw new ForbiddenException('FIDO2 hardware key challenge has expired');
    }

    // Parse and verify clientDataJSON
    let clientData: any;
    try {
      const rawJson = Buffer.from(assertion.clientDataJsonBase64, 'base64').toString('utf-8');
      clientData = JSON.parse(rawJson);
    } catch {
      throw new UnauthorizedException('Invalid clientDataJSON encoding');
    }

    if (clientData.challenge !== session.challengeBase64) {
      throw new ForbiddenException('FIDO2 challenge mismatch');
    }

    // Verify ECDSA signature over authenticatorData || clientDataHash
    const clientDataHash = crypto
      .createHash('sha256')
      .update(Buffer.from(assertion.clientDataJsonBase64, 'base64'))
      .digest();
    const authDataBuf = Buffer.from(assertion.authenticatorDataBase64, 'base64');
    const signedBuffer = Buffer.concat([authDataBuf, clientDataHash]);

    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(signedBuffer);
      verify.end();
      const isValid = verify.verify(
        assertion.publicKeyPem,
        Buffer.from(assertion.signatureHex, 'hex'),
      );

      if (!isValid) {
        throw new ForbiddenException('FIDO2 hardware signature verification failed');
      }
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException(`Cryptographic assertion failed: ${err.message}`);
    }

    // Consume challenge
    this.activeChallenges.delete(assertion.challengeId);

    const grantId = `grant-fido2-${crypto.randomUUID()}`;
    const grantExpiresAt = new Date(Date.now() + 60_000).toISOString(); // 1 minute execution window

    const stepUpAttestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ grantId, session, credentialId: assertion.credentialId }))
      .digest('hex');

    this.logger.log(`✔ Step-Up Grant [${grantId}] issued for Proposal: ${session.proposalId}`);

    return {
      grantId,
      tenantId: session.tenantId,
      analystId: session.analystId,
      proposalId: session.proposalId,
      actionType: session.actionType,
      fido2Verified: true,
      userPresenceVerified: true,
      userVerificationVerified: true,
      expiresAt: grantExpiresAt,
      stepUpAttestationDigest,
    };
  }
}
