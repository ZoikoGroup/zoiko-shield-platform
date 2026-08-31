import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LegalHoldService } from './legal-hold.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';

describe('LegalHoldService', () => {
  let prisma: any;
  let authorization: any;
  let service: LegalHoldService;

  beforeEach(() => {
    prisma = {
      legalHold: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          ...data,
          id: 'hold-1',
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      deletionRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    authorization = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'PERMIT',
        authorizationDecisionId: 'authorization-1',
      }),
    };
    service = new LegalHoldService(
      prisma as PrismaService,
      authorization as AuthorizationDecisionService,
    );
  });

  it('treats a whole-tenant deletion as intersecting a narrow hold', () => {
    expect(
      service.scopeIntersects({ caseIds: ['case-1'] }, { all: true }),
    ).toBe(true);
  });

  it('does not intersect unrelated narrow scopes', () => {
    expect(
      service.scopeIntersects({ caseIds: ['case-1'] }, { caseIds: ['case-2'] }),
    ).toBe(false);
  });

  it('requires a non-empty scope and a future review date', async () => {
    await expect(
      service.create({
        tenantId: 'tenant-1',
        scope: {},
        authority: 'Court order',
        reason: 'Litigation preservation requirement',
        reviewAt: new Date(Date.now() + 60_000),
        createdBy: 'lawyer-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
  });

  it('fails closed when legal_hold:create is denied', async () => {
    authorization.evaluate.mockResolvedValue({
      decision: 'DENY',
      authorizationDecisionId: 'authorization-denied',
    });

    await expect(
      service.create({
        tenantId: 'tenant-1',
        scope: { caseIds: ['case-1'] },
        authority: 'Court order',
        reason: 'Litigation preservation requirement',
        reviewAt: new Date(Date.now() + 60_000),
        createdBy: 'lawyer-1',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.legalHold.create).not.toHaveBeenCalled();
  });

  it('blocks every matching in-flight deletion request when a hold is created', async () => {
    prisma.deletionRequest.findMany.mockResolvedValue([
      {
        id: 'request-matching',
        scope: '{"all":true}',
        conflicting_legal_hold_ids: '[]',
      },
      {
        id: 'request-unrelated',
        scope: '{"caseIds":["case-2"]}',
        conflicting_legal_hold_ids: '[]',
      },
    ]);

    await service.create({
      tenantId: 'tenant-1',
      scope: { caseIds: ['case-1'] },
      authority: 'Court order 123',
      reason: 'Litigation preservation requirement',
      reviewAt: new Date(Date.now() + 60_000),
      createdBy: 'lawyer-1',
    });

    expect(prisma.deletionRequest.update).toHaveBeenCalledTimes(1);
    expect(prisma.deletionRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-matching' },
      data: expect.objectContaining({
        status: 'BLOCKED_BY_HOLD',
        conflicting_legal_hold_ids: '["hold-1"]',
      }),
    });
  });
});
