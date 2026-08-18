import { Test, TestingModule } from '@nestjs/testing';
import { AlertGeneratorService } from './alert-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service';

describe('AlertGeneratorService', () => {
  let service: AlertGeneratorService;
  let prismaMock: any;

  const mockDetectionRun = {
    id: 'run-100',
    tenant_id: 'tenant-1',
    rule_id: 'rule-1',
    rule_version: 1,
    event_id: 'norm-1',
    result: 'MATCHED',
    rule: { name: 'Failed Login Rule', severity: 'HIGH' },
    event: {
      environment_id: 'prod',
      resource_id: '192.168.1.1',
      actor_email: 'user@example.com',
    },
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation((ops: any[]) => Promise.all(ops)),
      detectionRun: {
        findUnique: jest.fn(),
      },
      normalizedEvent: {
        findFirst: jest.fn(),
      },
      alert: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertGeneratorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
      ],
    }).compile();

    service = module.get<AlertGeneratorService>(AlertGeneratorService);
  });

  it('should create an Alert from a MATCHED detection run', async () => {
    prismaMock.detectionRun.findUnique.mockResolvedValue(mockDetectionRun);
    prismaMock.alert.findFirst.mockResolvedValue(null);
    prismaMock.normalizedEvent.findFirst.mockResolvedValue({
      ...mockDetectionRun.event,
      id: 'norm-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      rawEvent: { source_region: 'eu-west-1' },
    });
    prismaMock.alert.create.mockResolvedValue({
      id: 'alert-1',
      tenant_id: 'tenant-1',
      title: 'Alert: Failed Login Rule',
      status: 'NEW',
      severity: 'HIGH',
    });

    const alert = await service.createAlertFromDetectionRun('run-100');

    expect(alert).not.toBeNull();
    expect(alert?.id).toBe('alert-1');
    expect(prismaMock.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        title: 'Alert: Failed Login Rule',
        severity: 'HIGH',
      }),
    });
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        topic: 'alert.created.v1',
        tenant_id: 'tenant-1',
      }),
    });
  });

  it('should return null if detection run result is NO_MATCH', async () => {
    prismaMock.detectionRun.findUnique.mockResolvedValue({
      ...mockDetectionRun,
      result: 'NO_MATCH',
    });

    const alert = await service.createAlertFromDetectionRun('run-100');
    expect(alert).toBeNull();
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it('does not return an alert outside the authenticated tenant', async () => {
    prismaMock.alert.findFirst.mockResolvedValue(null);

    await expect(
      service.getAlertById('tenant-a', 'alert-from-tenant-b'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.alert.findFirst).toHaveBeenCalledWith({
      where: { id: 'alert-from-tenant-b', tenant_id: 'tenant-a' },
    });
  });
});
