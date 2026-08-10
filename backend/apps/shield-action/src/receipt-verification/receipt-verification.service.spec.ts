import { ReceiptVerificationService } from './receipt-verification.service';

function makePrisma(receipt: any) {
  return {
    actionReceipt: {
      findUnique: jest.fn().mockResolvedValue(receipt),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('ReceiptVerificationService', () => {
  it('verifies a SIMULATED receipt with a verified signature', async () => {
    const prisma = makePrisma({ status: 'SIMULATED', signature_verified: true });
    const service = new ReceiptVerificationService(prisma);
    const result = await service.verify('rcpt1');
    expect(result.verified).toBe(true);
  });

  it('does not verify when signature_verified is not true — HTTP-success-alone never becomes VERIFIED', async () => {
    const prisma = makePrisma({ status: 'SIMULATED', signature_verified: false });
    const service = new ReceiptVerificationService(prisma);
    const result = await service.verify('rcpt1');
    expect(result.verified).toBe(false);
  });

  it('does not verify a missing receipt', async () => {
    const prisma = makePrisma(undefined);
    const service = new ReceiptVerificationService(prisma);
    const result = await service.verify('rcpt1');
    expect(result.verified).toBe(false);
  });
});
