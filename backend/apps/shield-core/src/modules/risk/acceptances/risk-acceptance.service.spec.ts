import { RiskAcceptanceService } from './risk-acceptance.service';

function makePrisma() {
  const rows: any[] = [];
  return {
    rows,
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    riskAcceptance: {
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data };
        rows.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      ),
    },
    outboxEvent: { create: jest.fn(async ({ data }: any) => data) },
  } as any;
}

function makeOutbox() {
  return {
    build: jest.fn((params: any) => ({
      tenant_id: params.tenantId,
      topic: params.topic,
      event_type: params.eventType,
      payload: JSON.stringify(params.payload),
    })),
  } as any;
}

describe('RiskAcceptanceService', () => {
  it('rejects creation without a compensating control — no silent/permanent acceptance', async () => {
    const service = new RiskAcceptanceService(makePrisma(), makeOutbox());
    await expect(
      service.create({
        tenantId: 't1',
        riskId: 'r1',
        acceptedBy: 'u1',
        authority: 'CISO',
        rationale: 'accepted for now',
        compensatingControls: [],
        validFrom: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        reviewAt: new Date(Date.now() + 1000),
      }),
    ).rejects.toThrow();
  });

  it('rejects creation without an expiresAt', async () => {
    const service = new RiskAcceptanceService(makePrisma(), makeOutbox());
    await expect(
      service.create({
        tenantId: 't1',
        riskId: 'r1',
        acceptedBy: 'u1',
        authority: 'CISO',
        rationale: 'r',
        compensatingControls: ['c1'],
        validFrom: new Date(),
        expiresAt: undefined as any,
        reviewAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('renew() never mutates the previous row — creates a new one with supersedes_id set', async () => {
    const prisma = makePrisma();
    const service = new RiskAcceptanceService(prisma, makeOutbox());

    const original = await service.create({
      tenantId: 't1',
      riskId: 'r1',
      acceptedBy: 'u1',
      authority: 'CISO',
      rationale: 'first',
      compensatingControls: ['c1'],
      validFrom: new Date('2026-01-01'),
      expiresAt: new Date('2026-06-01'),
      reviewAt: new Date('2026-05-01'),
    });
    const snapshot = { ...original };

    const renewed = await service.renew(original.id, {
      acceptedBy: 'u2',
      authority: 'CISO',
      rationale: 'renewed',
      compensatingControls: ['c1', 'c2'],
      validFrom: new Date('2026-06-01'),
      expiresAt: new Date('2026-12-01'),
      reviewAt: new Date('2026-11-01'),
    });

    expect(renewed.supersedes_id).toBe(original.id);
    expect(prisma.rows.find((r: any) => r.id === original.id)).toEqual(
      snapshot,
    );
  });
});
