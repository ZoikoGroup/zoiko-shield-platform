import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResponseProposalService } from './response-proposal.service';

describe('ResponseProposalService tenant PEP', () => {
  it('binds proposal lookup to both resource ID and authoritative tenant', async () => {
    const prisma = {
      actionProposal: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new ResponseProposalService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getById('tenant-a', 'proposal-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.actionProposal.findFirst).toHaveBeenCalledWith({
      where: { id: 'proposal-b', tenant_id: 'tenant-a' },
    });
  });

  it('partitions case proposal lists by tenant in the database query', async () => {
    const prisma = {
      actionProposal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ResponseProposalService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listForCase('tenant-a', 'case-1');

    expect(prisma.actionProposal.findMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', case_id: 'case-1' },
      orderBy: { created_at: 'desc' },
    });
  });

  it('refuses to let the proposer approve their own response action (four-eyes)', async () => {
    const evaluate = jest.fn();
    const prisma = {
      actionProposal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          tenant_id: 'tenant-a',
          status: 'PROPOSED',
          requested_by: 'analyst-1',
        }),
      },
    };
    const service = new ResponseProposalService(
      prisma as never,
      {} as never,
      {} as never,
      { evaluate } as never,
    );

    await expect(
      service.approve({ tenantId: 'tenant-a', proposalId: 'p1', approverId: 'analyst-1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
