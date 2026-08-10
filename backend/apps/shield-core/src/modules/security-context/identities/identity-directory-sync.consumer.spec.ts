import { Test, TestingModule } from '@nestjs/testing';
import { IdentityDirectorySyncConsumer } from './identity-directory-sync.consumer';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { IdentityResolutionService } from './identity-resolution.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';

describe('IdentityDirectorySyncConsumer', () => {
  let consumer: IdentityDirectorySyncConsumer;
  let kafkaConsumerMock: any;
  let identityResolutionMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    kafkaConsumerMock = { registerHandler: jest.fn() };
    identityResolutionMock = {
      resolve: jest.fn().mockResolvedValue({ identityEntityId: 'identity-1', decision: 'CREATED' }),
      markRemoved: jest.fn().mockResolvedValue(undefined),
    };
    prismaMock = { outboxEvent: { create: jest.fn().mockResolvedValue({}) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityDirectorySyncConsumer,
        { provide: KafkaConsumerService, useValue: kafkaConsumerMock },
        { provide: IdentityResolutionService, useValue: identityResolutionMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
      ],
    }).compile();

    consumer = module.get<IdentityDirectorySyncConsumer>(IdentityDirectorySyncConsumer);
  });

  it('registers itself against identity.directory-sync.v1 on module init', () => {
    consumer.onModuleInit();

    expect(kafkaConsumerMock.registerHandler).toHaveBeenCalledWith('identity.directory-sync.v1', expect.any(Function));
  });

  it('resolves the identity and publishes identity.user.upserted.v1 via the outbox for a non-removed record', async () => {
    consumer.onModuleInit();
    const handler = kafkaConsumerMock.registerHandler.mock.calls[0][1];

    await handler({
      payload: { tenantId: 'tenant-a', instanceId: 'conn-1', sourceSystem: 'microsoft-entra-directory', externalId: 'u-1', email: 'a@b.com', removed: false },
    });

    expect(identityResolutionMock.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', externalId: 'u-1', sourceSystem: 'microsoft-entra-directory' }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: 'identity.user.upserted.v1' }) }),
    );
    expect(identityResolutionMock.markRemoved).not.toHaveBeenCalled();
  });

  it('marks the identity removed and publishes identity.user.removed.v1 via the outbox when removed=true', async () => {
    consumer.onModuleInit();
    const handler = kafkaConsumerMock.registerHandler.mock.calls[0][1];

    await handler({
      payload: { tenantId: 'tenant-a', instanceId: 'conn-1', sourceSystem: 'microsoft-entra-directory', externalId: 'u-1', removed: true },
    });

    expect(identityResolutionMock.markRemoved).toHaveBeenCalledWith('tenant-a', 'u-1');
    expect(identityResolutionMock.resolve).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: 'identity.user.removed.v1' }) }),
    );
  });
});
