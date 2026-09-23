import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevSimulationSigner } from '../command-signing/dev-simulation-signer.service';

/**
 * Verifies that a receipt's originating command still carries a signature
 * that checks out, before anything downstream (reconciliation, evidence,
 * audit package) may treat the receipt as trustworthy.
 *
 * This used to read a `signature_verified` boolean off the receipt row and
 * report the receipt verified when it was true. Nothing ever computed that
 * boolean: SimulationService wrote `signature_verified: true` onto every
 * receipt at the moment it created it. So the verification step checked that
 * someone had written "true", and the HMAC the signer produced was never
 * checked by anything, ever. A verification that cannot fail is not a
 * control, and everything downstream was relying on it as one.
 *
 * It now recomputes the HMAC over the stored ActionCommand and compares it.
 * A receipt whose command has been altered, or whose signature is missing,
 * fails.
 */
@Injectable()
export class ReceiptVerificationService {
  private readonly logger = new Logger(ReceiptVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: DevSimulationSigner,
  ) {}

  async verify(
    actionReceiptId: string,
  ): Promise<{ verified: boolean; reason?: string }> {
    const receipt = await this.prisma.actionReceipt.findUnique({
      where: { id: actionReceiptId },
    });
    if (!receipt) {
      return {
        verified: false,
        reason: `ActionReceipt '${actionReceiptId}' not found`,
      };
    }

    const command = await this.prisma.actionCommand.findUnique({
      where: { id: receipt.action_command_id },
    });
    if (!command) {
      return {
        verified: false,
        reason: `ActionCommand '${receipt.action_command_id}' not found — the receipt references a command that does not exist`,
      };
    }
    if (command.tenant_id !== receipt.tenant_id) {
      // A receipt pointing at another tenant's command is not a verification
      // failure to be logged and moved past; it is a boundary violation.
      return {
        verified: false,
        reason: 'Receipt and command belong to different tenants',
      };
    }
    if (!command.signature) {
      return {
        verified: false,
        reason: 'Originating command carries no signature',
      };
    }

    let target: unknown;
    try {
      target = JSON.parse(command.target || '{}');
    } catch {
      return {
        verified: false,
        reason: 'Command target is not valid JSON, so the signed bytes cannot be reconstructed',
      };
    }

    const signatureHolds = this.signer.verify(
      {
        tenantId: command.tenant_id,
        actionCommandId: command.id,
        nonce: command.nonce,
        payload: { actionType: command.action_type, target },
      },
      command.signature,
    );

    if (!signatureHolds) {
      this.logger.error(
        `Receipt ${actionReceiptId}: signature on command ${command.id} does not verify. The command was altered after signing, or was signed with a different key.`,
      );
      await this.prisma.actionReceipt.update({
        where: { id: actionReceiptId },
        data: { signature_verified: false },
      });
      return {
        verified: false,
        reason: 'Command signature does not verify',
      };
    }

    if (receipt.status !== 'SIMULATED' && receipt.status !== 'VERIFIED') {
      return {
        verified: false,
        reason: `Receipt status '${receipt.status}' is not a verifiable terminal state`,
      };
    }

    // Written now because it was established now, rather than asserted at
    // creation time by the code that created the thing being verified.
    await this.prisma.actionReceipt.update({
      where: { id: actionReceiptId },
      data: { signature_verified: true, verified_at: new Date() },
    });
    return { verified: true };
  }
}
