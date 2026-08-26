import { Injectable, Logger } from '@nestjs/common';

export interface ChainCheckpointHeader {
  epoch: number;
  tenantId: string;
  previousEpochRoot: string;
  currentEpochRoot: string;
  publishedSignature: string;
  witnessCount: number;
}

export interface EquivocationCheckResult {
  status: 'CONSISTENT' | 'EQUIVOCATION_DETECTED' | 'CHAIN_FORK';
  tenantId: string;
  violatingEpoch?: number;
  details?: string;
}

@Injectable()
export class AntiEquivocationService {
  private readonly logger = new Logger(AntiEquivocationService.name);
  private readonly knownEpochCommitments = new Map<
    string,
    ChainCheckpointHeader
  >();

  recordCommitment(header: ChainCheckpointHeader): EquivocationCheckResult {
    const key = `${header.tenantId}:epoch:${header.epoch}`;
    const existing = this.knownEpochCommitments.get(key);

    if (existing) {
      if (existing.currentEpochRoot !== header.currentEpochRoot) {
        this.logger.error(
          `EQUIVOCATION DETECTED on tenant ${header.tenantId}, epoch ${header.epoch}! Conflicting roots: ${existing.currentEpochRoot} vs ${header.currentEpochRoot}`,
        );
        return {
          status: 'EQUIVOCATION_DETECTED',
          tenantId: header.tenantId,
          violatingEpoch: header.epoch,
          details: `Conflicting root commitment for identical epoch. Registered: ${existing.currentEpochRoot}, New: ${header.currentEpochRoot}`,
        };
      }
    }

    if (header.epoch > 1) {
      const prevKey = `${header.tenantId}:epoch:${header.epoch - 1}`;
      const prevCommitment = this.knownEpochCommitments.get(prevKey);
      if (
        prevCommitment &&
        prevCommitment.currentEpochRoot !== header.previousEpochRoot
      ) {
        this.logger.error(
          `CHAIN FORK DETECTED on tenant ${header.tenantId}, epoch ${header.epoch}! Expected previous root ${prevCommitment.currentEpochRoot}, but got ${header.previousEpochRoot}`,
        );
        return {
          status: 'CHAIN_FORK',
          tenantId: header.tenantId,
          violatingEpoch: header.epoch,
          details: `Previous epoch root mismatch. Expected ${prevCommitment.currentEpochRoot}, received ${header.previousEpochRoot}`,
        };
      }
    }

    this.knownEpochCommitments.set(key, header);
    return {
      status: 'CONSISTENT',
      tenantId: header.tenantId,
    };
  }

  getCommitment(
    tenantId: string,
    epoch: number,
  ): ChainCheckpointHeader | undefined {
    return this.knownEpochCommitments.get(`${tenantId}:epoch:${epoch}`);
  }
}
