import { Test, TestingModule } from '@nestjs/testing';
import { ServiceCreditLedgerService } from './service-credit-ledger.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ServiceCreditLedgerService (ZS-COM-BILL-001 §9 E3 & SVC-02 SLA Credit Deductions)', () => {
  let service: ServiceCreditLedgerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceCreditLedgerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ServiceCreditLedgerService>(ServiceCreditLedgerService);
  });

  it('registers approved service credit linked to SLA breach claim and evidence hash', () => {
    const credit = service.registerApprovedCredit({
      tenantId: 'tenant-sla-01',
      slaBreachClaimId: 'claim-breach-101',
      evidenceRecordHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      creditAmount: 250.0,
      currency: 'USD',
      reason: 'SOC Triage SLA Breached: Critical response took 45m (Target: 15m)',
    });

    expect(credit.creditId).toBeDefined();
    expect(credit.status).toBe('PENDING_APPLICATION');
    expect(credit.creditAmount).toBe(250.0);
    expect(credit.evidenceRecordHash).toBeDefined();
  });

  it('enforces 30% MRC contractual credit cap when applying credits to an invoice (§9 E3)', () => {
    // Register 2 credits of $300 each (Total = $600)
    service.registerApprovedCredit({
      tenantId: 'tenant-sla-02',
      slaBreachClaimId: 'claim-1',
      evidenceRecordHash: 'hash-1',
      creditAmount: 300.0,
      currency: 'USD',
      reason: 'Breach 1',
    });
    service.registerApprovedCredit({
      tenantId: 'tenant-sla-02',
      slaBreachClaimId: 'claim-2',
      evidenceRecordHash: 'hash-2',
      creditAmount: 300.0,
      currency: 'USD',
      reason: 'Breach 2',
    });

    // Base MRC = $1000. 30% cap means max allowable deduction is $300.00
    const deduction = service.applyCreditsToInvoice({
      tenantId: 'tenant-sla-02',
      invoiceId: 'inv-2026-09-001',
      baseMonthlyRecurringCharge: 1000.0,
    });

    expect(deduction.maxAllowableCreditCap).toBe(300.0);
    expect(deduction.totalDeductedAmount).toBe(300.0); // Capped at $300, not $600
    expect(deduction.appliedCreditIds.length).toBe(1);
  });

  it('prevents double-deduction by updating credit status to APPLIED_TO_INVOICE', () => {
    service.registerApprovedCredit({
      tenantId: 'tenant-sla-03',
      slaBreachClaimId: 'claim-3',
      evidenceRecordHash: 'hash-3',
      creditAmount: 150.0,
      currency: 'USD',
      reason: 'Breach 3',
    });

    // 1st invoice application
    const deduction1 = service.applyCreditsToInvoice({
      tenantId: 'tenant-sla-03',
      invoiceId: 'inv-01',
      baseMonthlyRecurringCharge: 1000.0,
    });
    expect(deduction1.totalDeductedAmount).toBe(150.0);

    // 2nd invoice application: No remaining pending credits
    const deduction2 = service.applyCreditsToInvoice({
      tenantId: 'tenant-sla-03',
      invoiceId: 'inv-02',
      baseMonthlyRecurringCharge: 1000.0,
    });
    expect(deduction2.totalDeductedAmount).toBe(0);
  });
});
