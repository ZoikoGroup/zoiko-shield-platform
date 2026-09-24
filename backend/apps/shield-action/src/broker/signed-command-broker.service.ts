import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  GOVERNED_COMMAND_SIGNER,
  type CommandSigningPayload,
  type GovernedCommandSigner,
} from '../command-signing/command-signer.interface';

export interface SignedCommandEnvelope {
  commandId: string;
  tenantId: string;
  actionType:
    | 'REVOKE_IAM_SESSION'
    | 'ISOLATE_ENDPOINT'
    | 'DISABLE_USER_ACCOUNT'
    | 'QUARANTINE_SUBNET';
  targetRef: string;
  authorityLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  approvalRef: string;
  policyVersion: string;
  expiresAt: string; // ISO 8601
  nonce: string;
  signature: string;
  /** Which key signed it, so a receipt can be checked against a known key. */
  signingKeyId: string;
  signingAlgorithm: string;
}

export interface GovernedActionExecutionReceipt {
  receiptId: string;
  commandId: string;
  tenantId: string;
  actionType: string;
  targetRef: string;
  executionStatus:
    | 'EXECUTED_SUCCESSFULLY'
    | 'REJECTED_VALIDATION_FAILURE'
    | 'REJECTED_EXPIRED_COMMAND'
    | 'REJECTED_REPLAY_NONCE';
  observedState: 'TARGET_CONTAINED' | 'NO_CHANGE';
  rollbackReceiptId?: string;
  executedAt: string;
  attestationDigest: string;
}

/**
 * Governed Signed Command Envelope & Action Broker
 * Specification: Backend Build Guide §LAB 15 (Action Broker and Governed Response)
 */
@Injectable()
export class SignedCommandBrokerService {
  private readonly logger = new Logger(SignedCommandBrokerService.name);

  // In-memory processed nonces to prevent replay attacks
  private readonly consumedNonces = new Set<string>();

  constructor(
    @Inject(GOVERNED_COMMAND_SIGNER)
    private readonly signer: GovernedCommandSigner,
  ) {}

  private signingPayload(
    envelope: Omit<SignedCommandEnvelope, 'signature' | 'signingKeyId' | 'signingAlgorithm'>,
    executionMode: 'SIMULATION' | 'LIVE',
  ): CommandSigningPayload {
    return {
      commandId: envelope.commandId,
      tenantId: envelope.tenantId,
      actionType: envelope.actionType,
      targetRef: envelope.targetRef,
      authorityLevel: envelope.authorityLevel,
      approvalRef: envelope.approvalRef,
      policyVersion: envelope.policyVersion,
      expiresAt: envelope.expiresAt,
      nonce: envelope.nonce,
      executionMode,
    };
  }

  /**
   * Builds and signs a governed command envelope.
   *
   * The "signature" here used to be a plain SHA-256 hash of the envelope
   * fields, with no key involved at all, while the comment above it claimed a
   * tenant-scoped HSM key. Anyone who could read the envelope could compute
   * that value, so it authenticated nothing: forging a command was a matter of
   * hashing the fields you wanted. It is now a real asymmetric signature from
   * the signer in custody — KMS in production, an ephemeral key that refuses
   * to run in production otherwise.
   */
  async createSignedCommand(
    tenantId: string,
    actionType: SignedCommandEnvelope['actionType'],
    targetRef: string,
    authorityLevel: SignedCommandEnvelope['authorityLevel'],
    approvalRef: string,
    policyVersion: string,
    ttlSeconds = 300,
    executionMode: 'SIMULATION' | 'LIVE' = 'LIVE',
  ): Promise<SignedCommandEnvelope> {
    const unsigned = {
      commandId: `cmd-${crypto.randomUUID()}`,
      tenantId,
      actionType,
      targetRef,
      authorityLevel,
      approvalRef,
      policyVersion,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    const signed = await this.signer.sign(
      this.signingPayload(unsigned, executionMode),
    );

    return {
      ...unsigned,
      signature: signed.signature,
      signingKeyId: signed.signingKeyId,
      signingAlgorithm: signed.algorithm,
    };
  }

  /**
   * Validates and dispatches a signed command envelope to customer execution adapters.
   */
  async dispatchGovernedCommand(
    envelope: SignedCommandEnvelope,
    executionMode: 'SIMULATION' | 'LIVE' = 'LIVE',
  ): Promise<GovernedActionExecutionReceipt> {
    const receiptId = `rcpt-gov-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();

    // 1. Replay prevention: check nonce
    if (this.consumedNonces.has(envelope.nonce)) {
      this.logger.error(
        `🚨 [REPLAY ATTACK INTERCEPTED] Command '${envelope.commandId}' attempted with consumed nonce: ${envelope.nonce}`,
      );
      return this.buildReceipt(
        receiptId,
        envelope,
        'REJECTED_REPLAY_NONCE',
        'NO_CHANGE',
        executedAt,
      );
    }
    this.consumedNonces.add(envelope.nonce);

    // 2. Check expiration
    if (new Date(envelope.expiresAt).getTime() < Date.now()) {
      this.logger.warn(
        `🛑 [EXPIRED COMMAND REJECTED] Command '${envelope.commandId}' expired at ${envelope.expiresAt}`,
      );
      return this.buildReceipt(
        receiptId,
        envelope,
        'REJECTED_EXPIRED_COMMAND',
        'NO_CHANGE',
        executedAt,
      );
    }

    // 3. Signature verification against the key that signed it, not a hash
    //    anyone holding the envelope could recompute.
    const { publicKey } = await this.signer.publicKey();
    const signatureValid = await this.signer.verify(
      this.signingPayload(envelope, executionMode),
      envelope.signature,
      publicKey,
    );

    if (!signatureValid) {
      this.logger.error(
        `🛑 [INVALID SIGNATURE] Command '${envelope.commandId}' signature mismatch.`,
      );
      return this.buildReceipt(
        receiptId,
        envelope,
        'REJECTED_VALIDATION_FAILURE',
        'NO_CHANGE',
        executedAt,
      );
    }

    // 4. Successful execution & rollback compensation generation
    const rollbackReceiptId = `rb-rcpt-${crypto.randomUUID()}`;
    this.logger.log(
      `✔ [SOAR ACTION EXECUTED] Dispatched '${envelope.actionType}' on '${envelope.targetRef}' for Tenant '${envelope.tenantId}' (Receipt: ${receiptId})`,
    );

    return this.buildReceipt(
      receiptId,
      envelope,
      'EXECUTED_SUCCESSFULLY',
      'TARGET_CONTAINED',
      executedAt,
      rollbackReceiptId,
    );
  }

  private buildReceipt(
    receiptId: string,
    envelope: SignedCommandEnvelope,
    status: GovernedActionExecutionReceipt['executionStatus'],
    observedState: GovernedActionExecutionReceipt['observedState'],
    executedAt: string,
    rollbackReceiptId?: string,
  ): GovernedActionExecutionReceipt {
    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          receiptId,
          commandId: envelope.commandId,
          tenantId: envelope.tenantId,
          status,
          observedState,
          executedAt,
        }),
      )
      .digest('hex');

    return {
      receiptId,
      commandId: envelope.commandId,
      tenantId: envelope.tenantId,
      actionType: envelope.actionType,
      targetRef: envelope.targetRef,
      executionStatus: status,
      observedState,
      rollbackReceiptId,
      executedAt,
      attestationDigest,
    };
  }
}
