import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TenantOffboardingService } from './tenant-offboarding.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { ExportJobService } from '../../export/jobs/export-job.service';
import { ExportWorkerService } from '../../export/workers/export-worker.service';
import { ApiClientService } from '../../developer-api/clients/api-client.service';
import { LegalHoldService } from '../legal-hold/legal-hold.service';
import { DeletionRequestService } from '../deletion/deletion-request.service';
import { DeletionTaskService } from '../deletion/deletion-task.service';
import { BackupExpiryService } from '../backup-expiry/backup-expiry.service';
import { DeletionAttestationService } from '../attestation/deletion-attestation.service';

/**
 * ZS-COM-BILL-001 SEC-02: commercial suspension/offboarding cannot destroy
 * evidence, active incident history or legally retained records. These
 * tests exercise the actual sequencing guarantees that make that true:
 * export must complete before anything is touched, an active legal hold
 * blocks deletion outright, and each stage is gated on the previous one
 * actually having finished.
 */
describe('TenantOffboardingService (SEC-02)', () => {
  let service: TenantOffboardingService;
  let prismaMock: any;
  let outboxMock: any;
  let authDecisionMock: any;
  let exportJobMock: any;
  let exportWorkerMock: any;
  let apiClientMock: any;
  let legalHoldMock: any;
  let deletionRequestMock: any;
  let deletionTaskMock: any;
  let backupExpiryMock: any;
  let attestationMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenantOffboardingRun: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      outboxEvent: { create: jest.fn() },
      apiClient: { findMany: jest.fn().mockResolvedValue([]) },
      connectorInstance: { updateMany: jest.fn() },
      exportJob: { findUniqueOrThrow: jest.fn() },
      deletionTask: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };
    outboxMock = { build: jest.fn().mockReturnValue({}) };
    authDecisionMock = { evaluate: jest.fn() };
    exportJobMock = { create: jest.fn() };
    exportWorkerMock = { run: jest.fn() };
    apiClientMock = { suspend: jest.fn(), revoke: jest.fn() };
    legalHoldMock = {};
    deletionRequestMock = { request: jest.fn() };
    deletionTaskMock = { executeTask: jest.fn() };
    backupExpiryMock = { recordPending: jest.fn() };
    attestationMock = { issue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantOffboardingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: outboxMock },
        { provide: AuthorizationDecisionService, useValue: authDecisionMock },
        { provide: ExportJobService, useValue: exportJobMock },
        { provide: ExportWorkerService, useValue: exportWorkerMock },
        { provide: ApiClientService, useValue: apiClientMock },
        { provide: LegalHoldService, useValue: legalHoldMock },
        { provide: DeletionRequestService, useValue: deletionRequestMock },
        { provide: DeletionTaskService, useValue: deletionTaskMock },
        { provide: BackupExpiryService, useValue: backupExpiryMock },
        { provide: DeletionAttestationService, useValue: attestationMock },
      ],
    }).compile();

    service = module.get<TenantOffboardingService>(TenantOffboardingService);
  });

  it('denies starting offboarding when the actor is not authorized', async () => {
    authDecisionMock.evaluate.mockResolvedValue({ decision: 'DENY', authorizationDecisionId: 'ad-1' });

    await expect(service.start('tenant-1', 'attacker', 'malicious')).rejects.toThrow(ForbiddenException);
    expect(prismaMock.tenantOffboardingRun.create).not.toHaveBeenCalled();
  });

  it('repeated start commands are idempotent and return the in-flight run rather than starting a second one', async () => {
    authDecisionMock.evaluate.mockResolvedValue({ decision: 'ALLOW', authorizationDecisionId: 'ad-1' });
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'EXPORTING' });

    const run = await service.start('tenant-1', 'admin', 'offboarding customer');

    expect(run.id).toBe('run-1');
    expect(prismaMock.tenantOffboardingRun.create).not.toHaveBeenCalled();
  });

  it('SEC-02 core guarantee: deletion cannot proceed until the final export has actually completed', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'EXPORTING', requested_by: 'admin' });
    exportJobMock.create.mockResolvedValue({ id: 'job-1' });
    prismaMock.tenantOffboardingRun.update.mockResolvedValue({ id: 'run-1' });
    exportWorkerMock.run.mockResolvedValue(undefined);
    prismaMock.exportJob.findUniqueOrThrow.mockResolvedValue({ id: 'job-1', status: 'FAILED' });

    await expect(service.startFinalExport('tenant-1', 'run-1')).rejects.toThrow(ConflictException);

    // The run is marked FAILED, never allowed to silently continue toward deletion.
    expect(prismaMock.tenantOffboardingRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('a completed export moves the run to EXPORT_READY, the prerequisite for freezing access', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'EXPORTING', requested_by: 'admin' });
    exportJobMock.create.mockResolvedValue({ id: 'job-1' });
    prismaMock.tenantOffboardingRun.update.mockResolvedValue({ id: 'run-1', status: 'EXPORT_READY' });
    exportWorkerMock.run.mockResolvedValue(undefined);
    prismaMock.exportJob.findUniqueOrThrow.mockResolvedValue({ id: 'job-1', status: 'READY' });

    const run = await service.startFinalExport('tenant-1', 'run-1');

    expect(run.status).toBe('EXPORT_READY');
  });

  it('freezing access before the export is ready is rejected — access cannot be cut before evidence is exported', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'EXPORTING' });

    await expect(service.freezeAccess('tenant-1', 'run-1')).rejects.toThrow(ConflictException);
    expect(apiClientMock.suspend).not.toHaveBeenCalled();
  });

  it('freezing access suspends and revokes API client credentials', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'EXPORT_READY' });
    prismaMock.$transaction.mockResolvedValue([{ id: 'run-1', status: 'ACCESS_FROZEN' }]);
    prismaMock.apiClient.findMany.mockResolvedValue([{ id: 'client-1' }]);

    await service.freezeAccess('tenant-1', 'run-1');

    expect(apiClientMock.suspend).toHaveBeenCalledWith('tenant-1', 'client-1');
    expect(apiClientMock.revoke).toHaveBeenCalledWith('tenant-1', 'client-1');
  });

  it('SEC-02 core guarantee: an active legal hold blocks deletion outright rather than deleting around it', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'CONNECTOR_REVOCATION', requested_by: 'admin' });
    deletionRequestMock.request.mockResolvedValue({ id: 'del-1', status: 'BLOCKED_BY_HOLD' });
    prismaMock.tenantOffboardingRun.update.mockResolvedValue({ id: 'run-1', status: 'BLOCKED', deletion_request_id: 'del-1' });
    prismaMock.tenantOffboardingRun.findUniqueOrThrow.mockResolvedValue({ id: 'run-1', status: 'BLOCKED' });

    const run = await service.startDeletion('tenant-1', 'run-1', 'admin');

    expect(run.status).toBe('BLOCKED');
    // No deletion tasks were ever executed while blocked.
    expect(deletionTaskMock.executeTask).not.toHaveBeenCalled();
    expect(backupExpiryMock.recordPending).not.toHaveBeenCalled();
  });

  it('deletion cannot start before connector revocation has completed', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'ACCESS_FROZEN' });

    await expect(service.startDeletion('tenant-1', 'run-1', 'admin')).rejects.toThrow(ConflictException);
    expect(deletionRequestMock.request).not.toHaveBeenCalled();
  });

  it('an approved (non-blocked) deletion request executes its tasks and records pending backup expiry', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'CONNECTOR_REVOCATION', requested_by: 'admin' });
    deletionRequestMock.request.mockResolvedValue({ id: 'del-1', status: 'APPROVED' });
    prismaMock.tenantOffboardingRun.update.mockResolvedValue({ id: 'run-1', status: 'BACKUP_EXPIRY_PENDING' });
    prismaMock.deletionTask.findMany.mockResolvedValue([{ id: 'task-1' }, { id: 'task-2' }]);

    await service.startDeletion('tenant-1', 'run-1', 'admin');

    expect(deletionTaskMock.executeTask).toHaveBeenCalledTimes(2);
    expect(backupExpiryMock.recordPending).toHaveBeenCalledWith('tenant-1', 'del-1');
  });

  it('attestation and closure requires backup expiry to be pending with a deletion request on record', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({ id: 'run-1', tenant_id: 'tenant-1', status: 'DELETING', deletion_request_id: null });

    await expect(service.issueAttestationAndClose('tenant-1', 'run-1', 'admin')).rejects.toThrow(ConflictException);
    expect(attestationMock.issue).not.toHaveBeenCalled();
  });

  it('issues a deletion attestation and closes the run, disclosing any still-pending backup expiry rather than waiting on it', async () => {
    prismaMock.tenantOffboardingRun.findFirst.mockResolvedValue({
      id: 'run-1',
      tenant_id: 'tenant-1',
      status: 'BACKUP_EXPIRY_PENDING',
      deletion_request_id: 'del-1',
    });
    attestationMock.issue.mockResolvedValue({ id: 'attestation-1' });
    prismaMock.$transaction.mockResolvedValue([{ id: 'run-1', status: 'COMPLETED' }]);

    const result = await service.issueAttestationAndClose('tenant-1', 'run-1', 'admin');

    expect(result.attestation.id).toBe('attestation-1');
    expect(result.run.status).toBe('COMPLETED');
  });

  it('never calls any evidence/case/alert deletion API directly — offboarding only orchestrates the deletion-request/task pipeline', () => {
    // Structural guarantee, not just behavioral: the service's only path to
    // destroying data is through DeletionRequestService/DeletionTaskService,
    // which themselves gate on legal hold. It has no direct Prisma access to
    // evidence/case/alert tables for deletion.
    const source = TenantOffboardingService.toString();
    expect(source).not.toMatch(/prisma\.(evidenceRecord|case|alert|caseEvidence|alertEvidence)\.delete/i);
  });
});
