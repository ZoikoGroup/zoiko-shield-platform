import { Test, TestingModule } from '@nestjs/testing';
import { IncidentWorkOrderService } from './incident-work-order.service';
import { IncidentResponseRetainerService } from './incident-response-retainer.service';
import { ServiceCreditLedgerService } from '../sla/service-credit-ledger.service';
import { SocSlaClockService } from '../sla/soc-sla-clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

describe('IR Retainer & Work Order Rule SVC-01 SLA Accounting', () => {
  let workOrderService: IncidentWorkOrderService;
  let retainerService: IncidentResponseRetainerService;
  let creditLedger: ServiceCreditLedgerService;
  let prismaMock: any;
  let approvalsMock: any;

  const mockRetainer = {
    id: 'ret-101',
    tenant_id: 'tenant-sla-001',
    environment_id: 'prod',
    retainer_key: 'annual-ir-premium',
    status: 'ACTIVE',
    maximum_response_authority: 'R2',
    included_hours: 50,
    overage_rate: 350,
    warning_threshold_percent: 80,
    response_window: JSON.stringify({
      coverage: '24X7',
      acknowledgementTargetMinutes: 15,
      activationResponseMinutes: 60,
    }),
  };

  const createMockWorkOrder = (overrides?: Partial<any>) => ({
    id: 'wo-201',
    tenant_id: 'tenant-sla-001',
    environment_id: 'prod',
    retainer_id: mockRetainer.id,
    retainer: mockRetainer,
    incident_reference: 'INC-2026-9901',
    activation_reason: 'Ransomware Triage',
    activation_reference: 'hotline-call-42',
    response_authority: 'R2',
    status: 'ACTIVE',
    started_at: new Date('2026-09-23T00:00:00.000Z'),
    activated_at: new Date('2026-09-23T00:00:00.000Z'),
    closed_at: null,
    response_window: mockRetainer.response_window,
    included_hours: 50,
    consumed_hours: 2,
    overage_hours: 0,
    forecast_hours: 2,
    evidence_refs: '[]',
    third_party_costs: 0,
    ...overrides,
  });

  beforeEach(async () => {
    prismaMock = {
      incidentResponseRetainer: {
        findFirst: jest.fn().mockResolvedValue(mockRetainer),
      },
      incidentWorkOrder: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(createMockWorkOrder())),
      },
      $transaction: jest.fn((cb: any) => cb(prismaMock)),
    };

    approvalsMock = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentWorkOrderService,
        IncidentResponseRetainerService,
        ServiceCreditLedgerService,
        SocSlaClockService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalsMock },
      ],
    }).compile();

    workOrderService = module.get<IncidentWorkOrderService>(IncidentWorkOrderService);
    retainerService = module.get<IncidentResponseRetainerService>(IncidentResponseRetainerService);
    creditLedger = module.get<ServiceCreditLedgerService>(ServiceCreditLedgerService);
  });

  describe('Retainer SLA Window Policy (Rule SVC-01)', () => {
    it('extracts contracted 24/7 SLA response parameters and targets', async () => {
      const policy = await retainerService.getRetainerSlaWindowPolicy(
        mockRetainer.id,
        'tenant-sla-001',
        'prod',
      );

      expect(policy.retainerId).toBe(mockRetainer.id);
      expect(policy.coverage).toBe('24X7');
      expect(policy.acknowledgementTargetMinutes).toBe(15);
      expect(policy.activationResponseMinutes).toBe(60);
      expect(policy.overageRate).toBe(350);
      expect(policy.ruleCode).toBe('SVC-01');
    });
  });

  describe('Work Order SLA Clock & Active Countdown Evaluation', () => {
    it('evaluates active work order within target as IN_PROGRESS and not breached', async () => {
      // 10 minutes elapsed (started at 00:00, evaluating at 00:10)
      const asOf = new Date('2026-09-23T00:10:00.000Z');
      const sla = await workOrderService.evaluateSlaStatus(
        'wo-201',
        'tenant-sla-001',
        'prod',
        asOf,
      );

      expect(sla.elapsedMinutes).toBe(10);
      expect(sla.acknowledgementTargetMinutes).toBe(15);
      expect(sla.remainingAcknowledgementMinutes).toBe(5);
      expect(sla.isAcknowledgementBreached).toBe(false);
      expect(sla.isBreached).toBe(false);
      expect(sla.slaStatus).toBe('IN_PROGRESS');
    });

    it('evaluates active work order exceeding target as BREACHED with 0 remaining minutes', async () => {
      // 35 minutes elapsed (started at 00:00, evaluating at 00:35)
      const asOf = new Date('2026-09-23T00:35:00.000Z');
      const sla = await workOrderService.evaluateSlaStatus(
        'wo-201',
        'tenant-sla-001',
        'prod',
        asOf,
      );

      expect(sla.elapsedMinutes).toBe(35);
      expect(sla.acknowledgementTargetMinutes).toBe(15);
      expect(sla.remainingAcknowledgementMinutes).toBe(0);
      expect(sla.isAcknowledgementBreached).toBe(true);
      expect(sla.isBreached).toBe(true);
      expect(sla.slaStatus).toBe('BREACHED');
    });

    it('evaluates closed work order within target as MET', async () => {
      prismaMock.incidentWorkOrder.findFirst.mockResolvedValue(
        createMockWorkOrder({
          status: 'CLOSED',
          closed_at: new Date('2026-09-23T00:12:00.000Z'),
        }),
      );

      const sla = await workOrderService.evaluateSlaStatus(
        'wo-201',
        'tenant-sla-001',
        'prod',
      );

      expect(sla.elapsedMinutes).toBe(12);
      expect(sla.isBreached).toBe(false);
      expect(sla.slaStatus).toBe('MET');
    });

    it('evaluates closed work order exceeding target as BREACHED', async () => {
      prismaMock.incidentWorkOrder.findFirst.mockResolvedValue(
        createMockWorkOrder({
          status: 'CLOSED',
          closed_at: new Date('2026-09-23T00:45:00.000Z'),
        }),
      );

      const sla = await workOrderService.evaluateSlaStatus(
        'wo-201',
        'tenant-sla-001',
        'prod',
      );

      expect(sla.elapsedMinutes).toBe(45);
      expect(sla.isBreached).toBe(true);
      expect(sla.slaStatus).toBe('BREACHED');
    });
  });

  describe('Automated SLA Breach Credit Settlement & Ledger Accounting (Rule SVC-01 / SVC-02)', () => {
    it('returns settled: false when no SLA target is breached', async () => {
      // 8 minutes elapsed (< 15 mins)
      const asOf = new Date('2026-09-23T00:08:00.000Z');
      jest.spyOn(workOrderService, 'evaluateSlaStatus').mockResolvedValueOnce({
        workOrderId: 'wo-201',
        incidentReference: 'INC-2026-9901',
        tenantId: 'tenant-sla-001',
        coverageTier: '24X7',
        startedAt: new Date('2026-09-23T00:00:00.000Z'),
        closedAt: null,
        asOf,
        elapsedMinutes: 8,
        acknowledgementTargetMinutes: 15,
        activationResponseMinutes: 60,
        remainingAcknowledgementMinutes: 7,
        remainingActivationMinutes: 52,
        isAcknowledgementBreached: false,
        isActivationBreached: false,
        isBreached: false,
        slaStatus: 'IN_PROGRESS',
        ruleCode: 'SVC-01',
      });

      const res = await workOrderService.settleSlaBreachCredit(
        'wo-201',
        'tenant-sla-001',
        'prod',
      );

      expect(res.settled).toBe(false);
      expect(res.reason).toContain('not breached');
    });

    it('automatically calculates and journals service credit into ServiceCreditLedger on breach', async () => {
      // 40 minutes elapsed (> 2x of 15m target -> severe breach 1.5x overageRate)
      jest.spyOn(workOrderService, 'evaluateSlaStatus').mockResolvedValueOnce({
        workOrderId: 'wo-201',
        incidentReference: 'INC-2026-9901',
        tenantId: 'tenant-sla-001',
        coverageTier: '24X7',
        startedAt: new Date('2026-09-23T00:00:00.000Z'),
        closedAt: null,
        asOf: new Date('2026-09-23T00:40:00.000Z'),
        elapsedMinutes: 40,
        acknowledgementTargetMinutes: 15,
        activationResponseMinutes: 60,
        remainingAcknowledgementMinutes: 0,
        remainingActivationMinutes: 20,
        isAcknowledgementBreached: true,
        isActivationBreached: false,
        isBreached: true,
        slaStatus: 'BREACHED',
        ruleCode: 'SVC-01',
      });

      const res = await workOrderService.settleSlaBreachCredit(
        'wo-201',
        'tenant-sla-001',
        'prod',
      );

      expect(res.settled).toBe(true);
      // Overagerate is 350, severe breach multiplier = 1.5 -> 525
      expect(res.creditAmount).toBe(525);
      expect(res.evidenceRecordHash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.registeredCredit).toBeDefined();
      expect(res.registeredCredit.creditId).toBeDefined();
      expect(res.registeredCredit.status).toBe('PENDING_APPLICATION');

      // Verify pending credits in credit ledger
      const pending = creditLedger.getPendingCredits('tenant-sla-001');
      expect(pending.length).toBe(1);
      expect(pending[0].creditAmount).toBe(525);

      // Verify applying credit to invoice respects 30% MRC cap (§9 E3)
      const deduction = creditLedger.applyCreditsToInvoice({
        tenantId: 'tenant-sla-001',
        invoiceId: 'inv-oct-2026',
        baseMonthlyRecurringCharge: 2000, // 30% cap = 600 max
      });

      expect(deduction.maxAllowableCreditCap).toBe(600);
      expect(deduction.totalDeductedAmount).toBe(525);
      expect(deduction.appliedCreditIds).toContain(res.registeredCredit.creditId);
    });
  });
});
