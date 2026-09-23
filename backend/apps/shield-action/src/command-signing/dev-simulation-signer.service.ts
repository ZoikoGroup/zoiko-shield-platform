import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CommandSigner,
  SignableCommand,
  SignedCommand,
} from './command-signer.interface';

const DEV_SIGNING_KEY =
  process.env.DEV_SIMULATION_SIGNING_KEY ||
  'dev-simulation-signing-key-not-for-production';

/**
 * Explicitly named to signal it is never production signing authority.
 * HMAC over the command payload with a local dev key — good enough to
 * produce a verifiable SIMULATION receipt, nowhere near a live-execution
 * credential. Hard guards below are mandatory, not defensive: this
 * milestone must never be able to sign a live command.
 */
@Injectable()
export class DevSimulationSigner implements CommandSigner {
  /**
   * The exact bytes the HMAC covers. Kept in one place so verification can
   * never drift from signing — if these two disagreed, verification would
   * fail on untouched records and the failure would look like tampering.
   */
  private material(command: SignableCommand): string {
    return JSON.stringify({
      tenantId: command.tenantId,
      actionCommandId: command.actionCommandId,
      nonce: command.nonce,
      payload: command.payload,
    });
  }

  /**
   * Recomputes the HMAC and compares it in constant time.
   *
   * Nothing used to call anything like this. SimulationService wrote
   * `signature_verified: true` onto every receipt at the moment it created
   * it, and ReceiptVerificationService then read that column back and
   * reported the receipt verified. The signature this signer produced was
   * never checked by anything, so "verified" meant a boolean somebody had
   * written as true.
   */
  verify(command: SignableCommand, signature: string): boolean {
    if (!signature?.startsWith('dev-sim:')) return false;
    const expected = createHmac('sha256', DEV_SIGNING_KEY)
      .update(this.material(command))
      .digest('hex');
    const provided = signature.slice('dev-sim:'.length);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  sign(
    command: SignableCommand,
    executionMode: 'SIMULATION' | 'LIVE',
  ): SignedCommand {
    if (executionMode !== 'SIMULATION') {
      throw new Error('DevSimulationSigner cannot sign live commands');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DevSimulationSigner is prohibited in production');
    }

    const signature = createHmac('sha256', DEV_SIGNING_KEY)
      .update(this.material(command))
      .digest('hex');

    return {
      signature: `dev-sim:${signature}`,
      signedBy: 'DevSimulationSigner',
      signedAt: new Date().toISOString(),
    };
  }
}
