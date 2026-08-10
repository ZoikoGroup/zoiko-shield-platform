import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteService } from './quote.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { SubscriptionService } from './subscription.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

describe('OrderService.provisionOrder (atomic Order -> Contract -> Subscription)', () => {
  let service: OrderService;
  let prismaMock: any;
  let quoteMock: any;
  let contractMock: any;
  let subscriptionMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialOrder: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };
    quoteMock = { getQuoteById: jest.fn() };
    contractMock = { createContract: jest.fn() };
    subscriptionMock = { createSubscription: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: QuoteService, useValue: quoteMock },
        { provide: ContractStateService, useValue: contractMock },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: IdempotencyService, useValue: { run: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('creates the Contract and Subscription inside the same $transaction as the order update', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({ id: 'order-1', status: 'CREATED', quote_id: 'q-1', commercial_account_id: 'acct-1', lines: [] });
    quoteMock.getQuoteById.mockResolvedValue({ id: 'q-1', catalog_version_id: 'cv-1' });
    contractMock.createContract.mockResolvedValue({ id: 'contract-1' });
    prismaMock.commercialOrder.update.mockResolvedValue({ id: 'order-1', status: 'PROVISIONED', contract_id: 'contract-1' });
    subscriptionMock.createSubscription.mockResolvedValue({ id: 'sub-1' });

    await service.provisionOrder('order-1');

    // Single $transaction call wrapping all three writes — not three separate awaits.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Both sibling services received the same tx client (prismaMock, per our mock's cb(prismaMock)).
    expect(contractMock.createContract).toHaveBeenCalledWith(expect.anything(), prismaMock);
    expect(subscriptionMock.createSubscription).toHaveBeenCalledWith(expect.anything(), prismaMock);
  });
});
