import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CatalogService } from './catalog.service';

describe('CatalogService (Category B catalog and pricing controls)', () => {
  let service: CatalogService;
  let prisma: any;
  let approvals: any;

  beforeEach(async () => {
    prisma = {
      catalogVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      product: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      priceBook: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      commercialAccount: { findUnique: jest.fn() },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
      getApprovalById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
      ],
    }).compile();
    service = module.get(CatalogService);
  });

  it('creates a catalog version in DRAFT', async () => {
    prisma.catalogVersion.create.mockResolvedValue({
      id: 'cat-1',
      status: 'DRAFT',
    });
    await expect(
      service.createCatalogVersion({ versionLabel: 'v1-design-partner' }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('preserves a stable internal identity across catalog versions', async () => {
    prisma.catalogVersion.findUnique.mockResolvedValue({
      id: 'cat-2',
      status: 'DRAFT',
    });
    prisma.product.findFirst.mockResolvedValue({
      internal_product_key: 'managed-defense',
      sku: 'MD-001',
      offer_family: 'MANAGED_DEFENSE',
    });

    await expect(
      service.createProduct({
        catalogVersionId: 'cat-2',
        internalProductKey: 'managed-defense',
        sku: 'CHANGED-SKU',
        offerFamily: 'MANAGED_DEFENSE',
        displayName: 'Managed Defense renamed',
        metricFamily: 'protected_resource',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('will not approve a catalog without both released entry offers', async () => {
    prisma.catalogVersion.findUnique.mockResolvedValue({
      id: 'cat-1',
      status: 'DRAFT',
    });
    prisma.product.findMany.mockResolvedValue([
      {
        offer_family: 'MANAGED_DEFENSE',
        launch_class: 'ENTRY_OFFER',
        release_status: 'RELEASED',
      },
    ]);

    await expect(
      service.approveCatalogVersion('cat-1', 'maker-1'),
    ).rejects.toThrow('CONTINUOUS_ASSURANCE');
  });

  it('stores complete typed bundle rules and legacy projections', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      sku: 'ADDON',
      catalog_version_id: 'cat-1',
    });
    prisma.catalogVersion.findUnique.mockResolvedValue({
      id: 'cat-1',
      status: 'DRAFT',
    });
    prisma.product.findMany.mockResolvedValue([{ sku: 'CORE' }]);
    prisma.product.update.mockResolvedValue({ id: 'p1' });

    await service.updateBundleRules('p1', [
      { relationshipType: 'REQUIRES', targetSku: 'CORE' },
      { relationshipType: 'INCLUDED_BY', targetSku: 'CORE' },
    ]);

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        requires: JSON.stringify(['CORE']),
        incompatible_with: '[]',
      }),
    });
  });

  it('rejects a CPQ selection that omits a required bundle dependency', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        sku: 'ADDON',
        bundle_rules: JSON.stringify([
          { relationshipType: 'REQUIRES', targetSku: 'CORE' },
        ]),
      },
    ]);

    await expect(
      service.validateProductSelection('cat-1', ['ADDON']),
    ).rejects.toThrow("requires 'CORE'");
  });

  it('requires a commercial-account mapping for bespoke pricing', async () => {
    prisma.catalogVersion.findUnique.mockResolvedValue({
      id: 'cat-1',
      status: 'DRAFT',
    });
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      catalog_version_id: 'cat-1',
    });

    await expect(
      service.createPriceBook({ catalogVersionId: 'cat-1', productId: 'p1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not submit a price whose Finance margin gate failed', async () => {
    prisma.priceBook.findUnique.mockResolvedValue({
      id: 'pb-1',
      status: 'DRAFT',
      visibility: 'BESPOKE',
    });
    await expect(
      service.requestPriceBookApproval('pb-1', 'maker-1', {
        reason: 'Initial design-partner price',
        marginGatePassed: false,
      }),
    ).rejects.toThrow('margin gate');
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it('applies a price only after a linked approved maker-checker decision', async () => {
    prisma.priceBook.findUnique.mockResolvedValue({
      id: 'pb-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
      visibility: 'BESPOKE',
    });
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'PriceBook',
      object_id: 'pb-1',
      proposed_snapshot: JSON.stringify({ marginGatePassed: true }),
    });
    prisma.priceBook.update.mockResolvedValue({
      id: 'pb-1',
      status: 'APPROVED',
    });

    await expect(
      service.approvePriceBook('pb-1', 'finance-approver'),
    ).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(prisma.commercialApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPLIED' }),
      }),
    );
  });

  it('fails closed when no released, approved, effective account price exists', async () => {
    prisma.priceBook.findFirst.mockResolvedValue(null);
    await expect(
      service.getActivePriceBook('MD-001', 'GB', 'GBP', 'account-1', 'cat-1'),
    ).resolves.toBeNull();
    expect(prisma.priceBook.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          margin_gate_passed: true,
          product: expect.objectContaining({
            release_status: 'RELEASED',
            catalog_version_id: 'cat-1',
          }),
        }),
      }),
    );
  });
});
