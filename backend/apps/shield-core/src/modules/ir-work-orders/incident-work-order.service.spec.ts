import { ConflictException } from '@nestjs/common';
import { IncidentWorkOrderService } from './incident-work-order.service';

describe('IncidentWorkOrderService Category G1/G2 controls', () => {
  let prisma: any;
  let approvals: any;
  let service: IncidentWorkOrderService;

  const retainer = {
    id: 'retainer-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    contract_id: 'contract-1',
    service_obligation_id: 'obligation-1',
    status: 'ACTIVE',
    term_start: new Date(Date.now() - 86_400_000),
    term_end: new Date(Date.now() + 86_400_000),
    maximum_response_authority: 'R2',
    included_hours: 10,
    included_services: '["containment","forensics"]',
    response_window: '{"coverage":"24X7"}',
    warning_threshold_percent: 80,
    overage_policy: 'BLOCK',
    overage_cap_hours: null,
    emergency_provision:
      '{"enabled":true,"contractReference":"emergency-clause-1","reconciliationRequired":true}',
    third_party_cost_policy:
      '{"enabled":true,"contractReference":"pass-through-1","maxMarkupPercent":10,"requiresNamedApproval":true}',
    legal_service_scope: '{"included":false}',
  };

  const workOrder = {
    id: 'work-order-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    retainer_id: retainer.id,
    retainer,
    contract_id: 'contract-1',
    status: 'ACTIVE',
    included_hours: 10,
    consumed_hours: 3,
    overage_hours: 0,
    forecast_hours: 3,
    warning_threshold_percent: 80,
    overage_policy: 'BLOCK',
    overage_cap_hours: null,
    evidence_refs: '[]',
    third_party_costs: 0,
    emergency_reconciliation_status: 'NOT_REQUIRED',
    emergency_reconciliation_approval_id: null,
  };

  beforeEach(() => {
    prisma = {
      incidentResponseRetainer: { findFirst: jest.fn() },
      serviceObligation: { findFirst: jest.fn() },
      incidentWorkOrder: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      incidentWorkOrderConsumption: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      commercialApproval: { findFirst: jest.fn(), update: jest.fn() },
      thirdPartyPassThroughCost: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      incidentLegalSensitiveRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      incidentLegalAccessEvent: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    service = new IncidentWorkOrderService(prisma, approvals);
  });

  it('fails closed when activation has no active tenant-bound retainer', async () => {
    prisma.incidentResponseRetainer.findFirst.mockResolvedValue(null);

    await expect(
      service.activate('tenant-1', 'prod', 'responder-1', {
        retainerId: 'd58124e2-1cb0-4c30-921a-b5b1e47da141',
        incidentReference: 'incident-1',
        activationReason: 'Ransomware containment',
        activationReference: 'hotline-call-1',
        authorityScope: {
          allowedActions: ['isolate-host'],
          prohibitedActions: ['pay-ransom'],
          customerApprovalRequiredActions: ['disable-domain'],
        },
        customerCommandStructure: {
          incidentCommander: 'ir-lead',
          customerDecisionAuthority: 'customer-ciso',
          communicationsChannel: 'bridge-1',
          escalationContact: 'customer-ceo',
        },
        readinessEvidenceRefs: ['readiness-1'],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.incidentWorkOrder.create).not.toHaveBeenCalled();
  });

  it('activates from server-controlled retainer scope and current actor', async () => {
    prisma.incidentResponseRetainer.findFirst.mockResolvedValue(retainer);
    prisma.serviceObligation.findFirst.mockResolvedValue({
      id: 'obligation-1',
    });
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(null);
    prisma.incidentWorkOrder.create.mockResolvedValue({
      id: 'work-order-1',
      status: 'ACTIVE',
    });

    await service.activate('tenant-1', 'prod', 'responder-1', {
      retainerId: 'd58124e2-1cb0-4c30-921a-b5b1e47da141',
      incidentReference: 'incident-1',
      activationReason: 'Ransomware containment',
      activationReference: 'hotline-call-1',
      responseAuthority: 'R2',
      authorityScope: {
        allowedActions: ['isolate-host'],
        prohibitedActions: ['pay-ransom'],
        customerApprovalRequiredActions: ['disable-domain'],
      },
      customerCommandStructure: {
        incidentCommander: 'ir-lead',
        customerDecisionAuthority: 'customer-ciso',
        communicationsChannel: 'bridge-1',
        escalationContact: 'customer-ceo',
      },
      readinessEvidenceRefs: ['readiness-1'],
    });

    expect(prisma.incidentWorkOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        contract_id: 'contract-1',
        authorized_by: 'responder-1',
        included_hours: 10,
        overage_policy: 'BLOCK',
        no_privilege_or_notification_determination: expect.stringContaining(
          'does not establish legal privilege',
        ),
      }),
    });
  });

  it('appends evidenced consumption and exposes forecast warning before overage', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(workOrder);
    prisma.incidentWorkOrderConsumption.create.mockResolvedValue({
      id: 'consumption-1',
    });
    prisma.incidentWorkOrder.update.mockResolvedValue({
      ...workOrder,
      consumed_hours: 7,
      forecast_hours: 9,
      threshold_state: 'WARNING',
    });

    const result = await service.logHours(
      workOrder.id,
      'tenant-1',
      'prod',
      'analyst-1',
      {
        hours: 4,
        workDescription: 'Endpoint containment',
        evidenceReference: 'evidence://timesheet-1',
        expectedRemainingHours: 2,
      },
    );

    expect(result.workOrder.threshold_state).toBe('WARNING');
    expect(prisma.incidentWorkOrderConsumption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'STANDARD',
        hours: 4,
        forecast_hours_after: 9,
        threshold_state: 'WARNING',
        actor_id: 'analyst-1',
      }),
    });
  });

  it('does not append consumption when BLOCK policy would exceed allowance', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue({
      ...workOrder,
      consumed_hours: 9,
    });

    await expect(
      service.logHours(workOrder.id, 'tenant-1', 'prod', 'analyst-1', {
        hours: 2,
        workDescription: 'Recovery support',
        evidenceReference: 'evidence://timesheet-2',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.incidentWorkOrderConsumption.create).not.toHaveBeenCalled();
  });

  it('allows safety work under a matching emergency clause and marks reconciliation required', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue({
      ...workOrder,
      consumed_hours: 9,
    });
    prisma.incidentWorkOrderConsumption.create.mockResolvedValue({
      id: 'consumption-emergency',
      entry_type: 'EMERGENCY_CONTINUITY',
    });
    prisma.incidentWorkOrder.update.mockResolvedValue({
      ...workOrder,
      consumed_hours: 12,
      overage_hours: 2,
      emergency_reconciliation_status: 'REQUIRED',
    });

    await service.logHours(workOrder.id, 'tenant-1', 'prod', 'analyst-1', {
      hours: 3,
      workDescription: 'Critical containment continuation',
      evidenceReference: 'evidence://timesheet-emergency',
      emergencyProvisionReference: 'emergency-clause-1',
    });

    expect(prisma.incidentWorkOrderConsumption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'EMERGENCY_CONTINUITY',
        emergency_provision_ref: 'emergency-clause-1',
      }),
    });
    expect(prisma.incidentWorkOrder.update).toHaveBeenCalledWith({
      where: { id: workOrder.id },
      data: expect.objectContaining({
        emergency_reconciliation_status: 'REQUIRED',
      }),
    });
    expect((prisma as any).commercialInvoice).toBeUndefined();
  });

  it('binds requested overage to a named customer authorizer and maximum hours', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue({
      ...workOrder,
      overage_policy: 'REQUIRE_APPROVAL',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });

    await service.requestOverageApproval(
      workOrder.id,
      'tenant-1',
      'prod',
      'maker-1',
      {
        maxOverageHours: 5,
        namedCustomerAuthorizer: 'customer-ciso',
        customerApprovalReference: 'approval-email-1',
        reason: 'Forecast shows extended recovery',
      },
    );

    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'OVERAGE_OVERRIDE',
        tenantId: 'tenant-1',
        requestedBy: 'maker-1',
        proposedSnapshot: expect.objectContaining({
          maxOverageHours: 5,
          namedCustomerAuthorizer: 'customer-ciso',
          customerApprovalReference: 'approval-email-1',
        }),
      }),
    );
  });

  it('does not create a named overage approval for a policy that did not contract for one', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(workOrder);

    await expect(
      service.requestOverageApproval(
        workOrder.id,
        'tenant-1',
        'prod',
        'maker-1',
        {
          maxOverageHours: 2,
          namedCustomerAuthorizer: 'customer-ciso',
          customerApprovalReference: 'approval-email-blocked',
          reason: 'Attempt to change a BLOCK policy',
        },
      ),
    ).rejects.toThrow(ConflictException);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it('allows only the cumulative overage hours covered by the named approval', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue({
      ...workOrder,
      consumed_hours: 9,
      overage_policy: 'REQUIRE_APPROVAL',
    });
    prisma.commercialApproval.findFirst.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      proposed_snapshot: JSON.stringify({ maxOverageHours: 3 }),
    });
    prisma.incidentWorkOrderConsumption.create.mockResolvedValue({
      id: 'consumption-approved',
    });
    prisma.incidentWorkOrder.update.mockResolvedValue({
      ...workOrder,
      consumed_hours: 12,
      overage_hours: 2,
    });

    await service.logHours(workOrder.id, 'tenant-1', 'prod', 'analyst-1', {
      hours: 3,
      workDescription: 'Approved extended recovery',
      evidenceReference: 'evidence://timesheet-approved',
    });

    expect(prisma.incidentWorkOrderConsumption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'APPROVED_OVERAGE',
        overage_approval_id: 'approval-1',
        overage_total_after: 2,
      }),
    });
  });

  it('creates a bounded pass-through approval without creating a charge', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(workOrder);
    prisma.thirdPartyPassThroughCost.create.mockResolvedValue({
      id: 'cost-1',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'cost-approval-1' });
    prisma.thirdPartyPassThroughCost.update.mockResolvedValue({
      id: 'cost-1',
      approval_id: 'cost-approval-1',
      status: 'PENDING_APPROVAL',
    });

    await service.requestThirdPartyCost(
      workOrder.id,
      'tenant-1',
      'prod',
      'maker-1',
      {
        costType: 'FORENSIC_SPECIALIST',
        supplierReference: 'supplier-1',
        contractPolicyReference: 'pass-through-1',
        description: 'Memory forensics specialist',
        baseAmount: 1000,
        markupPercent: 10,
        currency: 'usd',
        namedCustomerAuthorizer: 'customer-ciso',
        customerApprovalReference: 'approval-email-2',
        evidenceRefs: ['supplier-quote-1'],
        incurredAt: new Date(Date.now() - 1000),
        reason: 'Specialist support requested',
      },
    );

    expect(prisma.thirdPartyPassThroughCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        base_amount: 1000,
        markup_percent: 10,
        customer_amount: 1100,
        currency: 'USD',
      }),
    });
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'THIRD_PARTY_PASS_THROUGH',
        financialImpact: 1100,
        proposedSnapshot: expect.objectContaining({ noAutomaticInvoice: true }),
      }),
      prisma,
    );
    expect((prisma as any).commercialInvoice).toBeUndefined();
  });

  it('rejects legal conclusions when no separately contracted counsel-controlled service exists', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(workOrder);

    await expect(
      service.createLegalSensitiveRecord('tenant-1', 'prod', 'legal-user-1', {
        workOrderId: '747515f6-b9ca-463d-b330-31264090d230',
        purpose: 'BREACH_NOTIFICATION_ANALYSIS',
        privilegeStatus: 'NOT_ASSERTED',
        notificationStatus: 'COUNSEL_DETERMINED',
        counselControlled: true,
        separateLegalServiceRef: 'legal-sow-1',
        counselActorRef: 'outside-counsel-1',
        conclusionReference: 'memo-1',
        contentReference: 'vault://legal/memo-1',
        accessReason: 'Incident counsel coordination',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.incidentLegalSensitiveRecord.create).not.toHaveBeenCalled();
  });

  it('allows contracted counsel coordination without inventing a legal conclusion', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue({
      ...workOrder,
      retainer: {
        ...retainer,
        legal_service_scope: JSON.stringify({
          included: true,
          counselControlled: true,
          contractReference: 'legal-sow-1',
        }),
      },
    });
    prisma.incidentLegalSensitiveRecord.create.mockResolvedValue({
      id: 'legal-record-coordination',
      privilege_status: 'NOT_ASSERTED',
      notification_status: 'NOT_DETERMINED',
    });
    prisma.incidentLegalAccessEvent.create.mockResolvedValue({
      id: 'legal-access-create',
    });

    await service.createLegalSensitiveRecord(
      'tenant-1',
      'prod',
      'legal-user-1',
      {
        workOrderId: '747515f6-b9ca-463d-b330-31264090d230',
        purpose: 'INCIDENT_COUNSEL_COORDINATION',
        privilegeStatus: 'NOT_ASSERTED',
        notificationStatus: 'NOT_DETERMINED',
        counselControlled: true,
        separateLegalServiceRef: 'legal-sow-1',
        counselActorRef: 'outside-counsel-1',
        contentReference: 'vault://legal/coordination-1',
        accessReason: 'Coordinate evidence delivery requested by counsel',
      },
    );

    expect(prisma.incidentLegalSensitiveRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        counsel_controlled: true,
        privilege_status: 'NOT_ASSERTED',
        notification_status: 'NOT_DETERMINED',
        conclusion_reference: undefined,
        no_legal_advice_wording: expect.stringContaining(
          'does not establish legal privilege',
        ),
      }),
    });
    expect(prisma.incidentLegalAccessEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CREATE' }),
    });
  });

  it('records a purpose-bound access event when legal-sensitive records are read', async () => {
    prisma.incidentWorkOrder.findFirst.mockResolvedValue(workOrder);
    prisma.incidentLegalSensitiveRecord.findMany.mockResolvedValue([
      { id: 'legal-record-1', purpose: 'INCIDENT_COUNSEL_COORDINATION' },
    ]);

    await service.listLegalSensitiveRecords(
      workOrder.id,
      'tenant-1',
      'prod',
      'legal-user-1',
      'Review requested by incident counsel',
    );

    expect(prisma.incidentLegalAccessEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          legal_record_id: 'legal-record-1',
          action: 'READ',
          actor_id: 'legal-user-1',
          access_reason: 'Review requested by incident counsel',
        }),
      ],
    });
  });
});
