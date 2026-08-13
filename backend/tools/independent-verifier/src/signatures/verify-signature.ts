import { createPublicKey, verify as cryptoVerify } from 'crypto';

/**
 * Verifies with ONLY the embedded public key — the verifier never needs
 * (and must never be given) a private signing key (spec §47).
 */
export function verifyCheckpointSignature(merkleRoot: string, signatureHex: string, publicKeyPem: string, algorithm: string): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const digestAlgorithm = algorithm === 'Ed25519' ? null :
      algorithm === 'ECDSA_SHA_256' ? 'sha256' : undefined;
    if (digestAlgorithm === undefined) return false;
    return cryptoVerify(digestAlgorithm, Buffer.from(merkleRoot, 'utf-8'), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
