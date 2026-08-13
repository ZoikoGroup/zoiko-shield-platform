import { Test, TestingModule } from '@nestjs/testing';
import { DeduplicationService } from './deduplication.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = { rawEvent: { findFirst: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeduplicationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<DeduplicationService>(DeduplicationService);
  });

  it('scopes the lookup by tenant_id, connector_id and source_event_id together', async () => {
    prismaMock.rawEvent.findFirst.mockResolvedValue(null);

    await service.findExisting('tenant-a', 'conn-1', 'evt-1');

    expect(prismaMock.rawEvent.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-a',
        connector_id: 'conn-1',
        source_event_id: 'evt-1',
      },
    });
  });

  it('does not treat the same sourceEventId as a duplicate across different tenants (cross-tenant isolation)', async () => {
    // Tenant B never matches Tenant A's row because tenant_id is part of the lookup key.
    prismaMock.rawEvent.findFirst.mockImplementation(({ where }: any) =>
      where.tenant_id === 'tenant-a' ? { id: 'raw-a' } : null,
    );

    const forTenantA = await service.findExisting(
      'tenant-a',
      'conn-1',
      'evt-shared',
    );
    const forTenantB = await service.findExisting(
      'tenant-b',
      'conn-1',
      'evt-shared',
    );

    expect(forTenantA).toEqual({ id: 'raw-a' });
    expect(forTenantB).toBeNull();
  });
});
