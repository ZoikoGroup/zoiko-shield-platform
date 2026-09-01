import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface DeduplicationCheckResult {
  isDuplicate: boolean;
  eventDigest: string;
  tenantId: string;
  fingerprint: string;
  timestamp: string;
}

export interface DeduplicationMetrics {
  totalEvaluated: number;
  uniqueIngested: number;
  duplicatesDiscarded: number;
  deduplicationRatio: number;
}

/**
 * Real-Time Stream Deduplication Bloom Filter Service
 * High-performance bit-array Bloom filter and sliding-window cache to eliminate
 * redundant syslog/EDR bursts before database persistence.
 */
@Injectable()
export class StreamDeduplicationService {
  private readonly logger = new Logger(StreamDeduplicationService.name);

  // 64KB bit array (524,288 bits)
  private readonly bitArraySize = 524288;
  private readonly bitArray = new Uint8Array(Math.ceil(this.bitArraySize / 8));
  private readonly recentFingerprints = new Map<string, number>();
  private readonly windowTtlMs = 60000; // 1-minute deduplication window

  private totalEvaluated = 0;
  private duplicatesDiscarded = 0;
  private uniqueIngested = 0;

  /**
   * Generates a deterministic normalized event fingerprint from tenant, event type, and payload.
   */
  computeFingerprint(
    tenantId: string,
    eventType: string,
    rawPayload: Record<string, any>,
  ): string {
    const canonicalPayload = JSON.stringify(
      rawPayload,
      Object.keys(rawPayload).sort(),
    );
    return crypto
      .createHash('sha256')
      .update(`${tenantId}:${eventType}:${canonicalPayload}`)
      .digest('hex');
  }

  private getBitIndices(fingerprint: string): number[] {
    const hash1 = crypto.createHash('sha256').update(fingerprint).digest();
    const hash2 = crypto.createHash('md5').update(fingerprint).digest();

    const idx1 = hash1.readUInt32BE(0) % this.bitArraySize;
    const idx2 = hash1.readUInt32BE(4) % this.bitArraySize;
    const idx3 = hash2.readUInt32BE(0) % this.bitArraySize;

    return [idx1, idx2, idx3];
  }

  private setBits(indices: number[]): void {
    for (const idx of indices) {
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      this.bitArray[byteIdx] |= 1 << bitIdx;
    }
  }

  private checkBits(indices: number[]): boolean {
    for (const idx of indices) {
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      if ((this.bitArray[byteIdx] & (1 << bitIdx)) === 0) {
        return false; // Definitely not present
      }
    }
    return true; // Likely present
  }

  /**
   * Checks if an incoming event is a duplicate within the sliding window.
   * If unique, registers the fingerprint and accepts. If duplicate, discards.
   */
  checkAndRegister(
    tenantId: string,
    eventType: string,
    rawPayload: Record<string, any>,
  ): DeduplicationCheckResult {
    this.totalEvaluated++;
    this.cleanExpiredFingerprints();

    const fingerprint = this.computeFingerprint(
      tenantId,
      eventType,
      rawPayload,
    );
    const indices = this.getBitIndices(fingerprint);
    const now = Date.now();

    // 1. Check Bloom Filter
    const bloomMightContain = this.checkBits(indices);

    // 2. Exact match check in active sliding window
    if (bloomMightContain && this.recentFingerprints.has(fingerprint)) {
      this.duplicatesDiscarded++;
      this.logger.warn(
        `⚡ [STREAM DUPLICATE DISCARDED] Tenant '${tenantId}', Event '${eventType}', Fingerprint '${fingerprint.substring(0, 12)}...'`,
      );
      return {
        isDuplicate: true,
        eventDigest: fingerprint,
        tenantId,
        fingerprint,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Unique event -> register in Bloom filter & active window map
    this.setBits(indices);
    this.recentFingerprints.set(fingerprint, now);
    this.uniqueIngested++;

    return {
      isDuplicate: false,
      eventDigest: fingerprint,
      tenantId,
      fingerprint,
      timestamp: new Date().toISOString(),
    };
  }

  private cleanExpiredFingerprints(): void {
    const now = Date.now();
    for (const [fp, timestamp] of this.recentFingerprints.entries()) {
      if (now - timestamp > this.windowTtlMs) {
        this.recentFingerprints.delete(fp);
      }
    }
  }

  getMetrics(): DeduplicationMetrics {
    const deduplicationRatio =
      this.totalEvaluated > 0
        ? this.duplicatesDiscarded / this.totalEvaluated
        : 0;
    return {
      totalEvaluated: this.totalEvaluated,
      uniqueIngested: this.uniqueIngested,
      duplicatesDiscarded: this.duplicatesDiscarded,
      deduplicationRatio,
    };
  }
}
