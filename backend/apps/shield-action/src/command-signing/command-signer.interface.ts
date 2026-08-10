export interface SignableCommand {
  tenantId: string;
  actionCommandId: string;
  nonce: string;
  payload: unknown;
}

export interface SignedCommand {
  signature: string;
  signedBy: string;
  signedAt: string;
}

/**
 * Small seam so a real HSM/KMS/per-tenant signer can replace
 * DevSimulationSigner later without touching the pipeline around it.
 */
export interface CommandSigner {
  sign(command: SignableCommand, executionMode: 'SIMULATION' | 'LIVE'): SignedCommand;
}
