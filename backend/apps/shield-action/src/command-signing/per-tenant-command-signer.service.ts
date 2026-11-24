import { Injectable, Logger } from '@nestjs/common';
import {
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'crypto';
import { GcpKmsSigner } from '../../../../libs/kms/src/gcp-kms-signer';
import {
  canonicalCommandPayload,
  type CommandSigningPayload,
} from './command-signer.interface';

export type TenantCommandExecutionMode = 'SIMULATION' | 'LIVE' | 'COMPENSATION';

export interface TenantSignedCommandRequest {
  tenantId: string;
  proposalId: string;
  actionType: string;
  targetRef: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  approvalRef: string;
  policyVersion: string;
  executionMode: TenantCommandExecutionMode;
  ttlSeconds?: number;
}

export interface TenantSignedCommandEnvelope {
  commandId: string;
  tenantId: string;
  proposalId: string;
  actionType: string;
  targetRef: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  approvalRef: string;
  policyVersion: string;
  executionMode: TenantCommandExecutionMode;
  expiresAt: string;
  nonce: string;
  signature: string;
  signingKeyId: string;
  signingAlgorithm: string;
  publicKey: string;
}

export interface TenantCommandVerificationResult {
  valid: boolean;
  reasonCode:
    | 'VALID'
    | 'REJECTED_EXPIRED_COMMAND'
    | 'REJECTED_REPLAY_NONCE'
    | 'REJECTED_TENANT_KEY_MISMATCH'
    | 'REJECTED_INVALID_SIGNATURE';
}

interface EphemeralTenantKeyPair {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  algorithm: string;
}

/**
 * Per-tenant cryptographic signer for governed email and SOAR commands.
 *
 * Isolation guarantees:
 * - Every tenant signs with its own key material, so a command signed under
 *   Tenant A's key cannot verify for Tenant B.
 * - In production (`NODE_ENV === 'production'`), keys MUST be GCP Cloud KMS
 *   key versions configured per tenant via `EMAIL_ACTION_TENANT_KMS_KEYS_JSON`
 *   (or `TENANT_KMS_KEY_<TENANT_ID>`). Fails closed if missing — ephemeral
 *   in-process keys never run in production.
 * - Outside production, honors any configured tenant KMS key version and
 *   otherwise generates an isolated ephemeral ECDSA P-256 keypair per tenant.
 * - Tracks consumed nonces per tenant to block replay attacks.
 */
@Injectable()
export class PerTenantCommandSignerService {
  private readonly logger = new Logger(PerTenantCommandSignerService.name);
  private readonly kmsSigners = new Map<string, GcpKmsSigner>();
  private readonly devKeys = new Map<string, EphemeralTenantKeyPair>();
  private readonly consumedNonces = new Set<string>();

  private buildCanonicalBytes(
    envelope: Pick<
      TenantSignedCommandEnvelope,
      | 'commandId'
      | 'tenantId'
      | 'proposalId'
      | 'actionType'
      | 'targetRef'
      | 'authorityLevel'
      | 'approvalRef'
      | 'policyVersion'
      | 'expiresAt'
      | 'nonce'
      | 'executionMode'
    >,
  ): string {
    const basePayload: CommandSigningPayload = {
      commandId: envelope.commandId,
      tenantId: envelope.tenantId,
      actionType: `${envelope.actionType}:${envelope.proposalId}`,
      targetRef: envelope.targetRef,
      authorityLevel: envelope.authorityLevel,
      approvalRef: envelope.approvalRef,
      policyVersion: envelope.policyVersion,
      expiresAt: envelope.expiresAt,
      nonce: envelope.nonce,
      executionMode:
        envelope.executionMode === 'SIMULATION' ? 'SIMULATION' : 'LIVE',
    };
    return `${canonicalCommandPayload(basePayload)}|${envelope.executionMode}`;
  }

  private resolveTenantKmsKeyVersion(tenantId: string): string | null {
    const rawMap = process.env.EMAIL_ACTION_TENANT_KMS_KEYS_JSON?.trim();
    if (rawMap) {
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(rawMap) as Record<string, string>;
      } catch (err) {
        throw new Error(
          `Invalid EMAIL_ACTION_TENANT_KMS_KEYS_JSON: ${(err as Error).message}`,
        );
      }
      const mapped = parsed[tenantId]?.trim();
      if (mapped) return mapped;
    }

    const envSuffix = tenantId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    const direct = process.env[`TENANT_KMS_KEY_${envSuffix}`]?.trim();
    if (direct) return direct;

    if (
      process.env.ALLOW_SHARED_KMS_FALLBACK === 'true' &&
      process.env.ACTION_COMMAND_KMS_KEY_VERSION?.trim()
    ) {
      return process.env.ACTION_COMMAND_KMS_KEY_VERSION.trim();
    }

    return null;
  }

  private getOrCreateKmsSigner(keyVersion: string): GcpKmsSigner {
    let signer = this.kmsSigners.get(keyVersion);
    if (!signer) {
      signer = new GcpKmsSigner(keyVersion);
      this.kmsSigners.set(keyVersion, signer);
    }
    return signer;
  }

  private getOrCreateDevKeyPair(tenantId: string): EphemeralTenantKeyPair {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `TENANT_SIGNING_KEY_MISSING: No Cloud KMS key configured for tenant '${tenantId}' in production (set EMAIL_ACTION_TENANT_KMS_KEYS_JSON or TENANT_KMS_KEY_<TENANT>).`,
      );
    }
    let pair = this.devKeys.get(tenantId);
    if (!pair) {
      const { publicKey, privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      pair = {
        keyId: `dev-tenant-key:${tenantId}:${randomUUID().slice(0, 8)}`,
        privateKeyPem: privateKey,
        publicKeyPem: publicKey,
        algorithm: 'ECDSA_SHA_256',
      };
      this.devKeys.set(tenantId, pair);
      this.logger.warn(
        `Generated isolated ephemeral P-256 signing key for tenant=${tenantId} (keyId=${pair.keyId}) — non-production only.`,
      );
    }
    return pair;
  }

  async getTenantPublicKey(tenantId: string): Promise<{
    signingKeyId: string;
    publicKey: string;
    algorithm: string;
  }> {
    const kmsKey = this.resolveTenantKmsKeyVersion(tenantId);
    if (kmsKey) {
      const signer = this.getOrCreateKmsSigner(kmsKey);
      return {
        signingKeyId: signer.keyId,
        publicKey: await signer.publicKey(),
        algorithm: signer.algorithm,
      };
    }
    const devPair = this.getOrCreateDevKeyPair(tenantId);
    return {
      signingKeyId: devPair.keyId,
      publicKey: devPair.publicKeyPem,
      algorithm: devPair.algorithm,
    };
  }

  async signCommand(
    request: TenantSignedCommandRequest,
  ): Promise<TenantSignedCommandEnvelope> {
    if (!request.tenantId?.trim()) {
      throw new Error('TENANT_ID_REQUIRED_FOR_SIGNING');
    }
    const ttlSeconds = request.ttlSeconds ?? 300;
    const unsigned = {
      commandId: `cmd-email-${randomUUID()}`,
      tenantId: request.tenantId,
      proposalId: request.proposalId,
      actionType: request.actionType,
      targetRef: request.targetRef,
      authorityLevel: request.authorityLevel,
      approvalRef: request.approvalRef,
      policyVersion: request.policyVersion,
      executionMode: request.executionMode,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      nonce: randomBytes(16).toString('hex'),
    };

    const canonical = this.buildCanonicalBytes(unsigned);
    const kmsKey = this.resolveTenantKmsKeyVersion(request.tenantId);

    if (kmsKey) {
      const signer = this.getOrCreateKmsSigner(kmsKey);
      const [signature, publicKey] = await Promise.all([
        signer.sign(canonical),
        signer.publicKey(),
      ]);
      return {
        ...unsigned,
        signature,
        signingKeyId: signer.keyId,
        signingAlgorithm: signer.algorithm,
        publicKey,
      };
    }

    const devPair = this.getOrCreateDevKeyPair(request.tenantId);
    const sign = createSign('SHA256');
    sign.update(canonical);
    sign.end();

    return {
      ...unsigned,
      signature: sign.sign(devPair.privateKeyPem, 'hex'),
      signingKeyId: devPair.keyId,
      signingAlgorithm: devPair.algorithm,
      publicKey: devPair.publicKeyPem,
    };
  }

  async verifyAndConsumeCommand(
    envelope: TenantSignedCommandEnvelope,
  ): Promise<TenantCommandVerificationResult> {
    const nonceKey = `${envelope.tenantId}:${envelope.nonce}`;
    if (this.consumedNonces.has(nonceKey)) {
      return { valid: false, reasonCode: 'REJECTED_REPLAY_NONCE' };
    }

    const expiresMs = Date.parse(envelope.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      return { valid: false, reasonCode: 'REJECTED_EXPIRED_COMMAND' };
    }

    const tenantKey = await this.getTenantPublicKey(envelope.tenantId);
    if (envelope.signingKeyId !== tenantKey.signingKeyId) {
      return { valid: false, reasonCode: 'REJECTED_TENANT_KEY_MISMATCH' };
    }

    const canonical = this.buildCanonicalBytes(envelope);
    const kmsKey = this.resolveTenantKmsKeyVersion(envelope.tenantId);

    let signatureValid = false;
    if (kmsKey) {
      const signer = this.getOrCreateKmsSigner(kmsKey);
      signatureValid = await signer.verify(
        canonical,
        envelope.signature,
        tenantKey.publicKey,
      );
    } else {
      try {
        const verifier = createVerify('SHA256');
        verifier.update(canonical);
        verifier.end();
        signatureValid = verifier.verify(
          tenantKey.publicKey,
          envelope.signature,
          'hex',
        );
      } catch {
        signatureValid = false;
      }
    }

    if (!signatureValid) {
      return { valid: false, reasonCode: 'REJECTED_INVALID_SIGNATURE' };
    }

    this.consumedNonces.add(nonceKey);
    return { valid: true, reasonCode: 'VALID' };
  }
}
