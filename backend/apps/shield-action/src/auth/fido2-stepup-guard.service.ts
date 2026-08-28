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

interface RegisteredCredential {
  credentialId: string;
  analystId: string;
  publicKeyPem: string;
  signCount: number;
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
  private readonly credentials = new Map<string, RegisteredCredential>();
  private readonly rpId: string;
  private readonly expectedOrigin: string;

  // Challenge TTL = 2 minutes (120,000ms)
  private readonly CHALLENGE_TTL_MS = 120_000;

  constructor(
    rpId = process.env.WEBAUTHN_RP_ID || 'security.zoikoshield.corp',
    expectedOrigin = process.env.WEBAUTHN_ORIGIN || 'https://security.zoikoshield.corp',
  ) {
    this.rpId = rpId;
    this.expectedOrigin = expectedOrigin;
  }

  registerCredential(credential: {
    credentialId: string;
    analystId: string;
    publicKeyPem: string;
    signCount?: number;
  }): void {
    if (!credential.credentialId || !credential.analystId || !credential.publicKeyPem) {
      throw new UnauthorizedException('Incomplete WebAuthn credential registration');
    }

    this.credentials.set(credential.credentialId, {
      credentialId: credential.credentialId,
      analystId: credential.analystId,
      publicKeyPem: credential.publicKeyPem,
      signCount: credential.signCount ?? 0,
    });
  }

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

    if (clientData.type !== 'webauthn.get' || clientData.origin !== this.expectedOrigin) {
      throw new ForbiddenException('Invalid WebAuthn client data binding');
    }

    const credential = this.credentials.get(assertion.credentialId);
    if (!credential || credential.analystId !== session.analystId) {
      throw new UnauthorizedException('WebAuthn credential is not registered for this analyst');
    }

    // Verify ECDSA signature over authenticatorData || clientDataHash
    const clientDataHash = crypto
      .createHash('sha256')
      .update(Buffer.from(assertion.clientDataJsonBase64, 'base64'))
      .digest();
    const authDataBuf = Buffer.from(assertion.authenticatorDataBase64, 'base64');
    if (authDataBuf.length < 37) {
      throw new UnauthorizedException('Invalid WebAuthn authenticator data');
    }

    const expectedRpIdHash = crypto.createHash('sha256').update(this.rpId).digest();
    if (!crypto.timingSafeEqual(authDataBuf.subarray(0, 32), expectedRpIdHash)) {
      throw new ForbiddenException('WebAuthn RP ID hash mismatch');
    }

    const flags = authDataBuf[32];
    const userPresenceVerified = (flags & 0x01) !== 0;
    const userVerificationVerified = (flags & 0x04) !== 0;
    if (!userPresenceVerified || !userVerificationVerified) {
      throw new ForbiddenException('WebAuthn user presence and verification are required');
    }

    const signCount = authDataBuf.readUInt32BE(33);
    if (credential.signCount > 0 && signCount > 0 && signCount <= credential.signCount) {
      throw new ForbiddenException('WebAuthn signature counter did not advance');
    }

    const signedBuffer = Buffer.concat([authDataBuf, clientDataHash]);

    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(signedBuffer);
      verify.end();
      const isValid = verify.verify(
        credential.publicKeyPem,
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
    credential.signCount = signCount;

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
      userPresenceVerified,
      userVerificationVerified,
      expiresAt: grantExpiresAt,
      stepUpAttestationDigest,
    };
  }
}
