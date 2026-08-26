import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService Category B4-B5 controls', () => {
  let service: SubscriptionService;
  let prisma: any;
  let approvals: any;

  const subscription = {
    id: 'sub-1',
    order_id: 'order-1',
    commercial_account_id: 'account-1',
    contract_id: 'contract-1',
    status: 'ACTIVE',
    effective_from: new Date(Date.now() - 86_400_000),
    effective_to: new Date(Date.now() + 86_400_000),
    amendments: [],
  };

  const upgrade = {
    id: 'amendment-1',
    subscription_id: 'sub-1',
    subscription,
    amendment_type: 'UPGRADE',
    status: 'APPROVED',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    approval_id: 'approval-1',
    effective_at: new Date(Date.now() - 1_000),
    proposed_snapshot: JSON.stringify({ offerTypes: ['AI_SECURITY'] }),
    remediation_plan: '{}',
    claim_eligibility: false,
    deployment_ready: false,
    service_capacity_ready: false,
    activatedEntitlements: [],
  };

  beforeEach(async () => {
    prisma = {
      commercialSubscription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialOrderLine: { findMany: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      commercialAmendment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialApproval: { update: jest.fn() },
      commercialEvent: { create: jest.fn() },
      entitlement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      case: { findMany: jest.fn() },
      incidentWorkOrder: { findMany: jest.fn() },
      legalHold: { findMany: jest.fn() },
      evidenceRecord: { count: jest.fn(), findMany: jest.fn() },
      auditPackage: { findMany: jest.fn() },
      evidenceRetentionTransition: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      connectorInstance: { findMany: jest.fn(), updateMany: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
      getApprovalById: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
      ],
    }).compile();
    service = module.get(SubscriptionService);
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.evidenceRecord.findMany.mockResolvedValue([]);
    prisma.auditPackage.findMany.mockResolvedValue([]);
    prisma.evidenceRetentionTransition.upsert.mockResolvedValue({
      id: 'retention-transition-1',
    });
  });

  it('activates frozen bundle entitlements atomically with the subscription', async () => {
    prisma.commercialSubscription.findUnique.mockResolvedValue({
      ...subscription,
      status: 'PENDING',
    });
    prisma.commercialOrderLine.findMany.mockResolvedValue([
      { id: 'component-line-1' },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      {
        id: 'entitlement-1',
        tenant_id: 'tenant-1',
        offer_type: 'MANAGED_DEFENSE',
      },
    ]);
    prisma.entitlement.findFirst.mockResolvedValue(null);
    prisma.commercialSubscription.update.mockResolvedValue({
      ...subscription,
      status: 'ACTIVE',
    });

    await service.activateSubscription('sub-1');

    expect(prisma.entitlement.updateMany).toHaveBeenCalledWith({
      where: {
        source_type: 'BUNDLE_COMPONENT',
        source_id: { in: ['component-line-1'] },
        status: 'PENDING_ACTIVATION',
      },
      data: { status: 'ACTIVE' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates an upgrade as a pending approved commercial preview, not an entitlement', async () => {
    prisma.commercialSubscription.findUnique.mockResolvedValue(subscription);
    prisma.commercialAmendment.create.mockResolvedValue({
      id: 'amendment-1',
      status: 'PENDING_APPROVAL',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.commercialAmendment.update.mockResolvedValue({
      id: 'amendment-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
    });

    const result = await service.requestUpgrade(
      'sub-1',
      'tenant-1',
      'env-1',
      'maker-1',
      {
        offerTypes: ['AI_SECURITY'],
        commercialPreview: { monthlyDelta: 100 },
        commercialReason: 'Add AI security module',
      },
    );

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: 'CommercialAmendment',
        requestedBy: 'maker-1',
        requiredApprovalRole: 'COMMERCIAL_APPROVER',
      }),
      prisma,
    );
    expect(prisma.entitlement.createMany).not.toHaveBeenCalled();
  });

  it('keeps an approved upgrade pending until every readiness gate passes', async () => {
    prisma.commercialAmendment.findUnique.mockResolvedValue(upgrade);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...upgrade,
      status: 'APPROVED',
    });

    await service.verifyUpgradeReadiness('amendment-1', 'ops-1', {
      claimEligibility: true,
      deploymentReady: true,
      serviceCapacityReady: false,
      claimEvidenceRef: 'claim-check-1',
      deploymentEvidenceRef: 'deploy-check-1',
      capacityEvidenceRef: 'capacity-check-1',
    });
    expect(prisma.commercialAmendment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('moves an approved upgrade to PENDING_ACTIVATION only when all gates pass', async () => {
    prisma.commercialAmendment.findUnique.mockResolvedValue(upgrade);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...upgrade,
      status: 'PENDING_ACTIVATION',
    });

    await service.verifyUpgradeReadiness('amendment-1', 'ops-1', {
      claimEligibility: true,
      deploymentReady: true,
      serviceCapacityReady: true,
      claimEvidenceRef: 'claim-check-1',
      deploymentEvidenceRef: 'deploy-check-1',
      capacityEvidenceRef: 'capacity-check-1',
    });
    expect(prisma.commercialAmendment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_ACTIVATION' }),
      }),
    );
  });

  it('activates upgraded runtime scope only after approval and readiness', async () => {
    const readyUpgrade = {
      ...upgrade,
      status: 'PENDING_ACTIVATION',
      claim_eligibility: true,
      deployment_ready: true,
      service_capacity_ready: true,
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(readyUpgrade);
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'CommercialAmendment',
      object_id: 'amendment-1',
    });
    prisma.entitlement.findFirst.mockResolvedValue(null);
    prisma.commercialAmendment.update.mockResolvedValue({
      id: 'amendment-1',
      status: 'APPLIED',
    });

    await service.applyAmendment('amendment-1', 'ops-1');

    expect(prisma.entitlement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          offer_type: 'AI_SECURITY',
          source_type: 'SUBSCRIPTION_UPGRADE',
          activation_amendment_id: 'amendment-1',
        }),
      ],
    });
  });

  it('places a downgrade into remediation when an active incident or legal hold exists', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'APPROVED',
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: ['MANAGED_DEFENSE'],
        connectorIdsToDisable: [],
      }),
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);
    prisma.case.findMany.mockResolvedValue([
      { id: 'case-1', status: 'INVESTIGATING' },
    ]);
    prisma.incidentWorkOrder.findMany.mockResolvedValue([{ id: 'ir-1' }]);
    prisma.legalHold.findMany.mockResolvedValue([{ id: 'hold-1' }]);
    prisma.evidenceRecord.count.mockResolvedValue(10);
    prisma.entitlement.findMany.mockResolvedValue([
      { offer_type: 'MANAGED_DEFENSE' },
    ]);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...downgrade,
      status: 'REMEDIATION_REQUIRED',
    });

    const result = await service.assessDowngrade('amendment-1');
    expect(result.status).toBe('REMEDIATION_REQUIRED');
    expect(prisma.commercialAmendment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REMEDIATION_REQUIRED',
          remediation_status: 'REQUIRED',
        }),
      }),
    );
  });

  it('never applies a downgrade while safety assessment still requires remediation', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'SCHEDULED',
      remediation_plan: JSON.stringify({ preserveHistoricalEvidence: true }),
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: ['MANAGED_DEFENSE'],
        connectorIdsToDisable: [],
      }),
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'CommercialAmendment',
      object_id: 'amendment-1',
    });
    prisma.case.findMany.mockResolvedValue([
      { id: 'case-1', status: 'INVESTIGATING' },
    ]);
    prisma.incidentWorkOrder.findMany.mockResolvedValue([]);
    prisma.legalHold.findMany.mockResolvedValue([]);
    prisma.evidenceRecord.count.mockResolvedValue(2);
    prisma.entitlement.findMany.mockResolvedValue([
      { offer_type: 'MANAGED_DEFENSE' },
    ]);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...downgrade,
      status: 'REMEDIATION_REQUIRED',
    });

    await expect(
      service.applyAmendment('amendment-1', 'ops-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.entitlement.updateMany).not.toHaveBeenCalled();
  });

  it('makes retention reduction prospective while snapshotting legal-hold and audit-cycle preservation', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'APPROVED',
      effective_at: new Date(Date.now() + 86_400_000),
      remediation_plan: JSON.stringify({
        preserveHistoricalEvidence: true,
        evidenceRefs: ['retention-review-1'],
        recordedBy: 'records-owner-1',
      }),
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: [],
        connectorIdsToDisable: [],
        targetRetentionProfile: 'standard-365d',
      }),
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);
    prisma.case.findMany.mockResolvedValue([]);
    prisma.incidentWorkOrder.findMany.mockResolvedValue([]);
    prisma.legalHold.findMany.mockResolvedValue([{ id: 'hold-1' }]);
    prisma.evidenceRecord.count.mockResolvedValue(12);
    prisma.evidenceRecord.findMany.mockResolvedValue([
      { retention_profile: 'legal-7y' },
    ]);
    prisma.auditPackage.findMany.mockResolvedValue([
      {
        id: 'package-1',
        status: 'FROZEN',
        audit_cycle_reference: 'FY2026',
        retention_until: new Date('2033-01-01T00:00:00Z'),
      },
    ]);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...downgrade,
      status: 'SCHEDULED',
    });

    const result = await service.assessDowngrade('amendment-1');

    expect(result.status).toBe('SCHEDULED');
    expect(prisma.evidenceRetentionTransition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'VERIFIED',
          historical_evidence_count: 12,
          preserve_historical_evidence: true,
          legal_hold_ids: '["hold-1"]',
          audit_package_ids: '["package-1"]',
        }),
      }),
    );
  });

  it('applies a safe due downgrade prospectively without deleting evidence', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'SCHEDULED',
      remediation_plan: JSON.stringify({ preserveHistoricalEvidence: true }),
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: ['MANAGED_DEFENSE'],
        connectorIdsToDisable: ['77f5524b-138c-455a-ae65-4b978fd94a53'],
      }),
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'CommercialAmendment',
      object_id: 'amendment-1',
    });
    prisma.case.findMany.mockResolvedValue([]);
    prisma.incidentWorkOrder.findMany.mockResolvedValue([]);
    prisma.legalHold.findMany.mockResolvedValue([]);
    prisma.evidenceRecord.count.mockResolvedValue(8);
    prisma.connectorInstance.findMany.mockResolvedValue([
      { id: '77f5524b-138c-455a-ae65-4b978fd94a53' },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      { offer_type: 'MANAGED_DEFENSE' },
    ]);
    prisma.commercialAmendment.update
      .mockResolvedValueOnce({ ...downgrade, status: 'SCHEDULED' })
      .mockResolvedValueOnce({ ...downgrade, status: 'APPLIED' });

    await service.applyAmendment('amendment-1', 'ops-1');

    expect(prisma.entitlement.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        offer_type: { in: ['MANAGED_DEFENSE'] },
        status: 'ACTIVE',
      }),
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
    expect(prisma.connectorInstance.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['77f5524b-138c-455a-ae65-4b978fd94a53'] },
      }),
      data: { state: 'DISCONNECTED' },
    });
    expect(prisma.evidenceRetentionTransition.update).not.toHaveBeenCalled();
    expect((prisma.evidenceRecord as any).deleteMany).toBeUndefined();
  });

  it('createSubscription writes through a provided transaction', async () => {
    const tx = {
      commercialSubscription: {
        create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      },
    };
    await service.createSubscription(
      { orderId: 'o-1', commercialAccountId: 'acct-1', contractId: 'c-1' },
      tx as any,
    );
    expect(tx.commercialSubscription.create).toHaveBeenCalled();
    expect(prisma.commercialSubscription.create).not.toHaveBeenCalled();
  });

  // ── B4: explicit scheduleAmendment gate ───────────────────────────────────

  it('blocks downgrade scheduling when preservation has not been recorded', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'APPROVED',
      remediation_plan: '{}', // preserveHistoricalEvidence absent
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: ['MANAGED_DEFENSE'],
        connectorIdsToDisable: [],
      }),
    };
    prisma.commercialSubscription.findUnique.mockResolvedValue(subscription);
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);

    await expect(
      service.scheduleAmendment(
        'amendment-1',
        'tenant-1',
        'env-1',
        'ops-1',
        new Date(Date.now() + 3_600_000),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.commercialAmendment.update).not.toHaveBeenCalled();
  });

  it('blocks upgrade scheduling until all three readiness gates pass', async () => {
    const incompleteUpgrade = {
      ...upgrade,
      status: 'APPROVED',
      claim_eligibility: true,
      deployment_ready: false, // not ready
      service_capacity_ready: true,
    };
    prisma.commercialSubscription.findUnique.mockResolvedValue(subscription);
    prisma.commercialAmendment.findUnique.mockResolvedValue(incompleteUpgrade);

    await expect(
      service.scheduleAmendment(
        'amendment-1',
        'tenant-1',
        'env-1',
        'ops-1',
        new Date(Date.now() + 3_600_000),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('schedules a downgrade when remediation preservation is recorded', async () => {
    const remediatedDowngrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
      status: 'APPROVED',
      remediation_plan: JSON.stringify({ preserveHistoricalEvidence: true }),
      proposed_snapshot: JSON.stringify({
        offerTypesToRemove: ['MANAGED_DEFENSE'],
        connectorIdsToDisable: [],
      }),
    };
    prisma.commercialSubscription.findUnique.mockResolvedValue(subscription);
    prisma.commercialAmendment.findUnique.mockResolvedValue(remediatedDowngrade);
    prisma.commercialAmendment.update.mockResolvedValue({
      ...remediatedDowngrade,
      status: 'SCHEDULED',
    });

    const result = await service.scheduleAmendment(
      'amendment-1',
      'tenant-1',
      'env-1',
      'ops-1',
      new Date(Date.now() + 3_600_000),
    );

    expect(result.status).toBe('SCHEDULED');
    expect(prisma.commercialAmendment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SCHEDULED' }),
      }),
    );
  });

  it('rejects readiness verification for non-UPGRADE amendments', async () => {
    const downgrade = {
      ...upgrade,
      amendment_type: 'DOWNGRADE',
    };
    prisma.commercialAmendment.findUnique.mockResolvedValue(downgrade);

    await expect(
      service.verifyUpgradeReadiness('amendment-1', 'ops-1', {
        claimEligibility: true,
        deploymentReady: true,
        serviceCapacityReady: true,
        claimEvidenceRef: 'c1',
        deploymentEvidenceRef: 'd1',
        capacityEvidenceRef: 'cap1',
      }),
    ).rejects.toThrow('UPGRADE amendments');
  });
});
