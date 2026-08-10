import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PartnerDelegationService } from './partner-delegation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PartnerDelegationService (ZS-COM-BILL-001 Part 21: operational access != commercial authority)', () => {
  let service: PartnerDelegationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      partnerDelegation: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PartnerDelegationService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<PartnerDelegationService>(PartnerDelegationService);
  });

  it('refuses to grant a scope that is not on the delegable allowlist (e.g. pricing authority)', async () => {
    await expect(
      service.grantDelegation({
        partnerId: 'p-1',
        commercialAccountId: 'acct-1',
        scope: ['VIEW_USAGE', 'MODIFY_PRICING'],
        grantedBy: 'admin',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.partnerDelegation.create).not.toHaveBeenCalled();
  });

  it('grants a delegation when every requested scope is on the allowlist', async () => {
    prismaMock.partnerDelegation.create.mockResolvedValue({ id: 'del-1', status: 'ACTIVE' });

    const delegation = await service.grantDelegation({
      partnerId: 'p-1',
      commercialAccountId: 'acct-1',
      scope: ['VIEW_USAGE', 'VIEW_INVOICES'],
      grantedBy: 'admin',
    });

    expect(delegation.status).toBe('ACTIVE');
  });

  it('checkDelegation is fail-closed with no delegation on record', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValue(null);

    const allowed = await service.checkDelegation('p-1', 'acct-1', 'VIEW_USAGE');

    expect(allowed).toBe(false);
  });

  it('checkDelegation is fail-closed (non-transitive): a delegation for a different commercial account never matches', async () => {
    // The query itself is scoped by commercial_account_id, so a mismatched account simply finds nothing.
    prismaMock.partnerDelegation.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.commercial_account_id === 'acct-1' ? { id: 'del-1', scope: '["VIEW_USAGE"]', status: 'ACTIVE', expires_at: null } : null),
    );

    const allowedForCorrectAccount = await service.checkDelegation('p-1', 'acct-1', 'VIEW_USAGE');
    const allowedForOtherAccount = await service.checkDelegation('p-1', 'acct-2', 'VIEW_USAGE');

    expect(allowedForCorrectAccount).toBe(true);
    expect(allowedForOtherAccount).toBe(false);
  });

  it('dynamically expires a delegation past its expires_at, before a sweeper runs, and denies the check', async () => {
    const past = new Date(Date.now() - 1000);
    prismaMock.partnerDelegation.findFirst.mockResolvedValue({
      id: 'del-1', scope: '["VIEW_USAGE"]', status: 'ACTIVE', expires_at: past,
    });
    prismaMock.partnerDelegation.update.mockResolvedValue({ id: 'del-1', status: 'EXPIRED' });

    const allowed = await service.checkDelegation('p-1', 'acct-1', 'VIEW_USAGE');

    expect(allowed).toBe(false);
    expect(prismaMock.partnerDelegation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('denies a check for a scope the delegation does not include, even though the delegation itself is active', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValue({
      id: 'del-1', scope: '["VIEW_USAGE"]', status: 'ACTIVE', expires_at: null,
    });

    const allowed = await service.checkDelegation('p-1', 'acct-1', 'VIEW_INVOICES');

    expect(allowed).toBe(false);
  });

  it('rejects revoking a delegation that is not ACTIVE', async () => {
    prismaMock.partnerDelegation.findUnique.mockResolvedValue({ id: 'del-1', status: 'REVOKED' });

    await expect(service.revoke('del-1')).rejects.toThrow(ConflictException);
  });
});
