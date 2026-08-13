export interface CheckpointSignResult {
  signature: string;
  signingKeyId: string;
  publicKey: string;
  algorithm: string;
}

/**
 * Small seam shared by the development signer and the production KMS
 * signer. The async contract prevents callers from assuming keys are local.
 */
export interface CheckpointSigner {
  sign(merkleRoot: string): Promise<CheckpointSignResult> | CheckpointSignResult;
}
