import { Test, TestingModule } from '@nestjs/testing';
import { KafkaConsumerService } from './kafka-consumer.service';
import { PrismaService } from '../prisma/prisma.service';

describe('KafkaConsumerService', () => {
  let service: KafkaConsumerService;
  let prismaMock: any;

  const envelope = {
    eventId: 'evt-abc',
    eventType: 'test.event',
    eventVersion: '1',
    tenantId: 'tenant-a',
    correlationId: 'corr-1',
    traceId: 'trace-1',
    occurredAt: new Date().toISOString(),
    producedAt: new Date().toISOString(),
    payload: { tenantId: 'tenant-a' },
  };

  beforeEach(async () => {
    prismaMock = {
      inboxEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaConsumerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<KafkaConsumerService>(KafkaConsumerService);
  });

  const invokeHandleMessage = (topic: string, value: unknown) =>
    (service as any).handleMessage({
      topic,
      partition: 0,
      message: { value: Buffer.from(JSON.stringify(value)) },
    });

  it('dispatches to registered handlers and records an InboxEvent after success', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerHandler('test.topic', handler);

    await invokeHandleMessage('test.topic', envelope);

    expect(handler).toHaveBeenCalledWith(envelope);
    expect(prismaMock.inboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_id: 'evt-abc',
          topic: 'test.topic',
        }),
      }),
    );
  });

  it('skips dispatch entirely when the eventId was already processed (inbox dedup)', async () => {
    prismaMock.inboxEvent.findUnique.mockResolvedValue({
      id: 'inbox-1',
      event_id: 'evt-abc',
    });
    const handler = jest.fn();
    service.registerHandler('test.topic', handler);

    await invokeHandleMessage('test.topic', envelope);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not record the InboxEvent when a handler throws, so a redelivery gets retried', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    service.registerHandler('test.topic', handler);

    await expect(invokeHandleMessage('test.topic', envelope)).rejects.toThrow(
      'One or more handlers failed',
    );

    expect(prismaMock.inboxEvent.create).not.toHaveBeenCalled();
  });

  it('does not throw on a malformed (non-JSON) message', async () => {
    await expect(
      (service as any).handleMessage({
        topic: 't',
        partition: 0,
        message: { value: Buffer.from('not json') },
      }),
    ).resolves.toBeUndefined();
  });
});
