import { EntraUserSyncService } from './entra.user-sync';
import { OutboxService } from '../../../outbox/outbox.service';

describe('EntraUserSyncService', () => {
  it('raw-stores every user and writes one outbox insert per Graph page', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          value: [
            { id: 'u1', mail: 'a@x.com', displayName: 'A' },
            { id: 'u2', userPrincipalName: 'b@x.com', displayName: 'B' },
          ],
          '@odata.nextLink': '/users/delta?page=2',
        })
        .mockResolvedValueOnce({
          value: [{ id: 'u3', mail: 'c@x.com', '@removed': {} }],
          '@odata.deltaLink': '/users/delta?token=next',
        }),
    };
    const checkpointService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const rawIngestService = {
      ingestRawEvent: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      outboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new EntraUserSyncService(
      graphClient as any,
      checkpointService as any,
      rawIngestService as any,
      prisma as any,
      new OutboxService(),
    );

    const processed = await service.syncUsers('inst-1', 't-1', 'env-1', 'tok');

    expect(processed).toBe(3);
    expect(rawIngestService.ingestRawEvent).toHaveBeenCalledTimes(3);
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledTimes(2);
    const [firstPage, secondPage] =
      prisma.outboxEvent.createMany.mock.calls.map(([args]: any) =>
        args.data.map((row: any) => JSON.parse(row.payload)),
      );
    expect(firstPage.map((p: any) => p.externalId)).toEqual(['u1', 'u2']);
    expect(secondPage).toEqual([
      expect.objectContaining({ externalId: 'u3', removed: true }),
    ]);
    expect(checkpointService.set).toHaveBeenCalledWith(
      't-1',
      'inst-1',
      'users',
      '/users/delta?token=next',
    );
  });
});
