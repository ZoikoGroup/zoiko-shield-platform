import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import {
  CorporateTransferService,
  CreateCorporateTransferDto,
} from './corporate-transfer.service';

describe('CorporateTransferService (approved boundary change with evidence preservation)', () => {
  let service: CorporateTransferService;
  let prismaMock: any;
  let approvalMock: any;

  const future = () => new Date(Date.now() + 86_400_000).toISOString();
  const dto = (): CreateCorporateTransferDto => ({
    sourceCommercialAccountId: 'source-account',
    sourceBindingId: 'source-binding',
    targetCommercialAccountId: 'target-account',
    targetTenantId: 'target-tenant',
    targetEnvironmentId: 'target-prod',
    targetLegalEntityId: 'target-legal',
    targetBusinessUnitId: 'target-bu',
    targetRegion: 'GB',
    targetResidencyPolicy: 'UK_ONLY',
    targetServiceScope: ['MANAGED_DEFENSE'],
    effectiveAt: future(),
    dataDecision: 'RETAIN_HISTORICAL_AT_SOURCE',
    exportDecision: 'NOT_REQUIRED',
    legalHoldDecision: 'NOT_APPLICABLE',
    entitlementMapping: [
      { sourceEntitlementId: 'entitlement-1', targetOfferType: 'MD-CORE' },
    ],
    reason: 'Subsidiary separation',
  });

  beforeEach(async () => {
    prismaMock = {
      commercialAccountTenantBinding: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      commercialAccount: { findFirst: jest.fn() },
      entitlement: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      legalHold: { findMany: jest.fn() },
      exportManifest: { findFirst: jest.fn() },
      corporateTransfer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialApproval: { findMany: jest.fn(), updateMany: jest.fn() },
      commercialEvent: { create: jest.fn() },
      evidenceRecord: { count: jest.fn(), updateMany: jest.fn() },
      evidenceLineage: { count: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    approvalMock = {
      requestApproval: jest
        .fn()
        .mockResolvedValueOnce({ id: 'source-approval' })
        .mockResolvedValueOnce({ id: 'target-approval' }),
      decideApproval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorporateTransferService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
      ],
    }).compile();
    service = module.get(CorporateTransferService);
  });

  function arrangeValidRequest() {
    const binding = {
      id: 'source-binding',
      updated_at: new Date('2026-08-24T12:00:00.000Z'),
    };
    prismaMock.commercialAccountTenantBinding.findFirst.mockResolvedValue(
      binding,
    );
    prismaMock.commercialAccountTenantBinding.findMany.mockResolvedValue([
      { id: binding.id },
    ]);
    prismaMock.commercialAccount.findFirst.mockResolvedValue({
      id: 'target-account',
    });
    prismaMock.entitlement.findMany.mockResolvedValue([
      { id: 'entitlement-1' },
    ]);
    prismaMock.legalHold.findMany.mockResolvedValue([]);
    prismaMock.corporateTransfer.create.mockImplementation(({ data }: any) => ({
      id: 'transfer-1',
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    }));
    prismaMock.corporateTransfer.update.mockImplementation(({ data }: any) => ({
      id: 'transfer-1',
      target_service_scope: '["MANAGED_DEFENSE"]',
      legal_hold_references: '[]',
      entitlement_mapping:
        '[{"sourceEntitlementId":"entitlement-1","targetOfferType":"MD-CORE"}]',
      evidence_boundary_snapshot: '{}',
      reconciliation_result: '{}',
      ...data,
    }));
  }

  it('creates independent source and target approvals for a cross-tenant plan', async () => {
    arrangeValidRequest();

    const result = await service.requestTransfer(
      'source-tenant',
      'source-prod',
      'requester-1',
      dto(),
    );

    expect(result.source_approval_id).toBe('source-approval');
    expect(result.target_approval_id).toBe('target-approval');
    expect(approvalMock.requestApproval).toHaveBeenCalledTimes(2);
    expect(approvalMock.requestApproval).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: 'source-tenant',
        changeType: 'CORPORATE_TRANSFER',
        requestedBy: 'requester-1',
      }),
      prismaMock,
    );
    expect(approvalMock.requestApproval).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tenantId: 'target-tenant' }),
      prismaMock,
    );
  });

  it('requires an explicit preserve-in-source decision when a legal hold is active', async () => {
    arrangeValidRequest();
    prismaMock.legalHold.findMany.mockResolvedValue([{ id: 'hold-1' }]);

    await expect(
      service.requestTransfer(
        'source-tenant',
        'source-prod',
        'requester-1',
        dto(),
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.corporateTransfer.create).not.toHaveBeenCalled();
  });

  it('fails closed when one commercial account has multiple active source boundaries', async () => {
    arrangeValidRequest();
    prismaMock.commercialAccountTenantBinding.findMany.mockResolvedValue([
      { id: 'source-binding' },
      { id: 'another-binding' },
    ]);

    await expect(
      service.requestTransfer(
        'source-tenant',
        'source-prod',
        'requester-1',
        dto(),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'TRANSFER_BOUNDARY_AMBIGUOUS',
      }),
    });
  });

  it('routes a target-tenant decision only to the target approval and waits for both participants', async () => {
    prismaMock.corporateTransfer.findFirst.mockResolvedValue({
      id: 'transfer-1',
      source_tenant_id: 'source-tenant',
      source_environment_id: 'source-prod',
      target_tenant_id: 'target-tenant',
      target_environment_id: 'target-prod',
      source_approval_id: 'source-approval',
      target_approval_id: 'target-approval',
    });
    prismaMock.commercialApproval.findMany.mockResolvedValue([
      { status: 'APPROVED' },
      { status: 'PENDING_APPROVAL' },
    ]);
    prismaMock.corporateTransfer.update.mockResolvedValue({
      id: 'transfer-1',
      status: 'PENDING_APPROVAL',
      target_service_scope: '[]',
      legal_hold_references: '[]',
      entitlement_mapping: '[]',
      evidence_boundary_snapshot: '{}',
      reconciliation_result: '{}',
    });

    await service.decideTransfer(
      'transfer-1',
      'target-tenant',
      'target-prod',
      'target-approver',
      { decision: 'APPROVED', reason: 'Accepted' },
    );

    expect(approvalMock.decideApproval).toHaveBeenCalledWith(
      'target-approval',
      'target-approver',
      'APPROVED',
      'Accepted',
    );
    expect(prismaMock.corporateTransfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-1' },
      data: { status: 'PENDING_APPROVAL' },
    });
  });

  it('executes by ending source commercial records and creating target records without updating evidence or lineage', async () => {
    const updatedAt = new Date('2026-08-24T12:00:00.000Z');
    prismaMock.corporateTransfer.findFirst.mockResolvedValue({
      id: 'transfer-1',
      source_commercial_account_id: 'source-account',
      source_binding_id: 'source-binding',
      source_tenant_id: 'source-tenant',
      source_environment_id: 'source-prod',
      source_binding_updated_at: updatedAt,
      target_commercial_account_id: 'target-account',
      target_tenant_id: 'target-tenant',
      target_environment_id: 'target-prod',
      target_legal_entity_id: 'target-legal',
      target_business_unit_id: null,
      target_region: 'GB',
      target_residency_policy: 'UK_ONLY',
      target_service_scope: '["MANAGED_DEFENSE"]',
      effective_at: new Date(Date.now() - 1_000),
      legal_hold_decision: 'PRESERVE_IN_SOURCE',
      export_decision: 'NOT_REQUIRED',
      export_manifest_id: null,
      entitlement_mapping:
        '[{"sourceEntitlementId":"entitlement-1","targetOfferType":"MD-CORE"}]',
      source_approval_id: 'source-approval',
      target_approval_id: 'target-approval',
      status: 'APPROVED',
    });
    prismaMock.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'source-binding',
      updated_at: updatedAt,
    });
    prismaMock.commercialAccount.findFirst.mockResolvedValue({
      id: 'target-account',
    });
    prismaMock.commercialAccountTenantBinding.updateMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.commercialAccountTenantBinding.findUnique.mockResolvedValue(
      null,
    );
    prismaMock.commercialAccountTenantBinding.create.mockResolvedValue({
      id: 'target-binding',
    });
    prismaMock.legalHold.findMany.mockResolvedValue([{ id: 'hold-1' }]);
    prismaMock.evidenceRecord.count.mockResolvedValue(42);
    prismaMock.evidenceLineage.count.mockResolvedValue(17);
    prismaMock.entitlement.findFirst.mockResolvedValue({
      id: 'entitlement-1',
    });
    prismaMock.entitlement.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.entitlement.create.mockResolvedValue({
      id: 'target-entitlement-1',
    });
    prismaMock.corporateTransfer.update.mockImplementation(({ data }: any) => ({
      id: 'transfer-1',
      target_service_scope: '["MANAGED_DEFENSE"]',
      entitlement_mapping:
        '[{"sourceEntitlementId":"entitlement-1","targetOfferType":"MD-CORE"}]',
      evidence_lineage_policy: 'PRESERVE_SOURCE_IDENTIFIERS',
      ...data,
    }));

    const result = await service.executeTransfer(
      'transfer-1',
      'source-tenant',
      'source-prod',
      'executor-1',
    );

    expect(result.status).toBe('RECONCILIATION_PENDING');
    expect(
      prismaMock.commercialAccountTenantBinding.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ENDED' }),
      }),
    );
    expect(prismaMock.entitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TRANSFERRED' }),
      }),
    );
    expect(prismaMock.entitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commercial_account_id: 'target-account',
        tenant_id: 'target-tenant',
        status: 'ACTIVE',
      }),
    });
    expect(prismaMock.evidenceRecord.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.evidenceLineage.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'corporate_transfer.executed',
        payload: expect.stringContaining(
          '"historicalEvidenceReassigned":false',
        ),
      }),
    });
  });
});
