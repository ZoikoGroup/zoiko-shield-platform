import { EntraEventHubConsumer } from './entra.event-hub.consumer';

describe('EntraEventHubConsumer', () => {
  const instance = {
    id: 'connector-1',
    tenant_id: 'tenant-1',
    environment_id: 'production-1',
    source_region: 'eu-west-1',
  };

  let consumer: EntraEventHubConsumer;
  let prisma: any;
  let normalizer: any;
  let rawIngest: any;
  let normalization: any;
  let kafka: any;

  beforeEach(() => {
    prisma = {
      eventHubConsumerCheckpoint: { upsert: jest.fn().mockResolvedValue({}) },
      connectorInstance: { updateMany: jest.fn() },
      connectorError: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    normalizer = {
      normalizeSignInLog: jest.fn().mockReturnValue({
        tenant_id: 'tenant-1',
        environment_id: 'production-1',
        event_type: 'security.identity.signin.v1',
        source_event_id: 'event-1',
        event_timestamp: '2026-08-12T12:00:00.000Z',
        correlation_id: 'corr-1',
      }),
    };
    rawIngest = {
      ingestRawEvent: jest.fn().mockResolvedValue({
        id: 'raw-1',
        processingStatus: 'ACCEPTED',
      }),
    };
    normalization = { normalizeRawEvent: jest.fn().mockResolvedValue({}) };
    kafka = { publishEvent: jest.fn().mockResolvedValue(undefined) };
    consumer = new EntraEventHubConsumer(
      prisma,
      normalizer,
      rawIngest,
      normalization,
      kafka,
    );
  });

  it('durably ingests and normalizes records before advancing the partition checkpoint', async () => {
    await (consumer as any).processEvents(instance, '3', [
      {
        body: {
          records: [
            {
              id: 'event-1',
              userId: 'user-1',
              userPrincipalName: 'user@example.com',
              createdDateTime: '2026-08-12T12:00:00.000Z',
            },
          ],
        },
        enqueuedTimeUtc: new Date('2026-08-12T12:00:01.000Z'),
        offset: '42',
        sequenceNumber: 9,
      },
    ]);

    expect(rawIngest.ingestRawEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        environmentId: 'production-1',
        connectorId: 'connector-1',
        sourceEventId: 'event-1',
      }),
    );
    expect(normalization.normalizeRawEvent).toHaveBeenCalledWith('raw-1');
    expect(normalizer.normalizeSignInLog).toHaveBeenCalledWith(
      expect.any(Object),
      'tenant-1',
      'production-1',
      'eu-west-1',
    );
    expect(kafka.publishEvent).toHaveBeenCalledTimes(1);
    expect(prisma.eventHubConsumerCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenant_id: 'tenant-1',
          partitionId: '3',
          offset: '42',
          sequenceNumber: 9n,
        }),
      }),
    );
  });

  it('does not duplicate downstream normalization but still advances an already-ingested event checkpoint', async () => {
    rawIngest.ingestRawEvent.mockResolvedValue({
      id: 'raw-existing',
      processingStatus: 'DUPLICATE_IGNORED',
    });

    await (consumer as any).processEvents(instance, '0', [
      {
        body: { id: 'event-existing' },
        enqueuedTimeUtc: new Date(),
        offset: '7',
        sequenceNumber: 7,
      },
    ]);

    expect(normalization.normalizeRawEvent).not.toHaveBeenCalled();
    expect(kafka.publishEvent).not.toHaveBeenCalled();
    expect(prisma.eventHubConsumerCheckpoint.upsert).toHaveBeenCalledTimes(1);
  });
});
