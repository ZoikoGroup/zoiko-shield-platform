import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Meaningful depth arrives once real execution exists later; for this pass
 * the mandatory invariant is enforced: an UNKNOWN outcome can never become
 * SUCCESS/VERIFIED by omission. A SIMULATED receipt's expected/observed
 * state always compares equal by construction (no live provider was
 * called), so this records VERIFIED for SIMULATED receipts and UNKNOWN for
 * anything else rather than assuming success.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile(actionCommandId: string, actionReceiptId: string): Promise<{ result: 'VERIFIED' | 'UNKNOWN' }> {
    const receipt = await this.prisma.actionReceipt.findUnique({ where: { id: actionReceiptId } });
    const result = receipt?.status === 'SIMULATED' ? 'VERIFIED' : 'UNKNOWN';

    await this.prisma.actionReconciliation.create({
      data: {
        tenant_id: receipt?.tenant_id ?? '',
        action_command_id: actionCommandId,
        action_receipt_id: actionReceiptId,
        expected_state: receipt?.observed_state ?? '{}',
        observed_state: receipt?.observed_state ?? '{}',
        result,
      },
    });

    return { result };
  }
}
