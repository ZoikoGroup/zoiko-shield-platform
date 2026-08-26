import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteService } from './quote.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { SubscriptionService } from './subscription.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

describe('OrderService.provisionOrder (atomic Order -> Contract -> Subscription)', () => {
  let service: OrderService;
  let prismaMock: any;
  let quoteMock: any;
  let contractMock: any;
  let subscriptionMock: any;
  let idempotencyMock: any;
  let killSwitchMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialOrder: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      commercialOrderLine: { update: jest.fn() },
      entitlement: { create: jest.fn() },
      serviceObligation: { create: jest.fn() },
      bundleMeterProjection: { create: jest.fn() },
      bundleCostAllocation: { create: jest.fn() },
      bundleClaimEligibility: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };
    quoteMock = { getQuoteById: jest.fn(), markConverted: jest.fn() };
    contractMock = { createContract: jest.fn() };
    subscriptionMock = { createSubscription: jest.fn() };
    idempotencyMock = {
      run: jest.fn().mockImplementation(async (_p, fn) => {
        const result = await fn();
        return { ...result, replayed: false };
      }),
    };
    killSwitchMock = { assertNotBlocked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: QuoteService, useValue: quoteMock },
        { provide: ContractStateService, useValue: contractMock },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: IdempotencyService, useValue: idempotencyMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('OPS-01: refuses to create an order while the kill switch blocks ORDER_CREATION', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(new Error('blocked'));

    await expect(
      service.createOrderFromQuote(
        {
          tenantId: 'tenant-1',
          environmentId: 'production',
          actorId: 'alice',
        },
        { quoteId: 'q-1' },
        'key-1',
      ),
    ).rejects.toThrow('blocked');
    expect(quoteMock.getQuoteById).not.toHaveBeenCalled();
  });

  it('preserves the approved discount as list, percent, and net order economics', async () => {
    quoteMock.getQuoteById.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      commercial_account_id: 'acct-1',
      lines: [
        {
          product_id: 'product-1',
          quantity: 2,
          unit_price: 100,
          line_discount_percent: 20,
        },
      ],
    });
    prismaMock.commercialOrder.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'order-1', ...data }),
    );

    await service.createOrderFromQuote(
      {
        tenantId: 'tenant-1',
        environmentId: 'production',
        actorId: 'sales-operator',
      },
      { quoteId: 'q-1' },
      'order-key-1',
    );

    expect(prismaMock.commercialOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: {
            create: [
              expect.objectContaining({
                product_id: 'product-1',
                quantity: 2,
                list_unit_price: 100,
                discount_percent: 20,
                unit_price: 80,
                line_type: 'CUSTOMER',
                billable: true,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('expands a frozen bundle into allocated non-billable component order lines', async () => {
    quoteMock.getQuoteById.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      commercial_account_id: 'acct-1',
      currency: 'USD',
      snapshot: JSON.stringify({
        currency: 'USD',
        lines: [{ productId: 'bundle-1', sku: 'SHIELD-BUNDLE' }],
        bundleExpansions: [
          {
            parentProductId: 'bundle-1',
            parentSku: 'SHIELD-BUNDLE',
            components: [
              {
                productId: 'tech-1',
                sku: 'TECH-COMPONENT',
                internalProductKey: 'tech',
                displayName: 'Technology',
                componentType: 'TECHNOLOGY',
                quantity: 2,
                allocationPercent: 70,
                entitlementOfferType: 'MANAGED_DEFENSE',
                meterKey: 'resources',
                meterDefinitionId: 'meter-1',
                costClass: 'PLATFORM',
                claimKey: 'MONITORING',
                claimRegisterId: 'claim-1',
                invoicePresentation: 'AGGREGATE_ALLOWED',
              },
              {
                productId: 'service-1',
                sku: 'SERVICE-COMPONENT',
                internalProductKey: 'service',
                displayName: 'Human service',
                componentType: 'HUMAN_SERVICE',
                quantity: 1,
                allocationPercent: 30,
                serviceObligationType: 'EXPERT_REVIEW',
                costClass: 'ANALYST_LABOR',
                claimKey: 'EXPERT_REVIEW',
                claimRegisterId: 'claim-2',
                invoicePresentation: 'AGGREGATE_ALLOWED',
              },
            ],
          },
        ],
      }),
      lines: [
        {
          product_id: 'bundle-1',
          quantity: 3,
          unit_price: 100,
          line_discount_percent: 20,
        },
      ],
    });
    prismaMock.commercialOrder.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'order-1', ...data }),
    );

    await service.createOrderFromQuote(
      {
        tenantId: 'tenant-1',
        environmentId: 'production',
        actorId: 'sales-operator',
      },
      { quoteId: 'q-1' },
      'bundle-order-key',
    );

    const createdLines =
      prismaMock.commercialOrder.create.mock.calls[0][0].data.lines.create;
    expect(createdLines).toHaveLength(3);
    expect(createdLines[1]).toEqual(
      expect.objectContaining({
        line_type: 'BUNDLE_COMPONENT',
        billable: false,
        component_type: 'TECHNOLOGY',
        quantity: 6,
        list_unit_price: 35,
        unit_price: 28,
        cost_allocation_percent: 70,
      }),
    );
    expect(createdLines[2]).toEqual(
      expect.objectContaining({
        component_type: 'HUMAN_SERVICE',
        quantity: 3,
        list_unit_price: 30,
        unit_price: 24,
      }),
    );
  });

  it('creates the Contract and Subscription inside the same $transaction as the order update', async () => {
    prismaMock.commercialOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      status: 'CREATED',
      quote_id: 'q-1',
      commercial_account_id: 'acct-1',
      lines: [],
    });
    quoteMock.getQuoteById.mockResolvedValue({
      id: 'q-1',
      catalog_version_id: 'cv-1',
      quote_key: 'quote-2027',
      version: 2,
      configuration_hash: 'a'.repeat(64),
      validation: { id: 'validation-1' },
      snapshot: '{"controlled":true}',
      roadmapCommitments: [
        {
          id: 'roadmap-1',
          commitment_key: 'conditional-xdr-2027',
          target_product_id: 'future-product-1',
          feature_key: 'automated-xdr-containment',
          non_ga_language: 'This feature is non-GA and conditional.',
          conditions: '["Product release gate passes"]',
          delivery_dependency_type: 'PRODUCT_RELEASE',
          delivery_dependency_reference: 'release-train-2027-q1',
          target_delivery_date: null,
          status: 'APPROVED',
          entitlement_effect: 'NONE',
          runtime_access_status: 'DISABLED',
        },
      ],
    });
    contractMock.createContract.mockResolvedValue({ id: 'contract-1' });
    prismaMock.commercialOrder.update.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      contract_id: 'contract-1',
    });
    subscriptionMock.createSubscription.mockResolvedValue({ id: 'sub-1' });

    await service.provisionOrder(
      {
        tenantId: 'tenant-1',
        environmentId: 'production',
        actorId: 'operator-1',
      },
      'order-1',
    );

    // Single $transaction call wrapping all three writes — not three separate awaits.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Both sibling services received the same tx client (prismaMock, per our mock's cb(prismaMock)).
    expect(contractMock.createContract).toHaveBeenCalledWith(
      expect.objectContaining({
        orderConfig: expect.objectContaining({
          roadmapCommitments: [
            expect.objectContaining({
              id: 'roadmap-1',
              entitlementEffect: 'NONE',
              runtimeAccessStatus: 'DISABLED',
            }),
          ],
        }),
      }),
      prismaMock,
    );
    expect(subscriptionMock.createSubscription).toHaveBeenCalledWith(
      expect.anything(),
      prismaMock,
    );
    expect(prismaMock.commercialOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order-1',
          quote: {
            tenant_id: 'tenant-1',
            environment_id: 'production',
          },
        },
      }),
    );
  });

  it('creates every governed downstream projection before marking a bundle order provisioned', async () => {
    prismaMock.commercialOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      status: 'CREATED',
      quote_id: 'q-1',
      commercial_account_id: 'acct-1',
      lines: [
        {
          id: 'tech-line-1',
          line_type: 'BUNDLE_COMPONENT',
          component_type: 'TECHNOLOGY',
          entitlement_offer_type: 'MANAGED_DEFENSE',
          meter_definition_id: 'meter-1',
          service_obligation_type: null,
          cost_class: 'PLATFORM',
          cost_allocation_percent: 70,
          claim_key: 'MONITORING',
          claim_register_id: 'claim-1',
          component_snapshot: '{"componentType":"TECHNOLOGY"}',
          unit_price: 70,
          quantity: 1,
          currency: 'USD',
        },
        {
          id: 'service-line-1',
          line_type: 'BUNDLE_COMPONENT',
          component_type: 'HUMAN_SERVICE',
          entitlement_offer_type: null,
          meter_definition_id: null,
          service_obligation_type: 'EXPERT_REVIEW',
          cost_class: 'ANALYST_LABOR',
          cost_allocation_percent: 30,
          claim_key: 'EXPERT_REVIEW',
          claim_register_id: 'claim-2',
          component_snapshot: '{"componentType":"HUMAN_SERVICE"}',
          unit_price: 30,
          quantity: 1,
          currency: 'USD',
        },
      ],
    });
    quoteMock.getQuoteById.mockResolvedValue({
      id: 'q-1',
      catalog_version_id: 'cv-1',
      quote_key: 'quote-1',
      version: 1,
      configuration_hash: 'a'.repeat(64),
      validation: { id: 'validation-1' },
      snapshot: '{}',
      region: 'US',
      discountReview: null,
      roadmapCommitments: [],
    });
    contractMock.createContract.mockResolvedValue({ id: 'contract-1' });
    subscriptionMock.createSubscription.mockResolvedValue({ id: 'sub-1' });
    prismaMock.entitlement.create.mockResolvedValue({ id: 'ent-1' });
    prismaMock.serviceObligation.create.mockResolvedValue({ id: 'obl-1' });
    prismaMock.bundleMeterProjection.create.mockResolvedValue({
      id: 'meter-proj-1',
    });
    prismaMock.bundleCostAllocation.create.mockResolvedValue({ id: 'cost-1' });
    prismaMock.bundleClaimEligibility.create.mockResolvedValue({
      id: 'claim-proj-1',
    });
    prismaMock.commercialOrder.update.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
    });

    const result = await service.provisionOrder(
      {
        tenantId: 'tenant-1',
        environmentId: 'production',
        actorId: 'operator-1',
      },
      'order-1',
    );

    expect(prismaMock.entitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bundle_order_line_id: 'tech-line-1',
        status: 'PENDING_ACTIVATION',
      }),
    });
    expect(prismaMock.bundleMeterProjection.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.serviceObligation.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.bundleCostAllocation.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.bundleClaimEligibility.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.commercialOrderLine.update).toHaveBeenCalledTimes(2);
    expect(result.bundleComponents).toHaveLength(2);
  });
});
