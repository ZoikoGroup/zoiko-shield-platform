import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryIngestedConsumer } from './telemetry-ingested.consumer';
import { NormalizationService } from './normalization.service';

describe('TelemetryIngestedConsumer', () => {
  let service: TelemetryIngestedConsumer;
  let normalizationMock: any;

  beforeEach(async () => {
    normalizationMock = {
      normalizeRawEvent: jest.fn().mockResolvedValue({ id: 'norm-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryIngestedConsumer,
        { provide: NormalizationService, useValue: normalizationMock },
      ],
    }).compile();

    service = module.get<TelemetryIngestedConsumer>(TelemetryIngestedConsumer);
  });

  const invokeHandleMessage = (value: unknown) =>
    (service as any).handleMessage({
      topic: 'telemetry.ingested',
      partition: 0,
      message: { value: Buffer.from(JSON.stringify(value)) },
    });

  it('normalizes an ACCEPTED raw event', async () => {
    await invokeHandleMessage({ rawEventId: 'raw-1', status: 'ACCEPTED' });

    expect(normalizationMock.normalizeRawEvent).toHaveBeenCalledWith('raw-1');
  });

  it('skips QUARANTINED and DUPLICATE_IGNORED events', async () => {
    await invokeHandleMessage({ rawEventId: 'raw-1', status: 'QUARANTINED' });
    await invokeHandleMessage({
      rawEventId: 'raw-2',
      status: 'DUPLICATE_IGNORED',
    });

    expect(normalizationMock.normalizeRawEvent).not.toHaveBeenCalled();
  });

  it('skips a message missing rawEventId', async () => {
    await invokeHandleMessage({ status: 'ACCEPTED' });

    expect(normalizationMock.normalizeRawEvent).not.toHaveBeenCalled();
  });

  it('does not throw on a malformed (non-JSON) message', async () => {
    await expect(
      (service as any).handleMessage({
        topic: 'telemetry.ingested',
        partition: 0,
        message: { value: Buffer.from('not json') },
      }),
    ).resolves.toBeUndefined();

    expect(normalizationMock.normalizeRawEvent).not.toHaveBeenCalled();
  });

  it('propagates the error when normalization fails, so Kafka retries the message', async () => {
    normalizationMock.normalizeRawEvent.mockRejectedValue(new Error('boom'));

    await expect(
      invokeHandleMessage({ rawEventId: 'raw-1', status: 'ACCEPTED' }),
    ).rejects.toThrow('boom');
  });
});

describe('TelemetryIngestedConsumer supervision', () => {
  /** A consumer that never reaches a broker, so no real Kafka client is started. */
  class Offline extends TelemetryIngestedConsumer {
    protected buildConsumer(): any {
      return {
        events: { CRASH: 'crash', GROUP_JOIN: 'join', STOP: 'stop' },
        on: jest.fn(),
        connect: jest.fn(() => new Promise(() => undefined)),
        subscribe: jest.fn(),
        run: jest.fn(),
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
    }
  }
  const make = () => new Offline({ normalizeRawEvent: jest.fn() } as any);

  it('reports its state, so a stalled normalizer is visible', () => {
    expect(make().getStatus()).toMatchObject({ running: false, attempts: 0, topics: ['telemetry.ingested'] });
  });

  it('does not block startup, and stops cleanly', async () => {
    const consumer = make();
    expect(consumer.onApplicationBootstrap()).toBeUndefined();
    await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
  });
});
