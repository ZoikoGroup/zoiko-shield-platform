import { createHash, createPublicKey, verify as cryptoVerify } from 'crypto';

const MOCK_WITNESS_SALT = 'zoiko-mock-witness-v1';

export interface WitnessReceipt {
  witnessId: string;
  witnessType: string;
  receiptHash: string;
  signature?: string;
  publicKey?: string;
  algorithm?: string;
  status: string;
}

/**
 * Mock receipts remain explicit development artifacts. Signed HTTP witness
 * receipts are verified with the public key embedded in the proof envelope.
 */
export function verifyWitnessReceipt(merkleRoot: string, receipt: WitnessReceipt): boolean {
  if (receipt.witnessType === 'MOCK') {
    const expected = createHash('sha256').update(`${merkleRoot}${receipt.witnessId}${MOCK_WITNESS_SALT}`).digest('hex');
    return expected === receipt.receiptHash;
  }
  if (!receipt.signature || !receipt.publicKey || !receipt.algorithm) return false;
  try {
    const expected = createHash('sha256').update(`${receipt.witnessId}.${merkleRoot}`).digest('hex');
    if (receipt.receiptHash !== expected) return false;
    if (!['Ed25519', 'ECDSA_SHA_256'].includes(receipt.algorithm)) return false;
    const digestAlgorithm = receipt.algorithm === 'Ed25519' ? null : 'sha256';
    return cryptoVerify(
      digestAlgorithm,
      Buffer.from(receipt.receiptHash, 'utf8'),
      createPublicKey(receipt.publicKey),
      Buffer.from(receipt.signature, 'hex'),
    );
  } catch {
    return false;
  }
}

export function computeWitnessAssuranceState(receipts: WitnessReceipt[]): 'TEST_ONLY' | 'WITNESS_PARTIAL' | 'WITNESS_FULL' {
  const realWitnesses = receipts.filter((r) => r.witnessType !== 'MOCK');
  if (realWitnesses.length >= 2) return 'WITNESS_FULL';
  if (realWitnesses.length === 1) return 'WITNESS_PARTIAL';
  return 'TEST_ONLY';
}
