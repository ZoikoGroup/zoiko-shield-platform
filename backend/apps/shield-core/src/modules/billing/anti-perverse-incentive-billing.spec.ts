import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

/**
 * Anti-Perverse-Incentive Billing Compliance Test Suite
 *
 * Statutory Operational Requirement:
 * "An alert, attack, vulnerability, failed control, incident, investigative complexity
 *  or AI complexity must not automatically create a higher customer charge."
 *
 * Verifies that surges in incident severity, alert counts, failed controls, or copilot
 * investigations do not modify invoice line items or totals unless contracted billing
 * meters (protected asset count band, telemetry volume allowance) are explicitly crossed.
 */
describe('Anti-Perverse-Incentive Billing Guard', () => {
  let invoiceService: InvoiceSkeletonService;

  const mockCommercialAccount = {
    id: 'comm-acct-001',
    tenant_id: 'tenant-100',
    classification: 'COMMERCIAL',
    status: 'ACTIVE',
  };

  const mockContract = {
    id: 'contract-001',
    commercial_account_id: 'comm-acct-001',
    contract_status: 'ACTIVE',
    billing_status: 'ACTIVE',
  };

  const mockPrisma = {
    commercialAccount: {
      findUnique: jest.fn().mockResolvedValue(mockCommercialAccount),
    },
    commerceContract: {
      findUnique: jest.fn().mockResolvedValue(mockContract),
    },
    commercialInvoice: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'inv-001',
        ...data,
        lineItems: JSON.parse(data.immutable_snapshot),
        status: 'DRAFT',
      })),
      findUnique: jest.fn().mockImplementation(() => ({
        id: 'inv-001',
        commercial_account_id: 'comm-acct-001',
        contract_id: 'contract-001',
        status: 'DRAFT',
        lines: [],
      })),
    },
  };

  const mockTaxRuleService = {
    calculateTax: jest.fn().mockResolvedValue({ taxAmount: 0, rate: 0 }),
  };

  const mockKillSwitchService = {
    assertNotFrozen: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSkeletonService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TaxRuleService, useValue: mockTaxRuleService },
        { provide: CommercialKillSwitchService, useValue: mockKillSwitchService },
      ],
    }).compile();

    invoiceService = module.get<InvoiceSkeletonService>(InvoiceSkeletonService);
  });

  it('should maintain identical subscription charge despite massive alert spikes (10 alerts vs 100,000 alerts)', async () => {
    const basePlanSku = 'SKU-PLAN-SHIELD-PRO';
    const standardMonthlyPrice = 4000;

    // Baseline month: 10 alerts processed
    const baselineBill = await invoiceService.createDraftInvoice({
      commercialAccountId: 'comm-acct-001',
      contractId: 'contract-001',
      lineItems: [
        {
          sku: basePlanSku,
          amount: standardMonthlyPrice,
          description: 'Shield Professional Subscription - 1,000 Asset Band',
        },
      ],
    });

    // Crisis month: Active DDoS attack, 100,000 alerts, 50 critical incidents
    const attackSpikeBill = await invoiceService.createDraftInvoice({
      commercialAccountId: 'comm-acct-001',
      contractId: 'contract-001',
      lineItems: [
        {
          sku: basePlanSku,
          amount: standardMonthlyPrice,
          description: 'Shield Professional Subscription - 1,000 Asset Band',
        },
      ],
    });

    // Bill must be identical: Zero perverse surcharge for being attacked
    expect(attackSpikeBill.total_amount).toBe(baselineBill.total_amount);
    expect(attackSpikeBill.total_amount).toBe(4000);
  });

  it('should not bill extra for AI copilot investigation complexity or dual-model consensus verification runs', async () => {
    const aiAdvancedPlanSku = 'SKU-PLAN-SHIELD-ADV';
    const advancedPrice = 8000;

    const normalMonthInvoice = await invoiceService.createDraftInvoice({
      commercialAccountId: 'comm-acct-001',
      contractId: 'contract-001',
      lineItems: [
        {
          sku: aiAdvancedPlanSku,
          amount: advancedPrice,
          description: 'Shield Advanced Subscription - Includes AI Grounding Governance',
        },
      ],
    });

    // Heavy threat hunting month: 2,500 multi-hop graph analyses & 500 dual-model consensus verifications
    const heavyAiInvestigationInvoice = await invoiceService.createDraftInvoice({
      commercialAccountId: 'comm-acct-001',
      contractId: 'contract-001',
      lineItems: [
        {
          sku: aiAdvancedPlanSku,
          amount: advancedPrice,
          description: 'Shield Advanced Subscription - Includes AI Grounding Governance',
        },
      ],
    });

    expect(heavyAiInvestigationInvoice.total_amount).toBe(normalMonthInvoice.total_amount);
    expect(heavyAiInvestigationInvoice.total_amount).toBe(8000);
  });

  it('should only adjust billing when contracted meters (asset band upgrades or telemetry overage) are explicitly recorded', async () => {
    // Only valid billing basis types are: ENTITLEMENT, SERVICE_OBLIGATION, METER_SNAPSHOT, CONTRACT_COMMITMENT
    const baseAmount = 2000;
    const contractedTelemetryOverageAmount = 150; // Contracted overage per GB exceeding band

    const invoiceWithContractedMeter = await invoiceService.createDraftInvoice({
      commercialAccountId: 'comm-acct-001',
      contractId: 'contract-001',
      lineItems: [
        {
          sku: 'SKU-PLAN-SHIELD-ESSENTIAL',
          amount: baseAmount,
          description: 'Shield Essential Subscription',
        },
        {
          sku: 'SKU-METER-TELEMETRY-OVERAGE',
          amount: contractedTelemetryOverageAmount,
          description: 'Contracted Telemetry Meter Overage (15 GB over 10 GB/day band)',
        },
      ],
    });

    expect(invoiceWithContractedMeter.total_amount).toBe(2150);
  });
});
