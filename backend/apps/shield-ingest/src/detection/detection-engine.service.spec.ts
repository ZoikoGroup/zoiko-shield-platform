import { Test, TestingModule } from '@nestjs/testing';
import { DetectionEngineService } from './detection-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { AlertGeneratorService } from '../alerts/alert-generator.service';

describe('DetectionEngineService', () => {
  let service: DetectionEngineService;
  let prismaMock: any;
  let alertMock: any;

  const mockRule = {
    id: 'rule-001',
    tenant_id: 'tenant-1',
    name: 'Failed Login Threshold',
    description: 'Detects repeated failed logins',
    rule_type: 'THRESHOLD',
    severity: 'HIGH',
    condition_definition: JSON.stringify({
      ruleType: 'THRESHOLD',
      eventClass: 'AUTHENTICATION',
      conditions: [{ field: 'outcome', operator: 'EQUALS', value: 'FAILED' }],
      windowMinutes: 10,
      threshold: 3,
    }),
    required_fields: '["outcome"]',
    status: 'ACTIVE',
    current_version: 1,
  };

  const mockNormalizedEvent = {
    id: 'norm-100',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    event_class: 'AUTHENTICATION',
    outcome: 'FAILED',
    actor_email: 'user@example.com',
    occurred_at: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      detectionRule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      detectionRun: {
        create: jest.fn(),
      },
      normalizedEvent: {
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    alertMock = {
      createAlertFromDetectionRun: jest
        .fn()
        .mockResolvedValue({ id: 'alert-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionEngineService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AlertGeneratorService, useValue: alertMock },
      ],
    }).compile();

    service = module.get<DetectionEngineService>(DetectionEngineService);
  });

  it('should throw NotFoundException if event does not exist during evaluation', async () => {
    prismaMock.normalizedEvent.findUnique.mockResolvedValue(null);
    await expect(
      service.evaluateNormalizedEvent('invalid-evt'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return MATCHED when threshold condition is met', async () => {
    prismaMock.normalizedEvent.findUnique.mockResolvedValue(
      mockNormalizedEvent,
    );
    prismaMock.detectionRule.findMany.mockResolvedValue([mockRule]);
    prismaMock.normalizedEvent.count.mockResolvedValue(5); // 5 events > threshold 3
    prismaMock.detectionRun.create.mockResolvedValue({
      id: 'run-1',
      result: 'MATCHED',
    });

    const results = await service.evaluateNormalizedEvent('norm-100');

    expect(results).toHaveLength(1);
    expect(prismaMock.detectionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: 'MATCHED',
        rule_id: 'rule-001',
      }),
    });
    expect(alertMock.createAlertFromDetectionRun).toHaveBeenCalledWith('run-1');
  });

  it('should return NO_MATCH when threshold condition is not met', async () => {
    prismaMock.normalizedEvent.findUnique.mockResolvedValue(
      mockNormalizedEvent,
    );
    prismaMock.detectionRule.findMany.mockResolvedValue([mockRule]);
    prismaMock.normalizedEvent.count.mockResolvedValue(1); // 1 event < threshold 3
    prismaMock.detectionRun.create.mockResolvedValue({
      id: 'run-2',
      result: 'NO_MATCH',
    });

    const results = await service.evaluateNormalizedEvent('norm-100');

    expect(results).toHaveLength(1);
    expect(prismaMock.detectionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: 'NO_MATCH',
      }),
    });
    expect(alertMock.createAlertFromDetectionRun).not.toHaveBeenCalled();
  });

  it('should test sample event against condition rules correctly', async () => {
    prismaMock.detectionRule.findFirst.mockResolvedValue(mockRule);

    const testResult = await service.testRule('tenant-1', 'rule-001', {
      outcome: 'FAILED',
    });
    expect(testResult.match).toBe(true);

    const failResult = await service.testRule('tenant-1', 'rule-001', {
      outcome: 'SUCCESS',
    });
    expect(failResult.match).toBe(false);
  });
});
