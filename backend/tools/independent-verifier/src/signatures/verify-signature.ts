import { createPublicKey, verify as edVerify } from 'crypto';

/**
 * Verifies with ONLY the embedded public key — the verifier never needs
 * (and must never be given) a private signing key (spec §47).
 */
export function verifyCheckpointSignature(merkleRoot: string, signatureHex: string, publicKeyPem: string, algorithm: string): boolean {
  if (algorithm !== 'Ed25519') return false;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return edVerify(null, Buffer.from(merkleRoot, 'utf-8'), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
