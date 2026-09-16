import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { COLLECTOR_SIGNER } from './collector-signer.interface';
import type {
  CollectorSigner,
  CollectorSigningPayload,
} from './collector-signer.interface';

export interface CollectorSignature {
  signature: string;
  signingKeyId: string;
  nonce: string;
}

/**
 * Binds an evidence artifact to the collector that produced it (§10:
 * "signature binds artifact hash, tenant, source, evidence type, observed
 * period, collector identity/version and nonce").
 *
 * content_hash alone only proves the bytes haven't changed since we stored
 * them — it says nothing about who submitted them, so a spoofed collector's
 * bytes would be indistinguishable from a legitimate one's.
 *
 * Only the public key is persisted (SigningKey); private material stays in
 * KMS (production) or in-process (dev).
 */
@Injectable()
export class CollectorSignatureService {
  private readonly logger = new Logger(CollectorSignatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COLLECTOR_SIGNER) private readonly signer: CollectorSigner,
  ) {}

  async sign(
    payload: Omit<CollectorSigningPayload, 'nonce'>,
  ): Promise<CollectorSignature | null> {
    const nonce = randomUUID();
    try {
      const result = await this.signer.sign({ ...payload, nonce });
      await this.rememberPublicKey(
        result.signingKeyId,
        result.publicKey,
        result.algorithm,
      );
      return {
        signature: result.signature,
        signingKeyId: result.signingKeyId,
        nonce,
      };
    } catch (err) {
      // An unsigned record is worse than no record only if it silently
      // claims to be signed — it is stored with null signature fields and
      // verify() reports UNSIGNED rather than pretending it verified.
      this.logger.error(
        `Collector signing failed for ${payload.sourceSystemId}/${payload.evidenceType}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Returns null when the record carries no signature at all, so callers can
   * tell "not signed" apart from "signed and the signature is wrong".
   */
  async verify(record: {
    content_hash: string;
    tenant_id: string;
    source_system_id: string;
    evidence_type: string;
    source_observed_at?: Date | null;
    collector_id?: string | null;
    collector_version?: string | null;
    collector_signature?: string | null;
    collector_signing_key_id?: string | null;
    collector_nonce?: string | null;
  }): Promise<boolean | null> {
    if (
      !record.collector_signature ||
      !record.collector_signing_key_id ||
      !record.collector_nonce
    ) {
      return null;
    }

    const key = await this.prisma.signingKey.findUnique({
      where: { key_id: record.collector_signing_key_id },
    });
    if (!key) {
      this.logger.warn(
        `No public key on record for collector signing key '${record.collector_signing_key_id}'`,
      );
      return false;
    }

    return this.signer.verify(
      {
        contentHash: record.content_hash,
        tenantId: record.tenant_id,
        sourceSystemId: record.source_system_id,
        evidenceType: record.evidence_type,
        sourceObservedAt: record.source_observed_at ?? undefined,
        collectorId: record.collector_id ?? undefined,
        collectorVersion: record.collector_version ?? undefined,
        nonce: record.collector_nonce,
      },
      record.collector_signature,
      key.public_key,
    );
  }

  private async rememberPublicKey(
    keyId: string,
    publicKey: string,
    algorithm: string,
  ) {
    await this.prisma.signingKey.upsert({
      where: { key_id: keyId },
      create: {
        key_id: keyId,
        public_key: publicKey,
        algorithm,
        status: 'ACTIVE',
      },
      update: {},
    });
  }
}
