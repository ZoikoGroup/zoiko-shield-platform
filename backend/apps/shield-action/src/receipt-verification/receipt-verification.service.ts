import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Verifies a receipt's signature_verified flag before anything downstream
 * (e.g. reconciliation) may treat it as trustworthy. HTTP-success-alone
 * never becomes VERIFIED — this is a distinct explicit step.
 */
@Injectable()
export class ReceiptVerificationService {
  private readonly logger = new Logger(ReceiptVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    if (receipt.signature_verified !== true) {
      return { verified: false, reason: 'Receipt signature not verified' };
    }
    if (receipt.status !== 'SIMULATED' && receipt.status !== 'VERIFIED') {
      return {
        verified: false,
        reason: `Receipt status '${receipt.status}' is not a verifiable terminal state`,
      };
    }

    await this.prisma.actionReceipt.update({
      where: { id: actionReceiptId },
      data: { verified_at: new Date() },
    });
    return { verified: true };
  }
}
