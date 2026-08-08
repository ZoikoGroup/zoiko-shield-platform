import { Test, TestingModule } from '@nestjs/testing';
import { ContractStateService } from './contract-state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('ContractStateService (Section 28 State Machine)', () => {
  let service: ContractStateService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      contract: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractStateService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ContractStateService>(ContractStateService);
  });

  it('should transition DRAFT -> QUOTED and record CommercialEvent outbox row', async () => {
    prismaMock.contract.findUnique.mockResolvedValue({
      id: 'cnt-1',
      status: 'DRAFT',
      commercial_account_id: 'comm-1',
    });
    prismaMock.contract.update.mockResolvedValue({
      id: 'cnt-1',
      status: 'QUOTED',
    });

    const updated = await service.transitionState('cnt-1', 'QUOTED');

    expect(updated.status).toBe('QUOTED');
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'contract.state_changed',
        tenant_id: 'comm-1',
      }),
    });
  });

  it('should reject illegal state transition DRAFT -> ACTIVE', async () => {
    prismaMock.contract.findUnique.mockResolvedValue({
      id: 'cnt-1',
      status: 'DRAFT',
    });

    await expect(service.transitionState('cnt-1', 'ACTIVE')).rejects.toThrow(
      ConflictException,
    );
  });
});
