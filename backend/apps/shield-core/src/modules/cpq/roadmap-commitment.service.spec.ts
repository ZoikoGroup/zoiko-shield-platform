import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { QuoteService } from './quote.service';
import { RoadmapCommitmentService } from './roadmap-commitment.service';

describe('RoadmapCommitmentService (Category I2 non-GA boundary)', () => {
  let service: RoadmapCommitmentService;
  let prisma: any;
  let quotes: any;
  let approvals: any;

  const context = {
    tenantId: 'tenant-1',
    environmentId: 'production',
    actorId: 'sales-1',
  };
  const createInput = {
    commitmentKey: 'conditional-xdr-2027',
    targetProductId: '11111111-1111-4111-8111-111111111111',
    featureKey: 'automated-xdr-containment',
    nonGaLanguage:
      'This feature is non-GA, delivery is conditional and not guaranteed.',
    conditions: ['Product release gate passes', 'Customer accepts new order'],
    deliveryDependencyType: 'PRODUCT_RELEASE' as const,
    deliveryDependencyReference: 'release-train-2027-q1',
    targetDeliveryDate: new Date(Date.now() + 86_400_000),
  };
  const futureProduct = {
    id: createInput.targetProductId,
    sku: 'XDR-FUTURE',
    catalog_version_id: 'future-catalog-1',
    release_status: 'GATED',
    catalogVersion: { status: 'DRAFT' },
  };
  const baseCommitment = {
    id: 'roadmap-1',
    tenant_id: 'tenant-1',
    environment_id: 'production',
    quote_id: 'quote-1',
    commitment_key: 'conditional-xdr-2027',
    target_product_id: futureProduct.id,
    target_catalog_version_id: 'future-catalog-1',
    feature_key: 'automated-xdr-containment',
    non_ga_language: createInput.nonGaLanguage,
    conditions: JSON.stringify(createInput.conditions.sort()),
    delivery_dependency_type: 'PRODUCT_RELEASE',
    delivery_dependency_reference: 'release-train-2027-q1',
    target_delivery_date: createInput.targetDeliveryDate,
    status: 'DRAFT',
    entitlement_effect: 'NONE',
    runtime_access_status: 'DISABLED',
    legalApproval: null,
    productApproval: null,
    targetProduct: futureProduct,
  };

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      roadmapCommitment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(prisma)),
    };
    quotes = { getQuoteById: jest.fn() };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapCommitmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: QuoteService, useValue: quotes },
        { provide: CommercialApprovalService, useValue: approvals },
      ],
    }).compile();
    service = module.get(RoadmapCommitmentService);
  });

  it('stores conditional non-GA language separately with no entitlement or runtime access', async () => {
    quotes.getQuoteById.mockResolvedValue({ id: 'quote-1', status: 'DRAFT' });
    prisma.product.findUnique.mockResolvedValue(futureProduct);
    prisma.roadmapCommitment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'roadmap-1', ...data }),
    );

    await service.create(context, 'quote-1', createInput);

    expect(prisma.roadmapCommitment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quote_id: 'quote-1',
          target_product_id: futureProduct.id,
          target_catalog_version_id: 'future-catalog-1',
          status: 'DRAFT',
          entitlement_effect: 'NONE',
          runtime_access_status: 'DISABLED',
          created_by: 'sales-1',
        }),
      }),
    );
  });

  it('rejects already-released products because they must be normal quote lines', async () => {
    quotes.getQuoteById.mockResolvedValue({ id: 'quote-1', status: 'DRAFT' });
    prisma.product.findUnique.mockResolvedValue({
      ...futureProduct,
      release_status: 'RELEASED',
    });

    await expect(
      service.create(context, 'quote-1', createInput),
    ).rejects.toThrow(ConflictException);
    expect(prisma.roadmapCommitment.create).not.toHaveBeenCalled();
  });

  it('creates separate Legal and Product maker-checker approvals atomically', async () => {
    quotes.getQuoteById.mockResolvedValue({
      id: 'quote-1',
      status: 'DRAFT',
      quote_key: 'quote-key-1',
      version: 1,
    });
    prisma.roadmapCommitment.findFirst.mockResolvedValue(baseCommitment);
    approvals.requestApproval
      .mockResolvedValueOnce({ id: 'legal-approval-1' })
      .mockResolvedValueOnce({ id: 'product-approval-1' });
    prisma.roadmapCommitment.update.mockResolvedValue({
      ...baseCommitment,
      status: 'PENDING_APPROVAL',
    });

    await service.submit(context, 'quote-1', 'roadmap-1', {});

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(approvals.requestApproval).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        changeType: 'ROADMAP_LEGAL_REVIEW',
        requiredApprovalRole: 'LEGAL_APPROVER',
      }),
      prisma,
    );
    expect(approvals.requestApproval).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        changeType: 'ROADMAP_PRODUCT_REVIEW',
        requiredApprovalRole: 'PRODUCT_APPROVER',
      }),
      prisma,
    );
  });

  it('requires distinct Legal and Product approvers', async () => {
    prisma.roadmapCommitment.findFirst.mockResolvedValue({
      ...baseCommitment,
      status: 'PENDING_APPROVAL',
      legalApproval: {
        id: 'legal-approval-1',
        object_type: 'RoadmapCommitment',
        object_id: 'roadmap-1',
        change_type: 'ROADMAP_LEGAL_REVIEW',
        status: 'APPROVED',
        approved_by: 'same-reviewer',
      },
      productApproval: {
        id: 'product-approval-1',
        object_type: 'RoadmapCommitment',
        object_id: 'roadmap-1',
        change_type: 'ROADMAP_PRODUCT_REVIEW',
        status: 'PENDING_APPROVAL',
      },
    });

    await expect(
      service.decide(
        'tenant-1',
        'production',
        'roadmap-1',
        'PRODUCT',
        'same-reviewer',
        { decision: 'APPROVED', reason: 'Product conditions verified' },
      ),
    ).rejects.toThrow('distinct approvers');
    expect(approvals.decideApproval).not.toHaveBeenCalled();
  });

  it('becomes approved only after the other independent lane has approved', async () => {
    const approvedAt = new Date();
    prisma.roadmapCommitment.findFirst.mockResolvedValue({
      ...baseCommitment,
      status: 'PENDING_APPROVAL',
      legalApproval: {
        id: 'legal-approval-1',
        object_type: 'RoadmapCommitment',
        object_id: 'roadmap-1',
        change_type: 'ROADMAP_LEGAL_REVIEW',
        status: 'APPROVED',
        approved_by: 'legal-reviewer',
        approved_at: approvedAt,
      },
      productApproval: {
        id: 'product-approval-1',
        object_type: 'RoadmapCommitment',
        object_id: 'roadmap-1',
        change_type: 'ROADMAP_PRODUCT_REVIEW',
        status: 'PENDING_APPROVAL',
      },
    });
    approvals.decideApproval.mockResolvedValue({
      approved_by: 'product-reviewer',
      approved_at: approvedAt,
    });
    prisma.roadmapCommitment.update.mockResolvedValue({ status: 'APPROVED' });

    await service.decide(
      'tenant-1',
      'production',
      'roadmap-1',
      'PRODUCT',
      'product-reviewer',
      { decision: 'APPROVED', reason: 'Release dependency is credible' },
    );

    expect(prisma.roadmapCommitment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          legal_approved_by: 'legal-reviewer',
          product_approved_by: 'product-reviewer',
        }),
      }),
    );
  });

  it('keeps runtime disabled until the product is released in an approved catalog', async () => {
    prisma.roadmapCommitment.findFirst.mockResolvedValue({
      ...baseCommitment,
      status: 'APPROVED',
      targetProduct: {
        ...futureProduct,
        release_status: 'RELEASED',
        catalogVersion: { status: 'DRAFT' },
      },
    });

    await expect(
      service.passReleaseGate(
        'tenant-1',
        'production',
        'roadmap-1',
        'product-reviewer',
        { evidenceRefs: ['evidence://release/1'] },
      ),
    ).rejects.toThrow('remains disabled');
    expect(prisma.roadmapCommitment.update).not.toHaveBeenCalled();
  });

  it('a passed release gate permits only a separate future order, never entitlement', async () => {
    prisma.roadmapCommitment.findFirst.mockResolvedValue({
      ...baseCommitment,
      status: 'APPROVED',
      targetProduct: {
        ...futureProduct,
        release_status: 'RELEASED',
        catalogVersion: { status: 'APPROVED' },
      },
    });
    prisma.roadmapCommitment.update.mockResolvedValue({
      status: 'RELEASE_GATE_PASSED',
    });

    await service.passReleaseGate(
      'tenant-1',
      'production',
      'roadmap-1',
      'product-reviewer',
      { evidenceRefs: ['evidence://release/1'] },
    );

    expect(prisma.roadmapCommitment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RELEASE_GATE_PASSED',
          entitlement_effect: 'NONE',
          runtime_access_status: 'ELIGIBLE_FOR_SEPARATE_ORDER',
        }),
      }),
    );
  });
});
