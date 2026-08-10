import { createHash } from 'crypto';

const MOCK_WITNESS_SALT = 'zoiko-mock-witness-v1';

export interface WitnessReceipt {
  witnessId: string;
  witnessType: string;
  receiptHash: string;
  status: string;
}

/**
 * Only MOCK witnesses are verifiable offline this pass — a real witness
 * type (blockchain timestamp, RFC 3161 TSA, etc.) would plug in its own
 * verification here later. A MOCK-only receipt set never counts as
 * external witnessing (spec correction #3).
 */
export function verifyWitnessReceipt(merkleRoot: string, receipt: WitnessReceipt): boolean {
  if (receipt.witnessType === 'MOCK') {
    const expected = createHash('sha256').update(`${merkleRoot}${receipt.witnessId}${MOCK_WITNESS_SALT}`).digest('hex');
    return expected === receipt.receiptHash;
  }
  // Unknown/real witness types cannot be verified offline by this build of the verifier.
  return false;
}

export function computeWitnessAssuranceState(receipts: WitnessReceipt[]): 'TEST_ONLY' | 'WITNESS_PARTIAL' | 'WITNESS_FULL' {
  const realWitnesses = receipts.filter((r) => r.witnessType !== 'MOCK');
  if (realWitnesses.length >= 2) return 'WITNESS_FULL';
  if (realWitnesses.length === 1) return 'WITNESS_PARTIAL';
  return 'TEST_ONLY';
}
