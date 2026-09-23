import { ReceiptVerificationService } from './receipt-verification.service';
import { DevSimulationSigner } from '../command-signing/dev-simulation-signer.service';

const TENANT = 'tenant-a';
const COMMAND_ID = 'cmd-1';
const NONCE = 'nonce-1';
const TARGET = { targetType: 'HOST', targetId: 'host-1' };

function signedCommand(signer: DevSimulationSigner, overrides: any = {}) {
  const signature = signer.sign(
    {
      tenantId: TENANT,
      actionCommandId: COMMAND_ID,
      nonce: NONCE,
      payload: { actionType: 'ISOLATE_ENDPOINT', target: TARGET },
    },
    'SIMULATION',
  ).signature;

  return {
    id: COMMAND_ID,
    tenant_id: TENANT,
    nonce: NONCE,
    action_type: 'ISOLATE_ENDPOINT',
    target: JSON.stringify(TARGET),
    signature,
    ...overrides,
  };
}

function makePrisma(receipt: any, command: any) {
  return {
    actionReceipt: {
      findUnique: jest.fn().mockResolvedValue(receipt),
      update: jest.fn().mockResolvedValue({}),
    },
    actionCommand: {
      findUnique: jest.fn().mockResolvedValue(command),
    },
  } as any;
}

describe('ReceiptVerificationService', () => {
  let signer: DevSimulationSigner;

  beforeEach(() => {
    signer = new DevSimulationSigner();
  });

  const receipt = {
    id: 'rcpt1',
    tenant_id: TENANT,
    action_command_id: COMMAND_ID,
    status: 'SIMULATED',
    signature_verified: false,
  };

  it('verifies a receipt whose command signature checks out', async () => {
    const prisma = makePrisma(receipt, signedCommand(signer));
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(true);
    // Established here, not asserted by whatever created the receipt.
    expect(prisma.actionReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signature_verified: true }),
      }),
    );
  });

  it('refuses a command altered after it was signed', async () => {
    // The whole point. Previously `signature_verified: true` was written at
    // creation, so a command could be rewritten afterwards and its receipt
    // would still report VERIFIED.
    const tampered = signedCommand(signer, {
      target: JSON.stringify({ targetType: 'HOST', targetId: 'a-different-host' }),
    });
    const prisma = makePrisma(receipt, tampered);
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/signature does not verify/);
  });

  it('refuses a command whose action type was swapped', async () => {
    const tampered = signedCommand(signer, { action_type: 'DISABLE_USER_ACCOUNT' });
    const prisma = makePrisma(receipt, tampered);
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
  });

  it('refuses a command carrying no signature', async () => {
    const prisma = makePrisma(receipt, signedCommand(signer, { signature: null }));
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/no signature/);
  });

  it('refuses a receipt pointing at another tenant\'s command', async () => {
    const prisma = makePrisma(
      receipt,
      signedCommand(signer, { tenant_id: 'tenant-b' }),
    );
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/different tenants/);
  });

  it('refuses a receipt whose command no longer exists', async () => {
    const prisma = makePrisma(receipt, null);
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
  });

  it('refuses a receipt that is not in a verifiable terminal state', async () => {
    const prisma = makePrisma(
      { ...receipt, status: 'PENDING' },
      signedCommand(signer),
    );
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
  });

  it('does not verify a missing receipt', async () => {
    const prisma = makePrisma(undefined, null);
    const result = await new ReceiptVerificationService(prisma, signer).verify(
      'rcpt1',
    );
    expect(result.verified).toBe(false);
  });
});
