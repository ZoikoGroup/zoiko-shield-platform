import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { OfferReadinessService } from './offer-readiness.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { ContentHashService } from '../evidence/hashing/content-hash.service';
import { DiscountApprovalService } from './discount-approval.service';

describe('QuoteService (ZS-COM-BILL-001 Part 2 CPQ chain)', () => {
  let service: QuoteService;
  let prismaMock: any;
  let catalogMock: any;
  let approvalMock: any;
  let killSwitchMock: any;
  let readinessMock: any;
  let taxMock: any;
  let hashMock: any;
  let discountMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: { findUnique: jest.fn() },
      catalogVersion: { findUnique: jest.fn() },
      commercialQuote: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      partnerAgreement: { findFirst: jest.fn() },
    };
    catalogMock = {
      getActivePriceBook: jest.fn(),
      resolveBundleExpansions: jest.fn().mockResolvedValue([]),
      validateProductSelection: jest
        .fn()
        .mockImplementation((_catalogVersionId: string, skus: string[]) =>
          Promise.resolve(
            skus.map((sku) => ({
              id: 'prod-1',
              sku,
              internal_product_key: 'managed-defense-standard',
              offer_family: 'MANAGED_DEFENSE',
              metric_family: 'protected_resource',
              bundle_rules: '[]',
            })),
          ),
        ),
    };
    approvalMock = {
      requestApproval: jest.fn(),
      getApprovalById: jest.fn(),
      markApplied: jest.fn(),
    };
    killSwitchMock = { assertNotBlocked: jest.fn() };
    readinessMock = {
      assertReady: jest.fn().mockResolvedValue({ id: 'readiness-1' }),
    };
    taxMock = {
      resolveTax: jest.fn().mockResolvedValue({
        ruleId: 'tax-rule-1',
        ratePercent: 20,
        reverseCharge: false,
        taxAmount: 2,
      }),
    };
    hashMock = {
      hashCanonicalJson: jest.fn().mockReturnValue({
        contentHash: 'a'.repeat(64),
        canonicalBytes: '{"frozen":true}',
      }),
    };
    discountMock = {
      analyze: jest.fn().mockResolvedValue({
        tenant_id: 'tenant-1',
        environment_id: 'production',
        status: 'DRAFT',
        policy_ids: '["policy-1"]',
        gross_margin_by_service_class: '[{"serviceClass":"MANAGED_DEFENSE"}]',
        partner_pass_through: '{"route":"DIRECT","amount":0}',
        commercial_reason: 'Annual commitment',
        term_months: 12,
        ramp_schedule: '[{"startMonth":1,"endMonth":12,"quantityPercent":100}]',
        minimum_commit_amount: 100,
        catalog_minimum_commit_amount: 0,
        discount_expires_at: new Date(Date.now() + 60_000),
        required_approval_role: 'COMMERCIAL_APPROVER',
        authority_rank: 1,
        financial_impact: 18,
        margin_impact: 5,
        technical_authority_hash: 'a'.repeat(64),
        requested_by: 'alice',
      }),
      submitQuote: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CatalogService, useValue: catalogMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
        { provide: OfferReadinessService, useValue: readinessMock },
        { provide: TaxRuleService, useValue: taxMock },
        { provide: ContentHashService, useValue: hashMock },
        { provide: DiscountApprovalService, useValue: discountMock },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
  });

  const readyAccount = {
    id: 'acct-1',
    billing_classification: 'COMMERCIAL_DIRECT',
    billing_source: 'DIRECT',
    customer_legal_name: 'Acme Limited',
    billing_address: '{"countryCode":"US"}',
    tax_facts: '{"countryCode":"US"}',
    currency: 'USD',
    contacts: '[{"type":"BILLING"}]',
    contract_owner_id: 'owner-1',
    tenantBindings: [
      {
        id: 'binding-1',
        tenant_id: 'tenant-1',
        legal_entity_id: 'le-1',
        environment_id: 'production',
        region: 'US',
        residency_policy: 'US_ONLY',
        service_scope: '["MANAGED_DEFENSE"]',
      },
    ],
  };

  const context = {
    tenantId: 'tenant-1',
    environmentId: 'production',
    region: 'US',
    actorId: 'alice',
  };

  const configuration = {
    retentionProfile: 'security-365d',
    serviceTier: 'STANDARD',
    connectorDependencies: ['supported-edr'],
    obligations: ['MONITORING'],
    exclusions: [],
    taxAssumption: {
      jurisdiction: 'US',
      productTaxClass: 'SOFTWARE_SECURITY',
      sellerLegalEntityReference: 'zoiko-tech-inc',
    },
    partnerEconomics: { route: 'DIRECT' as const },
  };

  it('fails closed when no approved price book exists for a SKU (draft price cannot be used)', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue(null);

    await expect(
      service.createQuote(context, {
        commercialAccountId: 'acct-1',
        catalogVersionId: 'cv-1',
        configuration,
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('fails closed when the commercial account is missing production-readiness fields', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue({
      id: 'acct-2',
      billing_classification: 'COMMERCIAL_DIRECT',
      billing_source: null,
      customer_legal_name: null,
      billing_address: '{}',
      tax_facts: '{}',
      currency: null,
      contacts: '[]',
      contract_owner_id: null,
      tenantBindings: [],
    });

    await expect(
      service.createQuote(context, {
        commercialAccountId: 'acct-2',
        catalogVersionId: 'cv-1',
        configuration,
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows a DEMO account without billing fields only when it has the exact tenant binding', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue({
      id: 'acct-3',
      billing_classification: 'DEMO',
      legal_entity_id: null,
      region: null,
      billing_source: null,
      tenantBindings: [readyAccount.tenantBindings[0]],
    });
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    prismaMock.commercialQuote.create.mockResolvedValue({
      id: 'q-1',
      status: 'DRAFT',
    });

    const quote = await service.createQuote(context, {
      commercialAccountId: 'acct-3',
      catalogVersionId: 'cv-1',
      configuration,
      lines: [{ sku: 'SKU-1', quantity: 1 }],
    });

    expect(quote.id).toBe('q-1');
  });

  it('marks requires_approval when any line carries a discount, and routes through the maker-checker engine', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    prismaMock.commercialQuote.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'q-1',
        status: 'DRAFT',
        requires_approval: data.requires_approval,
        snapshot: data.snapshot,
        configuration_hash: data.configuration_hash,
        validation_status: data.validation_status,
        validation: {
          result: data.validation.create.result,
          configuration_hash: data.validation.create.configuration_hash,
        },
      }),
    );

    const quote = await service.createQuote(context, {
      commercialAccountId: 'acct-1',
      catalogVersionId: 'cv-1',
      expiresAt: new Date(Date.now() + 86_400_000),
      discountTerms: {
        reason: 'Annual commitment',
        rampSchedule: [{ startMonth: 1, endMonth: 12, quantityPercent: 100 }],
        minimumCommitAmount: 100,
        discountExpiresAt: new Date(Date.now() + 60_000),
      },
      configuration,
      lines: [{ sku: 'SKU-1', quantity: 1, discountPercent: 15 }],
    });

    expect(quote.requires_approval).toBe(true);

    prismaMock.commercialQuote.findFirst.mockResolvedValue({
      ...quote,
      status: 'DRAFT',
    });
    discountMock.submitQuote.mockResolvedValue({
      ...quote,
      status: 'PENDING_APPROVAL',
      approval_id: 'appr-1',
    });

    await service.submitForApproval('q-1', 'tenant-1', 'production', 'alice');
    expect(discountMock.submitQuote).toHaveBeenCalledWith(
      'q-1',
      'tenant-1',
      'production',
      'alice',
    );
  });

  it('fails closed when Sales supplies a discount without governed terms and expiry', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });

    await expect(
      service.createQuote(context, {
        commercialAccountId: 'acct-1',
        catalogVersionId: 'cv-1',
        configuration,
        lines: [{ sku: 'SKU-1', quantity: 1, discountPercent: 15 }],
      }),
    ).rejects.toThrow('discountTerms');
    expect(discountMock.analyze).not.toHaveBeenCalled();
  });

  it('fails closed before persistence when regional offer readiness is unavailable', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    readinessMock.assertReady.mockRejectedValue(
      new ConflictException('capacity unavailable'),
    );

    await expect(
      service.createQuote(context, {
        commercialAccountId: 'acct-1',
        catalogVersionId: 'cv-1',
        configuration,
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow('capacity unavailable');
    expect(prismaMock.commercialQuote.create).not.toHaveBeenCalled();
  });

  it('persists a tenant-bound versioned configuration and its matching validation receipt', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    prismaMock.commercialQuote.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'q-1', ...data }),
    );

    await service.createQuote(context, {
      commercialAccountId: 'acct-1',
      catalogVersionId: 'cv-1',
      quoteKey: 'renewal-2027',
      configuration,
      lines: [{ sku: 'SKU-1', quantity: 2 }],
    });

    expect(prismaMock.commercialQuote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          environment_id: 'production',
          quote_key: 'renewal-2027',
          version: 1,
          configuration_hash: 'a'.repeat(64),
          validation_status: 'VALIDATED',
          requested_by: 'alice',
          validation: {
            create: expect.objectContaining({
              configuration_hash: 'a'.repeat(64),
              readiness_record_ids: '["readiness-1"]',
              price_book_ids: '["pb-1"]',
              tax_rule_id: 'tax-rule-1',
              result: 'PASS',
              validated_by: 'alice',
            }),
          },
        }),
      }),
    );
    expect(hashMock.hashCanonicalJson).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            sku: 'SKU-1',
            internalProductKey: 'managed-defense-standard',
            offerFamily: 'MANAGED_DEFENSE',
            metricFamily: 'protected_resource',
          }),
        ],
      }),
    );
  });

  it('fails closed when the declared tax assumption has no approved rule', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue(readyAccount);
    prismaMock.catalogVersion.findUnique.mockResolvedValue({
      id: 'cv-1',
      status: 'APPROVED',
    });
    catalogMock.getActivePriceBook.mockResolvedValue({
      id: 'pb-1',
      product_id: 'prod-1',
      unit_price: 10,
    });
    taxMock.resolveTax.mockResolvedValue(null);

    await expect(
      service.createQuote(context, {
        commercialAccountId: 'acct-1',
        catalogVersionId: 'cv-1',
        configuration,
        lines: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.create).not.toHaveBeenCalled();
  });

  it('always includes tenant and environment in the quote lookup boundary', async () => {
    prismaMock.commercialQuote.findFirst.mockResolvedValue(null);

    await expect(
      service.getQuoteById('q-1', 'tenant-1', 'production'),
    ).rejects.toThrow("Quote 'q-1' not found");
    expect(prismaMock.commercialQuote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'q-1',
          tenant_id: 'tenant-1',
          environment_id: 'production',
        },
      }),
    );
  });

  it('blocks approving a quote that requires approval until the linked CommercialApproval is APPROVED', async () => {
    prismaMock.commercialQuote.findFirst.mockResolvedValue({
      id: 'q-1',
      status: 'PENDING_APPROVAL',
      requires_approval: true,
      approval_id: 'appr-1',
      requested_by: 'alice',
      validation_status: 'VALIDATED',
      configuration_hash: 'hash-1',
      validation: { result: 'PASS', configuration_hash: 'hash-1' },
    });
    approvalMock.getApprovalById.mockResolvedValue({
      id: 'appr-1',
      status: 'PENDING_APPROVAL',
    });

    await expect(
      service.approveQuote('q-1', 'tenant-1', 'production', 'bob'),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks quote submission while any roadmap promise lacks both Legal and Product approval', async () => {
    prismaMock.commercialQuote.findFirst.mockResolvedValue({
      id: 'q-1',
      status: 'DRAFT',
      requires_approval: false,
      validation_status: 'VALIDATED',
      configuration_hash: 'hash-1',
      validation: { result: 'PASS', configuration_hash: 'hash-1' },
      roadmapCommitments: [
        {
          id: 'roadmap-1',
          status: 'PENDING_APPROVAL',
          entitlement_effect: 'NONE',
          runtime_access_status: 'DISABLED',
          legalApproval: { status: 'APPROVED' },
          productApproval: { status: 'PENDING_APPROVAL' },
        },
      ],
    });

    await expect(
      service.submitForApproval('q-1', 'tenant-1', 'production', 'alice'),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.update).not.toHaveBeenCalled();
  });

  it('dynamically expires a quote past expires_at on read, before a sweeper ever runs, so approval fails', async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    prismaMock.commercialQuote.findFirst.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      expires_at: pastExpiry,
      requires_approval: false,
    });
    prismaMock.commercialQuote.update.mockResolvedValue({
      id: 'q-1',
      status: 'EXPIRED',
      expires_at: pastExpiry,
    });

    await expect(
      service.approveQuote('q-1', 'tenant-1', 'production', 'bob'),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('does not touch a quote whose expires_at has not yet passed', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    prismaMock.commercialQuote.findFirst.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
      expires_at: future,
    });

    const quote = await service.getQuoteById('q-1', 'tenant-1', 'production');

    expect(quote.status).toBe('APPROVED');
    expect(prismaMock.commercialQuote.update).not.toHaveBeenCalled();
  });

  it('OPS-01: refuses to approve a quote while the commercial kill switch blocks QUOTE_APPROVAL', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(
      new ConflictException('blocked'),
    );

    await expect(
      service.approveQuote('q-1', 'tenant-1', 'production', 'bob'),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialQuote.findFirst).not.toHaveBeenCalled();
  });
});
