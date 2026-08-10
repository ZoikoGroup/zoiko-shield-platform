import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { WitnessProvider, WitnessReceiptResult } from './witness-provider.interface';

const MOCK_WITNESS_SALT = 'zoiko-mock-witness-v1';

/**
 * TEST_ONLY (spec correction #3) — never let a package present as fully
 * externally witnessed on the strength of this provider alone.
 * Deterministic so the independent verifier can recompute and compare
 * without needing to call any external service.
 */
@Injectable()
export class MockWitnessProvider implements WitnessProvider {
  readonly witnessType = 'MOCK';

  async attest(merkleRoot: string): Promise<WitnessReceiptResult> {
    const witnessId = 'mock-witness-1';
    const receiptHash = createHash('sha256').update(`${merkleRoot}${witnessId}${MOCK_WITNESS_SALT}`).digest('hex');
    return { witnessId, witnessType: this.witnessType, receiptHash };
  }
}
