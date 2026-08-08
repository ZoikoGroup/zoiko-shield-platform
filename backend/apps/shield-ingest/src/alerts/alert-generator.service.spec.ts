import { Test, TestingModule } from '@nestjs/testing';
import { AlertGeneratorService } from './alert-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { NotFoundException } from '@nestjs/common';

describe('AlertGeneratorService', () => {
  let service: AlertGeneratorService;
  let prismaMock: any;
  let kafkaMock: any;

  const mockDetectionRun = {
    id: 'run-100',
    tenant_id: 'tenant-1',
    rule_id: 'rule-1',
    rule_version: 1,
    event_id: 'norm-1',
    result: 'MATCHED',
    rule: { name: 'Failed Login Rule', severity: 'HIGH' },
    event: { environment_id: 'prod', resource_id: '192.168.1.1', actor_email: 'user@example.com' },
  };

  beforeEach(async () => {
    prismaMock = {
      detectionRun: {
        findUnique: jest.fn(),
      },
      alert: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    kafkaMock = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertGeneratorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<AlertGeneratorService>(AlertGeneratorService);
  });

  it('should create an Alert from a MATCHED detection run', async () => {
    prismaMock.detectionRun.findUnique.mockResolvedValue(mockDetectionRun);
    prismaMock.alert.findFirst.mockResolvedValue(null);
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
    expect(kafkaMock.emit).toHaveBeenCalledWith('alert.published', expect.any(Object));
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
});
