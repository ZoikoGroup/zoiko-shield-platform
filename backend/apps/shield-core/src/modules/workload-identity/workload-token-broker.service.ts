import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export type MicroserviceSatellite =
  | 'shield-core'
  | 'shield-ingest'
  | 'shield-ai'
  | 'shield-action'
  | 'shield-anchor'
  | 'verifier-cli';

export interface WorkloadIdentityClaims {
  spiffeId: string;
  sourceService: MicroserviceSatellite;
  targetService: MicroserviceSatellite;
  tenantId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssuedWorkloadToken {
  token: string;
  spiffeId: string;
  expiresInSeconds: number;
  nonce: string;
}

/**
 * Ephemeral Workload Attestation & mTLS Token Broker
 * Issues short-lived cryptographic tokens for Zero-Trust satellite-to-satellite RPC communication.
 */
@Injectable()
export class WorkloadTokenBrokerService {
  private readonly logger = new Logger(WorkloadTokenBrokerService.name);
  private readonly hmacSecret =
    process.env.WORKLOAD_MTLS_SECRET ||
    'zoiko-internal-mtls-ephemeral-secret-32-bytes-minimum';
  private readonly consumedNonces = new Set<string>();

  /**
   * Issues short-lived (5-minute TTL) SPIFFE workload token.
   */
  issueToken(
    sourceService: MicroserviceSatellite,
    targetService: MicroserviceSatellite,
    tenantId: string,
    ttlSeconds = 300,
  ): IssuedWorkloadToken {
    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const spiffeId = `spiffe://zoikoshield.internal/ns/production/sa/${sourceService}`;

    const claims: WorkloadIdentityClaims = {
      spiffeId,
      sourceService,
      targetService,
      tenantId,
      nonce,
      issuedAt: now,
      expiresAt: now + ttlSeconds,
    };

    const header = Buffer.from(
      JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
        cty: 'zoiko-spiffe-workload',
      }),
    ).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const token = `${header}.${payload}.${signature}`;

    this.logger.log(
      `✔ [WORKLOAD TOKEN ISSUED] '${sourceService}' ➔ '${targetService}' (SPIFFE: ${spiffeId}, Tenant: ${tenantId})`,
    );

    return {
      token,
      spiffeId,
      expiresInSeconds: ttlSeconds,
      nonce,
    };
  }

  /**
   * Verifies incoming workload identity token and protects against replay attacks.
   */
  verifyToken(
    token: string,
    expectedTargetService: MicroserviceSatellite,
  ): WorkloadIdentityClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException(
        'INVALID_WORKLOAD_TOKEN: Malformed token parts',
      );
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signatureB64 !== expectedSig) {
      throw new UnauthorizedException(
        'INVALID_WORKLOAD_SIGNATURE: Cryptographic signature mismatch',
      );
    }

    const claims: WorkloadIdentityClaims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    );

    const now = Math.floor(Date.now() / 1000);
    if (claims.expiresAt < now) {
      throw new UnauthorizedException(
        `WORKLOAD_TOKEN_EXPIRED: Token expired at ${claims.expiresAt}`,
      );
    }

    if (claims.targetService !== expectedTargetService) {
      throw new ForbiddenException(
        `WORKLOAD_TARGET_MISMATCH: Token intended for '${claims.targetService}' but received by '${expectedTargetService}'`,
      );
    }

    // Replay attack prevention
    if (this.consumedNonces.has(claims.nonce)) {
      throw new ForbiddenException(
        `WORKLOAD_REPLAY_ATTACK_DETECTED: Nonce '${claims.nonce}' has already been consumed`,
      );
    }
    this.consumedNonces.add(claims.nonce);

    this.logger.log(
      `✔ [WORKLOAD AUTHENTICATED] Verified '${claims.sourceService}' calling '${claims.targetService}' on Tenant '${claims.tenantId}'`,
    );

    return claims;
  }
}
