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
