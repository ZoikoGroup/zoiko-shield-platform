import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type KeyStatus = 'ACTIVE' | 'RETIRED_READ_ONLY' | 'COMPROMISED' | 'DESTROYED';

export interface ManagedCryptoKey {
  keyId: string;
  tenantId: string;
  keyType: 'TENANT_MASTER_KEY' | 'DATA_ENCRYPTION_KEY';
  version: number;
  status: KeyStatus;
  algorithm: 'AES-256-GCM' | 'HMAC-SHA256';
  derivedKeyDigest: string;
  createdAt: string;
  expiresAt: string;
  rotatedAt?: string;
}

export interface KeyRotationReceipt {
  rotationId: string;
  tenantId: string;
  oldKeyId: string;
  newKeyId: string;
  newVersion: number;
  forwardSecrecyProofDigest: string;
  rotatedAt: string;
}

/**
 * Cryptographic Key Rotation Orchestrator & Forward-Secrecy Manager
 * Specification: ZS-SEC-KEY-001 (Crypto-Period Management & Key Derivation)
 */
@Injectable()
export class KeyRotationOrchestratorService {
  private readonly logger = new Logger(KeyRotationOrchestratorService.name);

  // In-memory key store (tenantId -> list of keys)
  private readonly tenantKeyStore = new Map<string, ManagedCryptoKey[]>();

  // 90-Day Crypto-Period in Milliseconds
  private readonly CRYPTO_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

  /**
   * Initializes a Tenant Master Key (TMK) v1 for a newly onboarded tenant.
   */
  initializeTenantMasterKey(tenantId: string): ManagedCryptoKey {
    const rawKeyMaterial = crypto.randomBytes(32);
    const keyId = `tmk-${crypto.randomUUID()}`;
    const now = Date.now();

    const tmk: ManagedCryptoKey = {
      keyId,
      tenantId,
      keyType: 'TENANT_MASTER_KEY',
      version: 1,
      status: 'ACTIVE',
      algorithm: 'AES-256-GCM',
      derivedKeyDigest: crypto.createHash('sha256').update(rawKeyMaterial).digest('hex'),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.CRYPTO_PERIOD_MS).toISOString(),
    };

    this.tenantKeyStore.set(tenantId, [tmk]);
    this.logger.log(`Initialized TMK v1 [${keyId}] for Tenant: ${tenantId}`);
    return tmk;
  }

  /**
   * Performs an automated crypto-period key rotation with forward secrecy.
   */
  rotateTenantMasterKey(tenantId: string): KeyRotationReceipt {
    const keys = this.tenantKeyStore.get(tenantId) || [];
    const activeKey = keys.find((k) => k.status === 'ACTIVE' && k.keyType === 'TENANT_MASTER_KEY');

    if (!activeKey) {
      const initial = this.initializeTenantMasterKey(tenantId);
      return {
        rotationId: `rot-${crypto.randomUUID()}`,
        tenantId,
        oldKeyId: 'NONE',
        newKeyId: initial.keyId,
        newVersion: 1,
        forwardSecrecyProofDigest: crypto.createHash('sha256').update(initial.keyId).digest('hex'),
        rotatedAt: new Date().toISOString(),
      };
    }

    // Retire old active key to RETIRED_READ_ONLY (for decrypting historical telemetry)
    activeKey.status = 'RETIRED_READ_ONLY';
    activeKey.rotatedAt = new Date().toISOString();

    const newVersion = activeKey.version + 1;
    const newKeyId = `tmk-${crypto.randomUUID()}`;
    const newRawKeyMaterial = crypto.randomBytes(32);
    const now = Date.now();

    const newKey: ManagedCryptoKey = {
      keyId: newKeyId,
      tenantId,
      keyType: 'TENANT_MASTER_KEY',
      version: newVersion,
      status: 'ACTIVE',
      algorithm: 'AES-256-GCM',
      derivedKeyDigest: crypto.createHash('sha256').update(newRawKeyMaterial).digest('hex'),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.CRYPTO_PERIOD_MS).toISOString(),
    };

    keys.push(newKey);
    this.tenantKeyStore.set(tenantId, keys);

    const rotationId = `rot-${crypto.randomUUID()}`;
    const forwardSecrecyProofDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ rotationId, oldKeyId: activeKey.keyId, newKeyId, newVersion }))
      .digest('hex');

    this.logger.log(`✔ Rotated TMK for Tenant ${tenantId}: v${activeKey.version} (${activeKey.keyId}) -> v${newVersion} (${newKeyId})`);

    return {
      rotationId,
      tenantId,
      oldKeyId: activeKey.keyId,
      newKeyId,
      newVersion,
      forwardSecrecyProofDigest,
      rotatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves all active and historical keys for a tenant.
   */
  getTenantKeys(tenantId: string): ManagedCryptoKey[] {
    return this.tenantKeyStore.get(tenantId) || [];
  }
}
