import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DeletionRequestService } from './deletion-request.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { LegalHoldService } from '../legal-hold/legal-hold.service';
import { RetentionPolicyService } from '../retention/retention-policy.service';

describe('DeletionRequestService', () => {
  let prisma: any;
  let authorization: any;
  let legalHolds: any;
  let retention: any;
  let service: DeletionRequestService;

  beforeEach(() => {
    prisma = {
      deletionRequest: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          ...data,
          id: 'request-1',
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'request-1',
          ...data,
        })),
      },
      deletionTask: { createMany: jest.fn().mockResolvedValue({ count: 9 }) },
      $transaction: jest
        .fn()
        .mockImplementation((operations: any[]) => Promise.all(operations)),
    };
    authorization = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'PERMIT',
        authorizationDecisionId: 'authorization-1',
      }),
    };
    legalHolds = {
      getActiveForTenant: jest.fn().mockResolvedValue([]),
      scopeIntersects: jest
        .fn()
        .mockImplementation(
          (hold: Record<string, unknown>, deletion: Record<string, unknown>) =>
            hold.all === true || deletion.all === true,
        ),
    };
    retention = {
      resolve: jest.fn().mockResolvedValue({
        policyId: 'policy-1',
        basis: 'CONTRACTUAL',
        authority: 'Master services agreement',
        periodDays: 0,
      }),
      expiryFrom: jest
        .fn()
        .mockImplementation(
          (from: Date, days: number) =>
            new Date(from.getTime() + days * 86_400_000),
        ),
    };
    service = new DeletionRequestService(
      prisma as PrismaService,
      authorization as AuthorizationDecisionService,
      legalHolds as LegalHoldService,
      retention as unknown as RetentionPolicyService,
    );
  });

  it('submits a request for review without creating deletion tasks', async () => {
    const request = await service.request({
      tenantId: 'tenant-1',
      requestedBy: 'requester-1',
      requestAuthority: 'DATA_SUBJECT',
      subjectReference: 'subject-42',
      reason: 'The data subject requested erasure',
      scope: { subjectIds: ['subject-42'] },
    });

    expect(request.status).toBe('VALIDATING');
    expect(request.identity_verification_status).toBe('PENDING');
    expect(prisma.deletionTask.createMany).not.toHaveBeenCalled();
    expect(authorization.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deletion:request' }),
    );
  });

  it('records an intersecting legal hold as an explicit blocked state', async () => {
    legalHolds.getActiveForTenant.mockResolvedValue([
      { id: 'hold-1', scope: JSON.stringify({ caseIds: ['case-1'] }) },
    ]);
    legalHolds.scopeIntersects.mockReturnValue(true);

    const request = await service.request({
      tenantId: 'tenant-1',
      requestedBy: 'requester-1',
      requestAuthority: 'TENANT_OFFBOARDING',
      reason: 'Tenant contract has ended',
      scope: { all: true },
      identityVerificationStatus: 'NOT_APPLICABLE',
    });

    expect(request).toEqual(
      expect.objectContaining({
        status: 'BLOCKED_BY_HOLD',
        legal_hold_state: 'BLOCKED',
        conflicting_legal_hold_ids: '["hold-1"]',
      }),
    );
  });

  it('fails closed when deletion request permission is denied', async () => {
    authorization.evaluate.mockResolvedValue({
      decision: 'DENY',
      authorizationDecisionId: 'authorization-denied',
    });

    await expect(
      service.request({
        tenantId: 'tenant-1',
        requestedBy: 'requester-1',
        requestAuthority: 'DATA_SUBJECT',
        reason: 'The data subject requested erasure',
        scope: { subjectIds: ['subject-42'] },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.deletionRequest.create).not.toHaveBeenCalled();
  });

  it('enforces maker-checker separation for deletion approval', async () => {
    prisma.deletionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'same-person',
      status: 'VALIDATING',
      identity_verification_status: 'NOT_APPLICABLE',
      scope: '{"all":true}',
    });

    await expect(
      service.approve({
        tenantId: 'tenant-1',
        deletionRequestId: 'request-1',
        approvedBy: 'same-person',
        decisionReason: 'Reviewed and approved',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.deletionTask.createMany).not.toHaveBeenCalled();
  });

  it('does not approve a request while identity verification is pending', async () => {
    prisma.deletionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'requester-1',
      status: 'VALIDATING',
      identity_verification_status: 'PENDING',
      scope: '{"all":true}',
    });

    await expect(
      service.approve({
        tenantId: 'tenant-1',
        deletionRequestId: 'request-1',
        approvedBy: 'reviewer-1',
        decisionReason: 'Reviewed and approved',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.deletionTask.createMany).not.toHaveBeenCalled();
  });

  it('materializes whole-tenant deletion tasks only after approval', async () => {
    const request = {
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'requester-1',
      status: 'VALIDATING',
      identity_verification_status: 'NOT_APPLICABLE',
      scope: '{"all":true}',
    };
    prisma.deletionRequest.findFirst.mockResolvedValue(request);
    prisma.deletionRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'APPROVED',
    });

    const approved = await service.approve({
      tenantId: 'tenant-1',
      deletionRequestId: 'request-1',
      approvedBy: 'reviewer-1',
      decisionReason: 'Identity, scope, retention and holds reviewed',
    });

    expect(approved.status).toBe('APPROVED');
    expect(prisma.deletionTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          deletion_request_id: 'request-1',
          store_type: 'POSTGRES_AUTHORITY',
        }),
        expect.objectContaining({ store_type: 'EMBEDDINGS' }),
      ]),
    });
  });

  it('rechecks legal holds immediately before execution', async () => {
    prisma.deletionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'requester-1',
      status: 'APPROVED',
      scope: '{"all":true}',
      retention_basis: 'CONTRACTUAL',
      retention_period_days: 30,
      retention_expires_at: new Date(Date.now() - 60_000),
    });
    legalHolds.getActiveForTenant.mockResolvedValue([
      { id: 'hold-late', scope: '{"caseIds":["case-9"]}' },
    ]);
    legalHolds.scopeIntersects.mockReturnValue(true);

    await expect(
      service.assertExecutable('tenant-1', 'request-1'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.deletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'BLOCKED_BY_HOLD' }),
      }),
    );
  });

  it('refuses to execute an approved request whose retention period has not expired', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    prisma.deletionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'requester-1',
      status: 'APPROVED',
      scope: '{"all":true}',
      retention_basis: 'CONTRACTUAL',
      retention_period_days: 30,
      retention_expires_at: expiresAt,
    });

    await expect(
      service.assertExecutable('tenant-1', 'request-1'),
    ).rejects.toThrow(/not yet retention-eligible/);
    expect(prisma.deletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AWAITING_RETENTION_EXPIRY' }),
      }),
    );
    // Approval alone must never be mistaken for eligibility.
    expect(legalHolds.getActiveForTenant).not.toHaveBeenCalled();
  });

  it('refuses to execute a request that carries no retention determination', async () => {
    prisma.deletionRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenant_id: 'tenant-1',
      requested_by: 'requester-1',
      status: 'APPROVED',
      scope: '{"all":true}',
      retention_expires_at: null,
    });

    await expect(
      service.assertExecutable('tenant-1', 'request-1'),
    ).rejects.toThrow(/no retention determination/);
  });

  it('stamps the authoritative retention determination onto a new request', async () => {
    await service.request({
      tenantId: 'tenant-1',
      requestedBy: 'requester-1',
      requestAuthority: 'TENANT_OFFBOARDING',
      reason: 'Tenant offboarding',
      scope: { all: true },
      identityVerificationStatus: 'NOT_APPLICABLE',
    });

    expect(retention.resolve).toHaveBeenCalledWith('tenant-1');
    expect(prisma.deletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retention_policy_id: 'policy-1',
          retention_basis: 'CONTRACTUAL',
          retention_period_days: 0,
        }),
      }),
    );
  });
});
