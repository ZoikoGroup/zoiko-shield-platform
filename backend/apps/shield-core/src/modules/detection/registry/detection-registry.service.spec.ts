import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { DetectionRegistryService } from './detection-registry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SuspiciousLoginRule } from '../rules/suspicious-login/suspicious-login.rule';
import { SUSPICIOUS_LOGIN_KEY } from '../rules/suspicious-login/suspicious-login.schema';
import { SuspiciousProcessRule } from '../rules/suspicious-process/suspicious-process.rule';
import { CloudPrivilegeEscalationRule } from '../rules/cloud-privilege-escalation/cloud-privilege-escalation.rule';

describe('DetectionRegistryService', () => {
  let service: DetectionRegistryService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      detectionVersion: {
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionRegistryService,
        { provide: PrismaService, useValue: prismaMock },
        SuspiciousLoginRule,
        SuspiciousProcessRule,
        CloudPrivilegeEscalationRule,
      ],
    }).compile();

    service = module.get<DetectionRegistryService>(DetectionRegistryService);
  });

  it('resolves a registered rule implementation by key', () => {
    expect(service.getRuleImplementation(SUSPICIOUS_LOGIN_KEY)).toBeInstanceOf(
      SuspiciousLoginRule,
    );
  });

  it('throws for an unregistered detection key rather than returning undefined', () => {
    expect(() => service.getRuleImplementation('NOT_A_REAL_KEY')).toThrow();
  });

  it('findApplicable only returns PUBLISHED versions whose event type matches and whose key has an implementation', async () => {
    prismaMock.detectionVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        required_event_types: JSON.stringify(['AUTHENTICATION']),
        detectionDefinition: { key: SUSPICIOUS_LOGIN_KEY },
      },
      {
        id: 'v2',
        required_event_types: JSON.stringify(['AUTHENTICATION']),
        detectionDefinition: { key: 'NO_IMPLEMENTATION_YET' },
      },
      {
        id: 'v3',
        required_event_types: JSON.stringify(['NETWORK']),
        detectionDefinition: { key: SUSPICIOUS_LOGIN_KEY },
      },
    ]);

    const applicable = await service.findApplicable(
      'tenant-a',
      'AUTHENTICATION',
    );

    expect(applicable.map((v) => v.id)).toEqual(['v1']);
  });

  it('rejects publishing a version whose definition already has an active PUBLISHED version', async () => {
    prismaMock.detectionVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v2',
      detection_definition_id: 'def-1',
      status: 'DRAFT',
    });
    prismaMock.detectionVersion.findFirst.mockResolvedValue({
      id: 'v1',
      status: 'PUBLISHED',
    });

    await expect(service.publish('v2')).rejects.toThrow(ConflictException);
  });

  it('rejects re-publishing a version that is already PUBLISHED (immutability)', async () => {
    prismaMock.detectionVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v1',
      status: 'PUBLISHED',
    });

    await expect(service.publish('v1')).rejects.toThrow(ConflictException);
  });
});
