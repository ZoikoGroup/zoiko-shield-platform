import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { GcpKmsEnvelope } from '../../../../../libs/kms/src/gcp-kms-envelope';

export interface SplitKmsConfig {
  /** Three distinct GCP Cloud KMS crypto key resource names — one per
   * share. Distinct keys (ideally distinct key rings/locations/projects)
   * so a single compromised key cannot unwrap more than one share. */
  gcpKmsKeyNames: [string, string, string];
}

export interface SplitWrappedKeyPackage {
  keyId: string;
  tenantId: string;
  purpose: string;
  shares: Array<{
    keyResourceIdentifier: string;
    wrappedShareBase64: string;
  }>;
  splitScheme: '3_OF_3_XOR_SECRET_SHARING';
  attestationDigest: string;
  createdEpochMs: number;
}

/**
 * 3-of-3 XOR Secret-Splitting Engine, real GCP Cloud KMS wrapping.
 * Specification: ZS-SEC-KEY-001 §11 (Sovereign Cryptographic Escrow)
 *
 * Splits a master key into 3 XOR shares (masterKey = share1 ^ share2 ^
 * share3, genuine information-theoretic secret sharing) and wraps each
 * share with a real, distinct GCP Cloud KMS key via GcpKmsEnvelope — the
 * same non-exportable-key custody boundary shield-anchor's checkpoint
 * signer and shield-core's evidence collector rely on. Earlier this session
 * this wrapped shares with AES keys derived locally from hardcoded,
 * publicly-visible string literals (readable by anyone with this source,
 * so no real custody existed); it modeled 3 different cloud vendors
 * (AWS/Azure/GCP) for that reason, since the security property came from
 * provider independence, not from KMS being real. This platform hosts only
 * on GCP (ADR-16) — no AWS/Azure KMS credentials or client exist anywhere
 * in this codebase — so it splits across 3 separate GCP keys instead. That
 * is real, non-exportable, KMS-backed custody per share, but it is a
 * weaker security property than true cross-provider independence: a
 * GCP-wide compromise (not just one key) could in principle threaten all 3
 * shares. Real cross-provider custody remains a scoped follow-up if a
 * second cloud vendor relationship is ever established.
 */
@Injectable()
export class SplitKmsEscrowService {
  private readonly logger = new Logger(SplitKmsEscrowService.name);

  /**
   * Generates a 256-bit master data key, splits it into 3 XOR shares, and
   * wraps each with a distinct real GCP Cloud KMS key.
   */
  async generateAndWrapSplitMasterKey(
    tenantId: string,
    purpose: string,
    config: SplitKmsConfig,
  ): Promise<{ masterKeyHex: string; wrappedPackage: SplitWrappedKeyPackage }> {
    const keyId = `escrow-key-${crypto.randomUUID()}`;
    const masterKey = crypto.randomBytes(32); // 256-bit AES-GCM master key

    // Split master key into 3 XOR shares: masterKey = share1 ^ share2 ^ share3
    const share1 = crypto.randomBytes(32);
    const share2 = crypto.randomBytes(32);
    const share3 = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      share3[i] = masterKey[i] ^ share1[i] ^ share2[i];
    }
    const rawShares = [share1, share2, share3];

    // Wrap each share with a distinct real GCP Cloud KMS key. The private
    // wrapping key never enters this process; each envelope is
    // independently non-exportable.
    const wrappedShares = await Promise.all(
      config.gcpKmsKeyNames.map(async (keyName, i) => {
        const envelope = new GcpKmsEnvelope(keyName);
        return {
          keyResourceIdentifier: keyName,
          wrappedShareBase64: await envelope.wrap(rawShares[i]),
        };
      }),
    );

    const createdEpochMs = Date.now();
    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          keyId,
          tenantId,
          purpose,
          shares: wrappedShares,
          createdEpochMs,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Generated 3-of-3 XOR split key [${keyId}] for Tenant '${tenantId}' (each share wrapped by a distinct real GCP Cloud KMS key)`,
    );

    return {
      masterKeyHex: masterKey.toString('hex'),
      wrappedPackage: {
        keyId,
        tenantId,
        purpose,
        shares: wrappedShares,
        splitScheme: '3_OF_3_XOR_SECRET_SHARING',
        attestationDigest,
        createdEpochMs,
      },
    };
  }

  /**
   * Reconstructs the 256-bit master key by unwrapping all 3 GCP KMS shares.
   */
  async unwrapAndReconstructMasterKey(
    wrappedPackage: SplitWrappedKeyPackage,
  ): Promise<string> {
    if (wrappedPackage.shares.length !== 3) {
      throw new Error(
        `Incomplete key shares: all 3 are required for reconstruction, got ${wrappedPackage.shares.length}`,
      );
    }

    const rawShares = await Promise.all(
      wrappedPackage.shares.map((share) => {
        const envelope = new GcpKmsEnvelope(share.keyResourceIdentifier);
        return envelope.unwrap(share.wrappedShareBase64);
      }),
    );

    const reconstructedMasterKey = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      reconstructedMasterKey[i] =
        rawShares[0][i] ^ rawShares[1][i] ^ rawShares[2][i];
    }

    this.logger.log(
      `✔ Reconstructed master key for [${wrappedPackage.keyId}] from its 3 XOR shares`,
    );
    return reconstructedMasterKey.toString('hex');
  }
}
