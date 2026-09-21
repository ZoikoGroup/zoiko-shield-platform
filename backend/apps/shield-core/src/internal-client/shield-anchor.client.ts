import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_ANCHOR_BASE_URL =
  process.env.SHIELD_ANCHOR_BASE_URL || 'http://localhost:3005';

export interface RequestCheckpointInput {
  tenantId: string;
  ledgerSequence: number;
  ledgerHeadHash: string;
  packageId?: string;
  packageVersion?: number;
  manifestCoreHash?: string;
}

export interface ProofEnvelope {
  checkpoint: {
    id: string;
    anchorSequence: number;
    ledgerSequence: number;
    ledgerHeadHash: string;
    packageId?: string;
    packageVersion?: number;
    manifestCoreHash?: string;
    merkleRoot: string;
    treeProfile: string;
    hashAlgorithm: string;
    canonicalizationProfile: string;
    signingKeyId: string;
    signature: string;
    witnessAssuranceState: string;
    status: string;
  };
  merkleRoot: string;
  proofsByLeafIndex: Record<
    string,
    Array<{ siblingHash: string; position: 'LEFT' | 'RIGHT' }>
  >;
  signature: string;
  signingKey: {
    keyId: string;
    publicKey: string;
    algorithm: string;
    status: string;
  };
  witnessReceipts: Array<{
    witnessId: string;
    witnessType: string;
    receiptHash: string;
    status: string;
  }>;
  witnessAssuranceState: string;
}

/**
 * shield-core's only path to shield-anchor — the anchor never reads
 * shield-core's Prisma tables directly (spec §45). Sends only the
 * manifestCoreHash + ledger-range hashes, receives the full ProofEnvelope
 * back to embed into the final manifest.
 */
@Injectable()
export class ShieldAnchorClient {
  private readonly logger = new Logger(ShieldAnchorClient.name);

  async requestCheckpoint(
    input: RequestCheckpointInput,
  ): Promise<ProofEnvelope> {
    let response: Response;
    try {
      response = await fetch(
        `${SHIELD_ANCHOR_BASE_URL}/internal/v1/checkpoints`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...workloadAuthorizationHeaders('shield-anchor'),
          },
          body: JSON.stringify(input),
        },
      );
    } catch (err) {
      this.logger.error(`shield-anchor unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ANCHOR_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-anchor returned ${response.status} for checkpoint request: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('ANCHOR_CHECKPOINT_FAILED');
    }

    const body = await response.json();
    return body.data as ProofEnvelope;
  }

  // --- Merkle Evidence Ledger & Inclusion Proofs ---
  async sealEpochBatch(items: any[]): Promise<any> {
    return this.post('/api/v1/anchor/batches/seal', { items });
  }

  async verifyProof(body: any): Promise<any> {
    return this.post('/api/v1/anchor/proofs/verify', body);
  }

  async getReceipt(epochNumber: string | number): Promise<any> {
    return this.get(`/api/v1/anchor/receipts/${epochNumber}`);
  }

  async getInclusionProof(
    epochNumber: string | number,
    leafIndex: string | number,
  ): Promise<any> {
    return this.get(`/api/v1/anchor/proofs/${epochNumber}/${leafIndex}`);
  }

  private headers(
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const traceId =
      (global as any).__currentTraceId || '0123456789abcdef0123456789abcdef';
    const spanId = '0123456789abcdef';
    return {
      'Content-Type': 'application/json',
      traceparent: `00-${traceId}-${spanId}-01`,
      'x-correlation-id': traceId,
      ...workloadAuthorizationHeaders('shield-anchor'),
      ...(extraHeaders || {}),
    };
  }

  private async get(path: string): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_ANCHOR_BASE_URL}${path}`, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch (err) {
      this.logger.error(`shield-anchor unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ANCHOR_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-anchor GET returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('ANCHOR_UNAVAILABLE');
    }

    return response.json();
  }

  private async post(path: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_ANCHOR_BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`shield-anchor unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ANCHOR_UNAVAILABLE');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `shield-anchor POST returned ${response.status} for ${path}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('ANCHOR_UNAVAILABLE');
    }

    return response.json();
  }
}
