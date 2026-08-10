import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { CommandSigner, SignableCommand, SignedCommand } from './command-signer.interface';

const DEV_SIGNING_KEY = process.env.DEV_SIMULATION_SIGNING_KEY || 'dev-simulation-signing-key-not-for-production';

/**
 * Explicitly named to signal it is never production signing authority.
 * HMAC over the command payload with a local dev key — good enough to
 * produce a verifiable SIMULATION receipt, nowhere near a live-execution
 * credential. Hard guards below are mandatory, not defensive: this
 * milestone must never be able to sign a live command.
 */
@Injectable()
export class DevSimulationSigner implements CommandSigner {
  sign(command: SignableCommand, executionMode: 'SIMULATION' | 'LIVE'): SignedCommand {
    if (executionMode !== 'SIMULATION') {
      throw new Error('DevSimulationSigner cannot sign live commands');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DevSimulationSigner is prohibited in production');
    }

    const material = JSON.stringify({
      tenantId: command.tenantId,
      actionCommandId: command.actionCommandId,
      nonce: command.nonce,
      payload: command.payload,
    });

    const signature = createHmac('sha256', DEV_SIGNING_KEY).update(material).digest('hex');

    return {
      signature: `dev-sim:${signature}`,
      signedBy: 'DevSimulationSigner',
      signedAt: new Date().toISOString(),
    };
  }
}
