import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceObligationService } from './service-obligation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ManagedDefenseService } from '../managed-defense/managed-defense.service';

describe('ServiceObligationService (ZS-COM-BILL-001 Part 14 lifecycle)', () => {
  let service: ServiceObligationService;
  let prismaMock: any;
  let managedDefenseMock: any;

  beforeEach(async () => {
    prismaMock = {
      serviceObligation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    managedDefenseMock = {
      getProfile: jest.fn(),
      recordDelivery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceObligationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ManagedDefenseService, useValue: managedDefenseMock },
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
      obligationType: 'ASSURANCE_REVIEW',
    });

    expect(obligation.status).toBe('NOT_DUE');
  });

  it('rejects SOC coverage without a tenant-bound Managed Defense profile', async () => {
    await expect(
      service.createObligation(
        { contractId: 'c-1', obligationType: 'SOC_COVERAGE' },
        'tenant-1',
        'prod',
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.serviceObligation.create).not.toHaveBeenCalled();
  });

  it('copies the approved service boundary into a SOC obligation', async () => {
    managedDefenseMock.getProfile.mockResolvedValue({
      id: 'profile-1',
      contract_id: 'c-1',
      status: 'ACTIVE',
      coverage_window: '24X7',
      response_authority: 'R1',
      customer_dependencies: '["Maintain EDR access"]',
      exclusions: '["Unsupported connectors"]',
      readiness: { status: 'VERIFIED' },
    });
    prismaMock.serviceObligation.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'ob-1', ...data }),
    );

    const obligation = await service.createObligation(
      {
        contractId: 'c-1',
        obligationType: 'SOC_COVERAGE',
        managedDefenseProfileId: 'profile-1',
        coverageWindow: '24x7',
      },
      'tenant-1',
      'prod',
    );

    expect(obligation).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        managed_defense_profile_id: 'profile-1',
        coverage_window: '24X7',
        response_authority: 'R1',
      }),
    );
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
      const updated = await service.updateStatus(
        'ob-1',
        path[i + 1],
        path[i + 1] === 'DELIVERED' ? 'evidence-1' : undefined,
      );
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

  it('appends a delivery event for each managed obligation transition', async () => {
    prismaMock.serviceObligation.findUnique.mockResolvedValue({
      id: 'ob-1',
      status: 'ACTIVE',
      managed_defense_profile_id: 'profile-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
    });
    prismaMock.serviceObligation.update.mockResolvedValue({
      id: 'ob-1',
      status: 'DELIVERED',
    });

    await service.updateStatus(
      'ob-1',
      'DELIVERED',
      'evidence-1',
      'tenant-1',
      'prod',
      'analyst-1',
    );

    expect(managedDefenseMock.recordDelivery).toHaveBeenCalledWith(
      'tenant-1',
      'prod',
      expect.objectContaining({
        managedDefenseProfileId: 'profile-1',
        serviceObligationId: 'ob-1',
        eventType: 'OBLIGATION_STATUS',
        evidenceReference: 'evidence-1',
        actorId: 'analyst-1',
      }),
      prismaMock,
    );
  });

  it('404s when the obligation does not exist', async () => {
    prismaMock.serviceObligation.findUnique.mockResolvedValue(null);

    await expect(service.updateStatus('missing', 'PLANNED')).rejects.toThrow(
      NotFoundException,
    );
  });
});
