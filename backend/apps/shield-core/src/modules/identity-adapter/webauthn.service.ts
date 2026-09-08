import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebauthnCredential } from './webauthn-credential.entity';
import {
  WebauthnChallenge,
  WebauthnChallengePurpose,
} from './webauthn-challenge.entity';
import { Principal } from './principal.entity';
import {
  VerifyWebauthnRegistrationDto,
  WebauthnAssertionDto,
} from './dto/webauthn.dto';

const CHALLENGE_TTL_MS = 120_000;
const CHALLENGE_BYTES = 32;

/** ES256 first (what platform authenticators overwhelmingly produce), then RS256. */
const SUPPORTED_ALGORITHMS = [
  { type: 'public-key', alg: -7 },
  { type: 'public-key', alg: -257 },
];

export interface WebauthnRegistrationOptions {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  excludeCredentials: Array<{ type: string; id: string }>;
  authenticatorSelection: { userVerification: string; residentKey: string };
  timeout: number;
  attestation: string;
}

export interface WebauthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ type: string; id: string }>;
  userVerification: string;
  timeout: number;
}

export interface VerifiedWebauthnAssertion {
  principalId: string;
  credentialId: string;
  userVerified: boolean;
  verifiedAt: number;
}

export interface RegisteredPasskeySummary {
  id: string;
  credentialId: string;
  label: string | null;
  transports: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * Real WebAuthn/FIDO2 ceremony verification: origin and type binding, single-use
 * server-issued challenges, RP ID hash, user-presence/user-verification flags,
 * clone detection via the signature counter, and a public-key signature check
 * over authenticatorData || SHA-256(clientDataJSON).
 */
@Injectable()
export class WebauthnService {
  private readonly logger = new Logger(WebauthnService.name);
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly expectedOrigin: string;

  constructor(
    @InjectRepository(WebauthnCredential)
    private readonly credentials: Repository<WebauthnCredential>,
    @InjectRepository(WebauthnChallenge)
    private readonly challenges: Repository<WebauthnChallenge>,
    @InjectRepository(Principal)
    private readonly principals: Repository<Principal>,
  ) {
    this.rpId = process.env.WEBAUTHN_RP_ID || 'localhost';
    this.rpName = 'ZoikoShield';
    this.expectedOrigin =
      process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
  }

  async createRegistrationOptions(
    principalId: string,
  ): Promise<WebauthnRegistrationOptions> {
    const principal = await this.principals.findOne({
      where: { id: principalId },
    });
    if (!principal) {
      throw new NotFoundException('Principal not found');
    }

    const challenge = await this.issueChallenge(principalId, 'REGISTRATION');
    const existing = await this.credentials.find({
      where: { principalId, revokedAt: IsNull() },
    });

    return {
      challenge,
      rp: { id: this.rpId, name: this.rpName },
      user: {
        id: toBase64Url(Buffer.from(principal.id, 'utf8')),
        name: principal.email ?? principal.id,
        displayName: principal.fullName ?? principal.email ?? principal.id,
      },
      pubKeyCredParams: SUPPORTED_ALGORITHMS,
      // Stops a second passkey being silently enrolled on an authenticator
      // that already holds one for this principal.
      excludeCredentials: existing.map((credential) => ({
        type: 'public-key',
        id: credential.credentialId,
      })),
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: CHALLENGE_TTL_MS,
      attestation: 'none',
    };
  }

  async verifyRegistration(
    principalId: string,
    dto: VerifyWebauthnRegistrationDto,
  ): Promise<RegisteredPasskeySummary> {
    const clientData = this.parseClientData(dto.clientDataJsonBase64);
    this.assertClientDataBinding(clientData, 'webauthn.create');
    await this.consumeChallenge(
      clientData.challenge,
      'REGISTRATION',
      principalId,
    );

    const duplicate = await this.credentials.findOne({
      where: { credentialId: dto.credentialId },
    });
    if (duplicate) {
      throw new BadRequestException('This passkey is already registered');
    }

    const publicKeyPem = this.spkiToPem(dto.publicKeySpkiBase64);

    const credential = await this.credentials.save(
      this.credentials.create({
        principalId,
        credentialId: dto.credentialId,
        publicKeyPem,
        signCount: '0',
        label: dto.label ?? null,
        transports: dto.transports ?? null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );

    this.logger.log(`Passkey registered for principal ${principalId}`);
    return this.toSummary(credential);
  }

  async createAuthenticationOptions(
    email: string,
  ): Promise<WebauthnAuthenticationOptions> {
    const principal = await this.principals.findOne({ where: { email } });
    const credentials = principal
      ? await this.credentials.find({
          where: { principalId: principal.id, revokedAt: IsNull() },
        })
      : [];

    // A challenge is issued even for an unknown address so the response
    // cannot be used to enumerate registered accounts.
    const challenge = await this.issueChallenge(
      principal?.id ?? null,
      'AUTHENTICATION',
    );

    return {
      challenge,
      rpId: this.rpId,
      allowCredentials: credentials.map((credential) => ({
        type: 'public-key',
        id: credential.credentialId,
      })),
      userVerification: 'required',
      timeout: CHALLENGE_TTL_MS,
    };
  }

  async createStepUpOptions(
    principalId: string,
  ): Promise<WebauthnAuthenticationOptions> {
    const credentials = await this.credentials.find({
      where: { principalId, revokedAt: IsNull() },
    });
    if (credentials.length === 0) {
      throw new BadRequestException(
        'No passkey is registered for this principal',
      );
    }

    const challenge = await this.issueChallenge(principalId, 'STEP_UP');
    return {
      challenge,
      rpId: this.rpId,
      allowCredentials: credentials.map((credential) => ({
        type: 'public-key',
        id: credential.credentialId,
      })),
      userVerification: 'required',
      timeout: CHALLENGE_TTL_MS,
    };
  }

  /**
   * Verifies an assertion for login (purpose AUTHENTICATION) or for elevating
   * an existing session (purpose STEP_UP, pinned to `expectedPrincipalId`).
   */
  async verifyAssertion(
    dto: WebauthnAssertionDto,
    purpose: Extract<WebauthnChallengePurpose, 'AUTHENTICATION' | 'STEP_UP'>,
    expectedPrincipalId?: string,
  ): Promise<VerifiedWebauthnAssertion> {
    const clientData = this.parseClientData(dto.clientDataJsonBase64);
    this.assertClientDataBinding(clientData, 'webauthn.get');

    const credential = await this.credentials.findOne({
      where: { credentialId: dto.credentialId, revokedAt: IsNull() },
    });
    if (!credential) {
      throw new UnauthorizedException('Unknown passkey');
    }
    if (expectedPrincipalId && credential.principalId !== expectedPrincipalId) {
      throw new ForbiddenException(
        'This passkey belongs to a different principal',
      );
    }

    // Consumed against the credential's owner, so an assertion issued for one
    // account can never be redeemed against another.
    await this.consumeChallenge(
      clientData.challenge,
      purpose,
      credential.principalId,
    );

    const authData = Buffer.from(dto.authenticatorDataBase64, 'base64');
    if (authData.length < 37) {
      throw new UnauthorizedException('Malformed authenticator data');
    }

    const expectedRpIdHash = crypto
      .createHash('sha256')
      .update(this.rpId)
      .digest();
    if (!crypto.timingSafeEqual(authData.subarray(0, 32), expectedRpIdHash)) {
      throw new ForbiddenException('RP ID hash mismatch');
    }

    const flags = authData[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    if (!userPresent) {
      throw new ForbiddenException('User presence was not asserted');
    }
    if (!userVerified) {
      throw new ForbiddenException(
        'User verification is required for this ceremony',
      );
    }

    const clientDataHash = crypto
      .createHash('sha256')
      .update(Buffer.from(dto.clientDataJsonBase64, 'base64'))
      .digest();
    const signedPayload = Buffer.concat([authData, clientDataHash]);

    let signatureValid: boolean;
    try {
      const verifier = crypto.createVerify('SHA256');
      verifier.update(signedPayload);
      verifier.end();
      signatureValid = verifier.verify(
        credential.publicKeyPem,
        Buffer.from(dto.signatureBase64, 'base64'),
      );
    } catch (err) {
      throw new ForbiddenException(
        `Passkey signature could not be verified: ${(err as Error).message}`,
      );
    }
    if (!signatureValid) {
      throw new ForbiddenException('Passkey signature verification failed');
    }

    const presentedCount = authData.readUInt32BE(33);
    const storedCount = Number(credential.signCount ?? 0);
    if (
      presentedCount > 0 &&
      storedCount > 0 &&
      presentedCount <= storedCount
    ) {
      // A counter that fails to advance is the canonical cloned-authenticator
      // signal, so the credential is revoked rather than merely rejected.
      credential.revokedAt = new Date();
      await this.credentials.save(credential);
      throw new ForbiddenException(
        'Passkey signature counter did not advance; credential revoked',
      );
    }

    credential.signCount = String(presentedCount);
    credential.lastUsedAt = new Date();
    await this.credentials.save(credential);

    return {
      principalId: credential.principalId,
      credentialId: credential.credentialId,
      userVerified,
      verifiedAt: Date.now(),
    };
  }

  async listCredentials(
    principalId: string,
  ): Promise<RegisteredPasskeySummary[]> {
    const credentials = await this.credentials.find({
      where: { principalId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return credentials.map((credential) => this.toSummary(credential));
  }

  async revokeCredential(principalId: string, id: string): Promise<void> {
    const credential = await this.credentials.findOne({ where: { id } });
    if (!credential || credential.principalId !== principalId) {
      throw new NotFoundException('Passkey not found');
    }
    credential.revokedAt = new Date();
    await this.credentials.save(credential);
  }

  private async issueChallenge(
    principalId: string | null,
    purpose: WebauthnChallengePurpose,
  ): Promise<string> {
    const challenge = toBase64Url(crypto.randomBytes(CHALLENGE_BYTES));
    await this.challenges.save(
      this.challenges.create({
        principalId,
        purpose,
        challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        consumedAt: null,
      }),
    );
    await this.challenges.delete({ expiresAt: LessThan(new Date()) });
    return challenge;
  }

  private async consumeChallenge(
    challenge: string,
    purpose: WebauthnChallengePurpose,
    principalId: string,
  ): Promise<void> {
    const record = await this.challenges.findOne({
      where: { challenge, purpose, consumedAt: IsNull() },
    });
    if (!record) {
      throw new UnauthorizedException('Challenge is unknown or already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Challenge has expired');
    }
    // A challenge bound to one principal at issuance may only be redeemed by
    // that principal; usernameless authentication issues it unbound (null).
    if (record.principalId && record.principalId !== principalId) {
      throw new ForbiddenException('Challenge was issued to another principal');
    }

    const consumed = await this.challenges.update(
      { id: record.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (!consumed.affected) {
      throw new UnauthorizedException('Challenge was already used');
    }
  }

  private parseClientData(clientDataJsonBase64: string): {
    type: string;
    challenge: string;
    origin: string;
  } {
    try {
      return JSON.parse(
        Buffer.from(clientDataJsonBase64, 'base64').toString('utf8'),
      );
    } catch {
      throw new BadRequestException('Malformed clientDataJSON');
    }
  }

  private assertClientDataBinding(
    clientData: { type: string; origin: string },
    expectedType: 'webauthn.create' | 'webauthn.get',
  ): void {
    if (clientData.type !== expectedType) {
      throw new ForbiddenException('Unexpected WebAuthn ceremony type');
    }
    if (clientData.origin !== this.expectedOrigin) {
      throw new ForbiddenException('WebAuthn origin mismatch');
    }
  }

  private spkiToPem(publicKeySpkiBase64: string): string {
    try {
      return crypto
        .createPublicKey({
          key: Buffer.from(publicKeySpkiBase64, 'base64'),
          format: 'der',
          type: 'spki',
        })
        .export({ format: 'pem', type: 'spki' })
        .toString();
    } catch (err) {
      throw new BadRequestException(
        `Unsupported passkey public key: ${(err as Error).message}`,
      );
    }
  }

  private toSummary(credential: WebauthnCredential): RegisteredPasskeySummary {
    return {
      id: credential.id,
      credentialId: credential.credentialId,
      label: credential.label,
      transports: credential.transports,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
    };
  }
}
