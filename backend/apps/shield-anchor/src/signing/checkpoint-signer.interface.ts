export interface CheckpointSignResult {
  signature: string;
  signingKeyId: string;
  publicKey: string;
  algorithm: string;
}

/**
 * Small seam so a real KmsCheckpointSigner/HsmCheckpointSigner can replace
 * DevCheckpointSigner later without touching the pipeline around it. Only
 * DevCheckpointSigner is implemented this pass, and it is explicitly
 * dev/test-only (spec correction #1).
 */
export interface CheckpointSigner {
  sign(merkleRoot: string): CheckpointSignResult;
}
