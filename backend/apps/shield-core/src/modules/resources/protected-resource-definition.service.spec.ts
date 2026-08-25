import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';

describe('ProtectedResourceDefinitionService (Category C taxonomy)', () => {
  let service: ProtectedResourceDefinitionService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      protectedResourceDefinition: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ProtectedResourceDefinitionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(ProtectedResourceDefinitionService);
  });

  it('persists the controlled endpoint definition and stable-identity safeguard', async () => {
    prismaMock.protectedResourceDefinition.findFirst.mockResolvedValue(null);
    prismaMock.protectedResourceDefinition.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'def-1', ...data }),
    );

    const definition = await service.createDefinition(
      {
        resourceType: 'WINDOWS_DEVICE',
        resourceFamily: 'ENDPOINT',
        metricFamily: 'MDR_ENDPOINT',
        identityKeys: ['deviceId', 'tenantDeviceId'],
        physicalIdentityKeys: ['deviceId'],
        countingPolicy: { stableIdentityKey: true },
      },
      'maker-1',
    );

    expect(definition.status).toBe('DRAFT');
    expect(definition.controlled_definition).toContain('Managed workstation');
    expect(definition.counting_safeguard).toContain('connector aliases');
    expect(definition.requested_by).toBe('maker-1');
  });

  it('requires explicit minimum duration/window/aggregation for server workloads', async () => {
    await expect(
      service.createDefinition(
        {
          resourceType: 'CONTAINER',
          resourceFamily: 'SERVER_WORKLOAD',
          metricFamily: 'MDR_WORKLOAD',
          identityKeys: ['workloadId'],
          countingPolicy: {},
          ephemeralPolicy: {},
        },
        'maker-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires privileged identities to be disclosed and operationally distinct', async () => {
    await expect(
      service.createDefinition(
        {
          resourceType: 'ADMIN_USER',
          resourceFamily: 'PRIVILEGED_IDENTITY',
          metricFamily: 'PRIVILEGED_IDENTITY',
          identityKeys: ['principalId'],
          countingPolicy: {
            distinctMetricDisclosed: true,
            operationallyDistinct: false,
          },
        },
        'maker-1',
      ),
    ).rejects.toThrow('countingPolicy.operationallyDistinct');
  });

  it('enforces maker-checker approval for controlled definitions', async () => {
    prismaMock.protectedResourceDefinition.findUnique.mockResolvedValue({
      id: 'def-1',
      status: 'DRAFT',
      requested_by: 'maker-1',
    });

    await expect(
      service.approveDefinition('def-1', 'maker-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fails closed for a legacy approved definition with no metric governance', async () => {
    prismaMock.protectedResourceDefinition.findFirst.mockResolvedValue({
      id: 'legacy-def',
      status: 'APPROVED',
      resource_family: 'ENDPOINT',
      metric_family: 'LEGACY',
      controlled_definition: '',
      counting_safeguard: '',
    });

    await expect(service.getActiveDefinition('ENDPOINT')).resolves.toBeNull();
  });
});
