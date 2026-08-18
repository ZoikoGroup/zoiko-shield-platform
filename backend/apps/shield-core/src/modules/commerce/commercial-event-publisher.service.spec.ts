import { Test, TestingModule } from '@nestjs/testing';
import { CommercialEventPublisherService } from './commercial-event-publisher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';

describe('CommercialEventPublisherService (ZS-COM-BILL-001 Part 31 transactional outbox)', () => {
  let service: CommercialEventPublisherService;
  let prismaMock: any;
  let kafkaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialEvent: { findMany: jest.fn(), update: jest.fn() },
    };
    kafkaMock = { publishEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialEventPublisherService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KafkaProducerService, useValue: kafkaMock },
      ],
    }).compile();

    service = module.get<CommercialEventPublisherService>(
      CommercialEventPublisherService,
    );
  });

  it('only ever queries for unpublished events (published_at: null) — never re-reads already-published rows', async () => {
    prismaMock.commercialEvent.findMany.mockResolvedValue([]);

    await service.publishPending();

    expect(prismaMock.commercialEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { published_at: null } }),
    );
  });

  it('publishes each pending event and marks it published only after a successful Kafka publish', async () => {
    prismaMock.commercialEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        event_type: 'contract.state_changed',
        tenant_id: 'acct-1',
        actor: 'system',
        payload: '{"contractId":"c-1"}',
        idempotency_key: 'key-1',
      },
    ]);

    await service.publishPending();

    expect(kafkaMock.publishEvent).toHaveBeenCalledWith(
      'commercial.contract.state_changed',
      'contract.state_changed',
      expect.objectContaining({ tenantId: 'acct-1', contractId: 'c-1' }),
      expect.objectContaining({ correlationId: 'key-1' }),
    );
    expect(prismaMock.commercialEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: { published_at: expect.any(Date) },
      }),
    );
  });

  it('a publish failure for one event does not mark it published, and does not throw out of the batch', async () => {
    prismaMock.commercialEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        event_type: 'payment.created',
        tenant_id: 'acct-1',
        actor: 'system',
        payload: '{}',
        idempotency_key: 'key-1',
      },
    ]);
    kafkaMock.publishEvent.mockRejectedValue(new Error('broker unreachable'));

    await expect(service.publishPending()).resolves.not.toThrow();
    expect(prismaMock.commercialEvent.update).not.toHaveBeenCalled();
  });
});
