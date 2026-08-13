import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let prismaMock: any;
  let kafkaMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorPermission: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    kafkaMock = { publishEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  it('declares each required permission as ungranted until verified', async () => {
    await service.declareRequired('tenant-a', 'instance-1', 'microsoft-entra', [
      'User.Read.All',
      'AuditLog.Read.All',
    ]);

    expect(prismaMock.connectorPermission.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.connectorPermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          permission: 'User.Read.All',
          granted: false,
        }),
      }),
    );
  });

  it('flags previously-granted permissions absent from the fresh grant set as drift and publishes connector.permission.changed.v1', async () => {
    prismaMock.connectorPermission.findMany.mockResolvedValue([
      {
        id: 'p1',
        tenant_id: 'tenant-a',
        permission: 'User.Read.All',
        granted: true,
      },
      {
        id: 'p2',
        tenant_id: 'tenant-a',
        permission: 'AuditLog.Read.All',
        granted: true,
      },
    ]);

    const { newlyMissing } = await service.reconcileGranted('instance-1', [
      'User.Read.All',
    ]);

    expect(newlyMissing).toEqual(['AuditLog.Read.All']);
    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'connector.permission.changed.v1',
      'connector.permission.drift_detected',
      expect.objectContaining({
        tenantId: 'tenant-a',
        instanceId: 'instance-1',
        lostPermissions: ['AuditLog.Read.All'],
      }),
    );
  });

  it('does not publish drift when the granted set is unchanged', async () => {
    prismaMock.connectorPermission.findMany.mockResolvedValue([
      {
        id: 'p1',
        tenant_id: 'tenant-a',
        permission: 'User.Read.All',
        granted: true,
      },
    ]);

    const { newlyMissing } = await service.reconcileGranted('instance-1', [
      'User.Read.All',
    ]);

    expect(newlyMissing).toEqual([]);
    expect(kafkaMock.publishEvent).not.toHaveBeenCalled();
  });
});
