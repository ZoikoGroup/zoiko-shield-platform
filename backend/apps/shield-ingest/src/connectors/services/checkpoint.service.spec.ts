import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorCheckpointService } from './checkpoint.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ConnectorCheckpointService', () => {
  let service: ConnectorCheckpointService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorCheckpoint: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConnectorCheckpointService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ConnectorCheckpointService>(ConnectorCheckpointService);
  });

  it('returns null when no checkpoint has been persisted yet', async () => {
    prismaMock.connectorCheckpoint.findUnique.mockResolvedValue(null);

    const value = await service.get('instance-1', 'users');

    expect(value).toBeNull();
  });

  it('returns the persisted checkpointValue, treating it as an opaque string', async () => {
    prismaMock.connectorCheckpoint.findUnique.mockResolvedValue({
      checkpointValue: 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=abc123',
    });

    const value = await service.get('instance-1', 'users');

    expect(value).toBe('https://graph.microsoft.com/v1.0/users/delta?$deltatoken=abc123');
  });

  it('persists a new checkpoint scoped to instanceId + resourceType via upsert', async () => {
    await service.set('tenant-a', 'instance-1', 'signIns', '2026-08-08T00:00:00.000Z');

    expect(prismaMock.connectorCheckpoint.upsert).toHaveBeenCalledWith({
      where: { instanceId_resourceType: { instanceId: 'instance-1', resourceType: 'signIns' } },
      update: { checkpointValue: '2026-08-08T00:00:00.000Z' },
      create: {
        tenant_id: 'tenant-a',
        instanceId: 'instance-1',
        resourceType: 'signIns',
        checkpointValue: '2026-08-08T00:00:00.000Z',
      },
    });
  });
});
