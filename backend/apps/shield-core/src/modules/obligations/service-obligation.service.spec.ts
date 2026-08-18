import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceObligationService } from './service-obligation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ServiceObligationService (ZS-COM-BILL-001 Part 14 lifecycle)', () => {
  let service: ServiceObligationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      serviceObligation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceObligationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ServiceObligationService>(ServiceObligationService);
  });

  it('creates an obligation in NOT_DUE', async () => {
    prismaMock.serviceObligation.create.mockResolvedValue({
      id: 'ob-1',
      status: 'NOT_DUE',
    });

    const obligation = await service.createObligation({
      contractId: 'c-1',
      obligationType: 'SOC_COVERAGE',
    });

    expect(obligation.status).toBe('NOT_DUE');
  });

  it('allows the declared NOT_DUE -> PLANNED -> SCHEDULED -> ACTIVE -> DELIVERED path', async () => {
    const path = ['NOT_DUE', 'PLANNED', 'SCHEDULED', 'ACTIVE', 'DELIVERED'];
    for (let i = 0; i < path.length - 1; i++) {
      prismaMock.serviceObligation.findUnique.mockResolvedValue({
        id: 'ob-1',
        status: path[i],
      });
      prismaMock.serviceObligation.update.mockResolvedValue({
        id: 'ob-1',
        status: path[i + 1],
      });
      const updated = await service.updateStatus('ob-1', path[i + 1]);
      expect(updated.status).toBe(path[i + 1]);
    }
  });

  it('rejects an illegal jump from NOT_DUE straight to DELIVERED', async () => {
    prismaMock.serviceObligation.findUnique.mockResolvedValue({
      id: 'ob-1',
      status: 'NOT_DUE',
    });

    await expect(service.updateStatus('ob-1', 'DELIVERED')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects transitions out of the terminal DELIVERED state', async () => {
    prismaMock.serviceObligation.findUnique.mockResolvedValue({
      id: 'ob-1',
      status: 'DELIVERED',
    });

    await expect(service.updateStatus('ob-1', 'ACTIVE')).rejects.toThrow(
      ConflictException,
    );
  });

  it('404s when the obligation does not exist', async () => {
    prismaMock.serviceObligation.findUnique.mockResolvedValue(null);

    await expect(service.updateStatus('missing', 'PLANNED')).rejects.toThrow(
      NotFoundException,
    );
  });
});
