import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

describe('InvoiceSkeletonService (FIN-02 Immutability)', () => {
  let service: InvoiceSkeletonService;
  let prismaMock: any;
  let taxRuleMock: any;
  let killSwitchMock: any;
  let validOrderLine: any;

  beforeEach(async () => {
    prismaMock = {
      commercialInvoice: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      commercialInvoiceLine: { create: jest.fn() },
      commercialOrderLine: { findUnique: jest.fn(), findMany: jest.fn() },
      contract: { findUnique: jest.fn() },
      priceBook: { findUnique: jest.fn() },
      commercialSubscription: { findFirst: jest.fn() },
      entitlement: { findFirst: jest.fn() },
      serviceObligation: { findFirst: jest.fn() },
      meterAuthorizationPolicy: { findFirst: jest.fn() },
      meterBillingExport: { findFirst: jest.fn() },
      commercialCreditNote: { create: jest.fn() },
      commercialDebitNote: { create: jest.fn() },
    };
    taxRuleMock = { resolveTax: jest.fn() };
    killSwitchMock = { assertNotBlocked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSkeletonService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TaxRuleService, useValue: taxRuleMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    service = module.get<InvoiceSkeletonService>(InvoiceSkeletonService);

    prismaMock.contract.findUnique.mockResolvedValue({
      id: 'cnt-1',
      commercial_account_id: 'comm-1',
      status: 'ACTIVE',
      term_start: new Date('2026-01-01T00:00:00.000Z'),
      term_end: new Date('2027-01-01T00:00:00.000Z'),
    });
    validOrderLine = {
      id: 'order-line-1',
      order_id: 'order-1',
      product_id: 'product-1',
      catalog_sku: 'DEFENSE',
      line_type: 'CUSTOMER',
      billable: true,
      quantity: 1,
      list_unit_price: 100,
      discount_percent: 0,
      currency: 'USD',
      product: { id: 'product-1', sku: 'DEFENSE' },
      order: {
        id: 'order-1',
        status: 'PROVISIONED',
        contract_id: 'cnt-1',
        commercial_account_id: 'comm-1',
        tenant_id: 'tenant-1',
        quote: {
          status: 'APPROVED',
          catalog_version_id: 'catalog-1',
          lines: [
            {
              product_id: 'product-1',
              price_book_id: 'price-book-1',
              unit_price: 100,
              line_discount_percent: 0,
            },
          ],
        },
      },
    };
    prismaMock.commercialOrderLine.findUnique.mockResolvedValue(validOrderLine);
    prismaMock.priceBook.findUnique.mockResolvedValue({
      id: 'price-book-1',
      status: 'APPROVED',
      product_id: 'product-1',
      catalog_version_id: 'catalog-1',
      commercial_account_id: null,
      currency: 'USD',
      unit_price: 100,
    });
    prismaMock.entitlement.findFirst.mockResolvedValue({
      id: 'entitlement-1',
      commercial_account_id: 'comm-1',
      tenant_id: 'tenant-1',
      offer_type: 'MANAGED_DEFENSE',
      source_type: 'ACCEPTED_ORDER',
      source_id: 'order-1',
      status: 'ACTIVE',
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
      effective_to: new Date('2027-01-01T00:00:00.000Z'),
    });
  });

  it('should create draft invoice with calculated line items total', async () => {
    prismaMock.commercialInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );

    const invoice = await service.createDraftInvoice({
      commercialAccountId: 'comm-1',
      contractId: 'cnt-1',
      lineItems: [
        { sku: 'DEFENSE', amount: 500.0, description: 'Managed Defense' },
        {
          sku: 'ASSURANCE',
          amount: 300.0,
          description: 'Continuous Assurance',
        },
      ],
    });

    expect(invoice.total_amount).toBe(800.0);
    expect(invoice.status).toBe('DRAFT');
  });

  it('should reject re-issuing an invoice past DRAFT status', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'ISSUED',
      commercialAccount: { billing_classification: 'COMMERCIAL_DIRECT' },
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('COM-03: refuses to issue a live invoice for a non-commercial account (DEMO/SANDBOX/INTERNAL/PILOT/EVALUATION)', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      commercial_account_id: 'acct-1',
      commercialAccount: { billing_classification: 'DEMO' },
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.commercialInvoice.update).not.toHaveBeenCalled();
  });

  it('fails closed adding an invoice line with no approved tax rule (Part 10)', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    taxRuleMock.resolveTax.mockResolvedValue(null);

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'DEFENSE',
        contractId: 'cnt-1',
        orderLineId: 'order-line-1',
        servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
        servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        quantity: 1,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'SAAS',
        basisSources: [{ basisType: 'ENTITLEMENT', sourceId: 'entitlement-1' }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoiceLine.create).not.toHaveBeenCalled();
  });

  it('adds a line with tax resolved and frozen when a rule is approved', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    taxRuleMock.resolveTax.mockResolvedValue({
      ruleId: 'rule-1',
      ratePercent: 8.5,
      reverseCharge: false,
      taxAmount: 8.5,
    });
    prismaMock.commercialInvoiceLine.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'line-1', ...data }),
    );

    const line = await service.addInvoiceLine('inv-1', {
      sku: 'DEFENSE',
      contractId: 'cnt-1',
      orderLineId: 'order-line-1',
      servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      quantity: 1,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'SAAS',
      basisSources: [{ basisType: 'ENTITLEMENT', sourceId: 'entitlement-1' }],
    });

    expect(line.tax_rule_id).toBe('rule-1');
    expect(line.tax_amount).toBe(8.5);
  });

  it('allows a bundle presentation line only with complete normalized component traces', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.commercialOrderLine.findUnique.mockResolvedValue({
      ...validOrderLine,
      catalog_sku: 'SHIELD-BUNDLE',
      product: { id: 'product-1', sku: 'SHIELD-BUNDLE' },
    });
    prismaMock.commercialOrderLine.findMany.mockResolvedValue([
      {
        id: 'component-1',
        line_type: 'BUNDLE_COMPONENT',
        billable: false,
        projection_status: 'EXPANDED',
        bundle_parent_product_id: 'bundle-1',
        invoice_presentation: 'AGGREGATE_ALLOWED',
        currency: 'USD',
        order: { contract_id: 'cnt-1', status: 'PROVISIONED' },
      },
      {
        id: 'component-2',
        line_type: 'BUNDLE_COMPONENT',
        billable: false,
        projection_status: 'EXPANDED',
        bundle_parent_product_id: 'bundle-1',
        invoice_presentation: 'AGGREGATE_ALLOWED',
        currency: 'USD',
        order: { contract_id: 'cnt-1', status: 'PROVISIONED' },
      },
    ]);
    taxRuleMock.resolveTax.mockResolvedValue({
      ruleId: 'rule-1',
      taxAmount: 20,
    });
    prismaMock.commercialInvoiceLine.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'line-1', ...data }),
    );

    await service.addInvoiceLine('inv-1', {
      sku: 'SHIELD-BUNDLE',
      contractId: 'cnt-1',
      orderLineId: 'order-line-1',
      servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      quantity: 1,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'MIXED_SECURITY_SERVICE',
      presentationMode: 'AGGREGATED',
      basisSources: [{ basisType: 'ENTITLEMENT', sourceId: 'entitlement-1' }],
      traceSources: [
        { orderLineId: 'component-1', allocatedAmount: 70 },
        { orderLineId: 'component-2', allocatedAmount: 30 },
      ],
    });

    expect(prismaMock.commercialInvoiceLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          presentation_mode: 'AGGREGATED',
          traces: {
            create: [
              expect.objectContaining({
                order_line_id: 'component-1',
                allocated_amount: 70,
              }),
              expect.objectContaining({
                order_line_id: 'component-2',
                allocated_amount: 30,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects aggregated invoice presentation without component traceability', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.commercialOrderLine.findUnique.mockResolvedValue({
      ...validOrderLine,
      catalog_sku: 'SHIELD-BUNDLE',
      product: { id: 'product-1', sku: 'SHIELD-BUNDLE' },
    });

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'SHIELD-BUNDLE',
        contractId: 'cnt-1',
        orderLineId: 'order-line-1',
        servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
        servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        quantity: 1,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'MIXED_SECURITY_SERVICE',
        presentationMode: 'AGGREGATED',
        basisSources: [{ basisType: 'ENTITLEMENT', sourceId: 'entitlement-1' }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(taxRuleMock.resolveTax).not.toHaveBeenCalled();
  });

  it('blocks issuing an invoice that has a line with unresolved tax', async () => {
    const sourceSnapshot = JSON.stringify({ entitlement: 'entitlement-1' });
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      commercialAccount: { billing_classification: 'COMMERCIAL_DIRECT' },
      lines: [
        {
          id: 'line-1',
          order_line_id: 'order-line-1',
          price_book_id: 'price-book-1',
          representation_scope: 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
          tax_rule_id: null,
          bases: [
            {
              id: 'basis-1',
              source_snapshot: sourceSnapshot,
              source_snapshot_hash: createHash('sha256')
                .update(sourceSnapshot)
                .digest('hex'),
            },
          ],
        },
      ],
    });

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('freezes a BREACHED service obligation as commercial basis without treating it as a successful outcome', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.serviceObligation.findFirst.mockResolvedValue({
      id: 'obligation-1',
      contract_id: 'cnt-1',
      tenant_id: 'tenant-1',
      environment_id: 'env-1',
      obligation_key: 'monthly-review',
      obligation_type: 'SECURITY_REVIEW',
      obligation_scope: '{}',
      coverage_window: 'BUSINESS_HOURS',
      response_authority: 'R0',
      customer_dependencies: '[]',
      exclusions: '[]',
      claim_eligibility: true,
      claim_eligibility_reason: null,
      status: 'BREACHED',
      due_at: new Date('2026-08-20T00:00:00.000Z'),
      delivered_at: null,
      evidence_ref: 'sla:breach-1',
    });
    taxRuleMock.resolveTax.mockResolvedValue({
      ruleId: 'rule-1',
      taxAmount: 8.5,
    });
    prismaMock.commercialInvoiceLine.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'line-1', ...data }),
    );

    await service.addInvoiceLine('inv-1', {
      sku: 'DEFENSE',
      contractId: 'cnt-1',
      orderLineId: 'order-line-1',
      servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      quantity: 1,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'SAAS',
      basisSources: [
        { basisType: 'SERVICE_OBLIGATION', sourceId: 'obligation-1' },
      ],
    });

    expect(prismaMock.commercialInvoiceLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          representation_scope: 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
          bases: {
            create: [
              expect.objectContaining({
                basis_type: 'SERVICE_OBLIGATION',
                source_status: 'BREACHED',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('accepts only an approved checksum-valid meter snapshot whose billable quantity reconciles', async () => {
    const immutableSnapshot = JSON.stringify({ unit: 'GB_MONTH' });
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.meterBillingExport.findFirst.mockResolvedValue({
      id: 'meter-export-1',
      tenant_id: 'tenant-1',
      status: 'APPROVED',
      meter_version: 3,
      billable_quantity: 4,
      immutable_snapshot: immutableSnapshot,
      checksum: createHash('sha256').update(immutableSnapshot).digest('hex'),
    });
    taxRuleMock.resolveTax.mockResolvedValue({
      ruleId: 'rule-1',
      taxAmount: 34,
    });
    prismaMock.commercialInvoiceLine.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'line-1', ...data }),
    );

    await service.addInvoiceLine('inv-1', {
      sku: 'DEFENSE',
      contractId: 'cnt-1',
      orderLineId: 'order-line-1',
      servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      quantity: 4,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'SAAS',
      basisSources: [
        { basisType: 'METER_SNAPSHOT', sourceId: 'meter-export-1' },
      ],
    });

    expect(prismaMock.commercialInvoiceLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 4,
          bases: {
            create: [
              expect.objectContaining({
                basis_type: 'METER_SNAPSHOT',
                quantity: 4,
                unit: 'GB_MONTH',
                source_version: 'meter:3',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('freezes committed capacity as a priced contract line and never as synthetic usage', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.meterAuthorizationPolicy.findFirst.mockResolvedValue({
      id: 'commitment-1',
      commercial_account_id: 'comm-1',
      contract_id: 'cnt-1',
      tenant_id: 'tenant-1',
      environment_id: 'env-1',
      policy_key: 'committed-events',
      version: 2,
      pricing_model: 'COMMITTED_CAPACITY',
      price_book_id: 'price-book-1',
      meter_definition_id: 'meter-def-1',
      committed_quantity: 100000,
      status: 'APPROVED',
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
      effective_to: new Date('2027-01-01T00:00:00.000Z'),
      meterDefinition: { version: 4, unit: 'EVENTS_MONTH' },
    });
    taxRuleMock.resolveTax.mockResolvedValue({
      ruleId: 'rule-1',
      taxAmount: 8.5,
    });
    prismaMock.commercialInvoiceLine.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'line-1', ...data }),
    );

    await service.addInvoiceLine('inv-1', {
      sku: 'DEFENSE',
      contractId: 'cnt-1',
      orderLineId: 'order-line-1',
      servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      quantity: 1,
      unitPrice: 100,
      jurisdiction: 'US-CA',
      productTaxClass: 'SAAS',
      basisSources: [
        { basisType: 'CONTRACT_COMMITMENT', sourceId: 'commitment-1' },
      ],
    });

    const basis =
      prismaMock.commercialInvoiceLine.create.mock.calls[0][0].data.bases
        .create[0];
    expect(basis).toEqual(
      expect.objectContaining({
        basis_type: 'CONTRACT_COMMITMENT',
        meter_authorization_policy_id: 'commitment-1',
        quantity: 100000,
        unit: 'EVENTS_MONTH',
      }),
    );
    expect(JSON.parse(basis.source_snapshot)).toEqual(
      expect.objectContaining({
        chargeSource: 'CONTRACT_LINE_ITEM',
        syntheticUsage: false,
      }),
    );
  });

  it('rejects a meter snapshot whose immutable checksum was tampered', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      currency: 'USD',
      contract_id: 'cnt-1',
      commercial_account_id: 'comm-1',
    });
    prismaMock.meterBillingExport.findFirst.mockResolvedValue({
      id: 'meter-export-1',
      tenant_id: 'tenant-1',
      status: 'APPROVED',
      meter_version: 3,
      billable_quantity: 4,
      immutable_snapshot: '{"unit":"GB_MONTH"}',
      checksum: 'tampered',
    });

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'DEFENSE',
        contractId: 'cnt-1',
        orderLineId: 'order-line-1',
        servicePeriodStart: new Date('2026-08-01T00:00:00.000Z'),
        servicePeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        quantity: 4,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'SAAS',
        basisSources: [
          { basisType: 'METER_SNAPSHOT', sourceId: 'meter-export-1' },
        ],
      }),
    ).rejects.toThrow(ConflictException);
    expect(taxRuleMock.resolveTax).not.toHaveBeenCalled();
  });

  it('issues a fully based invoice with a frozen representation that explicitly is not outcome proof', async () => {
    const sourceSnapshot = JSON.stringify({ status: 'ACTIVE' });
    const sourceSnapshotHash = createHash('sha256')
      .update(sourceSnapshot)
      .digest('hex');
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
      commercial_account_id: 'comm-1',
      contract_id: 'cnt-1',
      currency: 'USD',
      commercialAccount: { billing_classification: 'COMMERCIAL_DIRECT' },
      lines: [
        {
          id: 'line-1',
          order_line_id: 'order-line-1',
          price_book_id: 'price-book-1',
          sku: 'DEFENSE',
          contract_id: 'cnt-1',
          subscription_id: null,
          service_period_start: new Date('2026-08-01T00:00:00.000Z'),
          service_period_end: new Date('2026-09-01T00:00:00.000Z'),
          quantity: 1,
          unit_price: 100,
          discount_percent: 0,
          tax_amount: 8.5,
          tax_rule_id: 'rule-1',
          currency: 'USD',
          presentation_mode: 'SEPARATE',
          representation_scope: 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
          traces: [],
          bases: [
            {
              id: 'basis-1',
              basis_type: 'ENTITLEMENT',
              source_id: 'entitlement-1',
              source_status: 'ACTIVE',
              source_version: 'v1',
              quantity: 1,
              unit: 'ENTITLEMENT',
              source_snapshot: sourceSnapshot,
              source_snapshot_hash: sourceSnapshotHash,
            },
          ],
        },
      ],
    });
    prismaMock.commercialInvoice.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );

    const issued = await service.issueInvoice('inv-1');
    const frozen = JSON.parse(issued.immutable_snapshot);

    expect(issued.status).toBe('ISSUED');
    expect(issued.total_amount).toBe(108.5);
    expect(frozen.securityOutcomeProof).toBe(false);
    expect(frozen.serviceExceptionRemedy).toBe('APPEND_ONLY_CREDIT_NOTE');
    expect(frozen.lines[0].bases[0].sourceSnapshotHash).toBe(
      sourceSnapshotHash,
    );
  });

  it('never mutates an issued invoice — corrections go through append-only credit notes', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'ISSUED',
      currency: 'USD',
    });
    prismaMock.commercialCreditNote.create.mockResolvedValue({
      id: 'cn-1',
      status: 'ISSUED',
      amount: 50,
    });

    const note = await service.issueCreditNote(
      'inv-1',
      50,
      'billing correction',
    );

    expect(note.id).toBe('cn-1');
    expect(prismaMock.commercialInvoice.update).not.toHaveBeenCalled();
  });

  it('rejects issuing a credit note against a non-ISSUED invoice', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      status: 'DRAFT',
    });

    await expect(service.issueCreditNote('inv-1', 50, 'x')).rejects.toThrow(
      ConflictException,
    );
  });

  it('OPS-01: refuses to finalize an invoice while the kill switch blocks INVOICE_FINALIZATION', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(
      new ConflictException('blocked'),
    );

    await expect(service.issueInvoice('inv-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.commercialInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('OPS-01: refuses to add an invoice line while the kill switch blocks USAGE_BILLING_EXPORT', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(
      new ConflictException('blocked'),
    );

    await expect(
      service.addInvoiceLine('inv-1', {
        sku: 'DEFENSE',
        contractId: 'cnt-1',
        orderLineId: 'order-line-1',
        servicePeriodStart: new Date(),
        servicePeriodEnd: new Date(),
        quantity: 1,
        unitPrice: 100,
        jurisdiction: 'US-CA',
        productTaxClass: 'SAAS',
        basisSources: [{ basisType: 'ENTITLEMENT', sourceId: 'entitlement-1' }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoiceLine.create).not.toHaveBeenCalled();
  });
});
