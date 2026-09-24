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

/** Everything a governed command signature binds together. */
export interface CommandSigningPayload {
  commandId: string;
  tenantId: string;
  actionType: string;
  targetRef: string;
  authorityLevel: string;
  approvalRef: string;
  policyVersion: string;
  expiresAt: string;
  nonce: string;
  executionMode: 'SIMULATION' | 'LIVE';
}

export interface CommandSignResult {
  signature: string;
  signingKeyId: string;
  publicKey: string;
  algorithm: string;
}

/**
 * Seam shared by the development signer and the production KMS signer, so a
 * caller can never assume the private key is reachable in-process. Signing is
 * asynchronous because a key in a hardware module is not a local function
 * call, and an interface that pretends otherwise cannot be implemented by one.
 */
export interface GovernedCommandSigner {
  sign(payload: CommandSigningPayload): Promise<CommandSignResult>;
  verify(
    payload: CommandSigningPayload,
    signature: string,
    publicKey: string,
  ): Promise<boolean>;
  /** The public key commands are verified against, for receipts and audit. */
  publicKey(): Promise<{ signingKeyId: string; publicKey: string; algorithm: string }>;
}

export const GOVERNED_COMMAND_SIGNER = Symbol('GOVERNED_COMMAND_SIGNER');

/**
 * Signatures are taken over a stable, field-ordered serialization rather than
 * JSON.stringify of a free-form object, whose key order would silently change
 * the bytes being signed and break verification of untouched commands.
 */
export function canonicalCommandPayload(
  payload: CommandSigningPayload,
): string {
  return [
    payload.commandId,
    payload.tenantId,
    payload.actionType,
    payload.targetRef,
    payload.authorityLevel,
    payload.approvalRef,
    payload.policyVersion,
    payload.expiresAt,
    payload.nonce,
    payload.executionMode,
  ].join('|');
}

/**
 * Legacy seam kept for the simulation path, which signs a different shape.
 */
export interface CommandSigner {
  sign(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE',
  ): SignedCommand;
}
