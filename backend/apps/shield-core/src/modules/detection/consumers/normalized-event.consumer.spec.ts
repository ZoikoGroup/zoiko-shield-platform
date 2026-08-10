import { Test, TestingModule } from '@nestjs/testing';
import { NormalizedEventConsumer } from './normalized-event.consumer';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { ContextResolutionService } from '../../security-context/context/context-resolution.service';
import { DetectionRuntimeService } from '../runtime/detection-runtime.service';

describe('NormalizedEventConsumer', () => {
  let consumer: NormalizedEventConsumer;
  let kafkaConsumerMock: any;
  let contextResolutionMock: any;
  let detectionRuntimeMock: any;

  const payload = { tenantId: 'tenant-a', normalizedEventId: 'evt-1', eventClass: 'AUTHENTICATION' };
  const resolved = { eventId: 'evt-1', identityEntityId: 'identity-1', contextSnapshotId: 'snap-1', contextHealth: 'RESOLVED' };

  beforeEach(async () => {
    kafkaConsumerMock = { registerHandler: jest.fn() };
    contextResolutionMock = { resolveFromEvent: jest.fn().mockResolvedValue(resolved) };
    detectionRuntimeMock = { evaluateFromEvent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormalizedEventConsumer,
        { provide: KafkaConsumerService, useValue: kafkaConsumerMock },
        { provide: ContextResolutionService, useValue: contextResolutionMock },
        { provide: DetectionRuntimeService, useValue: detectionRuntimeMock },
      ],
    }).compile();

    consumer = module.get<NormalizedEventConsumer>(NormalizedEventConsumer);
  });

  it('registers itself against event.normalized.v1 on module init', () => {
    consumer.onModuleInit();

    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith('event.normalized.v1', expect.any(Function));
  });

  it('resolves context then evaluates detection, in that order, threading the resolved result through', async () => {
    consumer.onModuleInit();
    const handler = kafkaConsumerMock.registerHandler.mock.calls[0][1];

    await handler({ eventId: 'kafka-evt-1', payload });

    expect(contextResolutionMock.resolveFromEvent).toHaveBeenCalledWith(payload);
    expect(detectionRuntimeMock.evaluateFromEvent).toHaveBeenCalledWith(payload, resolved);
  });

  it('skips malformed payloads instead of throwing', async () => {
    consumer.onModuleInit();
    const handler = kafkaConsumerMock.registerHandler.mock.calls[0][1];

    await handler({ eventId: 'kafka-evt-2', payload: {} });

    expect(contextResolutionMock.resolveFromEvent).not.toHaveBeenCalled();
  });
});
