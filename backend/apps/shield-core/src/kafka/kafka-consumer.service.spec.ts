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

/**
 * The consumer used to connect once at startup and log a failure. After a broker restart it
 * stayed dead while core looked healthy. These tests pin the recovery behaviour.
 */
describe('KafkaConsumerService supervision (recovery after a broker restart)', () => {
  type Listeners = Record<string, (e?: any) => void>;
  interface FakeConsumer {
    events: Record<string, string>;
    listeners: Listeners;
    on: jest.Mock;
    connect: jest.Mock;
    subscribe: jest.Mock;
    run: jest.Mock;
    disconnect: jest.Mock;
  }
  const fake = (over: Partial<Pick<FakeConsumer, 'connect'>> = {}): FakeConsumer => {
    const listeners: Listeners = {};
    return {
      events: { CRASH: 'crash', GROUP_JOIN: 'join', STOP: 'stop' },
      listeners,
      on: jest.fn((event: string, cb: (e?: any) => void) => {
        listeners[event] = cb;
      }),
      connect: over.connect ?? jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
  };

  /** A service whose consumers come from `queue` (the last one repeats). */
  function build(queue: FakeConsumer[]) {
    const built: FakeConsumer[] = [];
    class Testable extends KafkaConsumerService {
      protected buildConsumer(): any {
        const next = queue[Math.min(built.length, queue.length - 1)];
        built.push(next);
        return next;
      }
    }
    const service = new Testable({ inboxEvent: {} } as any);
    service.registerHandler('event.normalized.v1', jest.fn());
    service.registerHandler('alert.created.v1', jest.fn());
    return { service, built };
  }
  const settle = () => jest.advanceTimersByTimeAsync(0);

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts, subscribes to every topic with handlers, and reports running', async () => {
    const c = fake();
    const { service } = build([c]);
    service.onApplicationBootstrap();
    await settle();

    expect(c.connect).toHaveBeenCalledTimes(1);
    expect(c.subscribe).toHaveBeenCalledWith({ topic: 'event.normalized.v1', fromBeginning: false });
    expect(c.subscribe).toHaveBeenCalledWith({ topic: 'alert.created.v1', fromBeginning: false });
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({ running: true, lastError: null, attempts: 1, topics: ['event.normalized.v1', 'alert.created.v1'] });
    await service.onModuleDestroy();
  });

  it('does not block application startup while Kafka is down', async () => {
    const never = fake({ connect: jest.fn(() => new Promise(() => undefined)) });
    const { service } = build([never]);
    const result = service.onApplicationBootstrap(); // returns at once, not a promise to wait on
    expect(result).toBeUndefined();
    await settle();
    expect(service.getStatus().running).toBe(false);
    await service.onModuleDestroy();
  });

  it('keeps retrying when the broker is not ready, then recovers (the reported bug)', async () => {
    const down = () => fake({ connect: jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND redpanda')) });
    const up = fake();
    const first = down();
    const second = down();
    const { service, built } = build([first, second, up]);
    service.onApplicationBootstrap();

    await settle();
    expect(service.getStatus()).toMatchObject({ running: false, lastError: 'getaddrinfo ENOTFOUND redpanda', attempts: 1 });

    await jest.advanceTimersByTimeAsync(1_000); // first retry after 1 s
    expect(built).toHaveLength(2);
    expect(service.getStatus().running).toBe(false);

    await jest.advanceTimersByTimeAsync(2_000); // second retry after a further 2 s
    expect(built).toHaveLength(3);
    expect(service.getStatus()).toMatchObject({ running: true, lastError: null, attempts: 3 });
    expect(up.run).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('doubles the wait each time but never waits longer than 30 seconds', async () => {
    const down = fake({ connect: jest.fn().mockRejectedValue(new Error('down')) });
    const { service, built } = build([down]);
    service.onApplicationBootstrap();
    await settle(); // attempt 1
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const before = built.length;
      await jest.advanceTimersByTimeAsync(wait - 1);
      expect(built.length).toBe(before); // not early
      await jest.advanceTimersByTimeAsync(1);
      expect(built.length).toBe(before + 1); // exactly on time
    }
    await service.onModuleDestroy();
  });

  it('starts a replacement consumer when one crashes for good', async () => {
    const a = fake();
    const b = fake();
    const { service, built } = build([a, b]);
    service.onApplicationBootstrap();
    await settle();
    expect(service.getStatus().running).toBe(true);

    a.listeners.crash({ payload: { error: new Error('group coordinator lost'), restart: false } });
    await settle();
    expect(service.getStatus()).toMatchObject({ running: false, lastError: 'group coordinator lost' });
    expect(a.disconnect).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_000);
    expect(built).toHaveLength(2);
    expect(b.run).toHaveBeenCalledTimes(1);
    expect(service.getStatus().running).toBe(true);
    await service.onModuleDestroy();
  });

  it('leaves a crash that kafkajs restarts itself alone, and tracks when it rejoins', async () => {
    const a = fake();
    const { service, built } = build([a]);
    service.onApplicationBootstrap();
    await settle();

    a.listeners.crash({ payload: { error: new Error('rebalance'), restart: true } });
    expect(service.getStatus().running).toBe(false); // not consuming until it rejoins
    await jest.advanceTimersByTimeAsync(10_000);
    expect(built).toHaveLength(1); // no second consumer: kafkajs handles this one

    a.listeners.join();
    expect(service.getStatus().running).toBe(true);
    await service.onModuleDestroy();
  });

  it('builds nothing when there are no handlers', async () => {
    const { built } = build([fake()]);
    const empty = new (class extends KafkaConsumerService {
      protected buildConsumer(): any {
        built.push(fake());
        return built[built.length - 1];
      }
    })({} as any);
    empty.onApplicationBootstrap();
    await settle();
    expect(built).toHaveLength(0);
    expect(empty.getStatus()).toMatchObject({ running: false, topics: [], attempts: 0 });
  });

  it('stops cleanly on shutdown: disconnects, cancels the pending retry, starts nothing new', async () => {
    const down = fake({ connect: jest.fn().mockRejectedValue(new Error('down')) });
    const { service, built } = build([down]);
    service.onApplicationBootstrap();
    await settle(); // now waiting to retry
    await service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(built).toHaveLength(1);
    expect(down.disconnect).toHaveBeenCalled();
  });

  it('shuts down a healthy consumer too', async () => {
    const c = fake();
    const { service } = build([c]);
    service.onApplicationBootstrap();
    await settle();
    await service.onModuleDestroy();
    expect(c.disconnect).toHaveBeenCalled();
    expect(service.getStatus().running).toBe(false);
  });
});
