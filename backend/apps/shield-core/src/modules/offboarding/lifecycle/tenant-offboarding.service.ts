import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';
import { ExportJobService } from '../../export/jobs/export-job.service';
import { ExportWorkerService } from '../../export/workers/export-worker.service';
import { ApiClientService } from '../../developer-api/clients/api-client.service';
import { LegalHoldService } from '../legal-hold/legal-hold.service';
import { DeletionRequestService } from '../deletion/deletion-request.service';
import { DeletionTaskService } from '../deletion/deletion-task.service';
import { BackupExpiryService } from '../backup-expiry/backup-expiry.service';
import { DeletionAttestationService } from '../attestation/deletion-attestation.service';
import { DeletionVerificationService } from '../verification/deletion-verification.service';
import { DELETION_STORE_ORDER } from '../deletion/deletion-request.service';

/**
 * Spec §73's sequence, step by step — never destroys records before the
 * required export has completed/verified/manifested (spec §74). Each step
 * publishes its own event; the run's status IS the state machine, checked
 * before every transition rather than assumed.
 */
@Injectable()
export class TenantOffboardingService {
  private readonly logger = new Logger(TenantOffboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly exportJobService: ExportJobService,
    private readonly exportWorkerService: ExportWorkerService,
    private readonly apiClientService: ApiClientService,
    private readonly legalHoldService: LegalHoldService,
    private readonly deletionRequestService: DeletionRequestService,
    private readonly deletionTaskService: DeletionTaskService,
    private readonly backupExpiryService: BackupExpiryService,
    private readonly attestationService: DeletionAttestationService,
    private readonly verificationService: DeletionVerificationService,
  ) {}

  async start(tenantId: string, requestedBy: string, reason: string) {
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: requestedBy,
      tenantId,
      action: 'tenant_offboarding:start',
      resourceType: 'Tenant',
      resourceId: tenantId,
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to start tenant offboarding',
    );
    const { authorizationDecisionId } = authorization;

    // Idempotent — a repeated command returns the existing run (spec §87).
    // FAILED and ENGINEERING_REVIEW runs are deliberately included: destructive
    // work already committed under that run must be resumed from its
    // checkpoints, never forked into a second run that cannot see them
    // (ZS-ENG-OFF-DEL-001 decision 4).
    const existing = await this.prisma.tenantOffboardingRun.findFirst({
      where: { tenant_id: tenantId, status: { not: 'COMPLETED' } },
      orderBy: { initiated_at: 'desc' },
    });
    if (existing) return existing;

    const [run] = await this.prisma.$transaction([
      this.prisma.tenantOffboardingRun.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          requested_by: requestedBy,
          reason,
          status: 'EXPORT_REQUIRED',
          authorization_decision_id: authorizationDecisionId,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.TENANT_OFFBOARDING_STARTED,
          eventType: 'tenant.offboarding.started',
          payload: {},
        }),
      }),
    ]);
    return run;
  }

  /** Never destroys records before the required export has completed/verified/manifested (spec §74). */
  async startFinalExport(tenantId: string, runId: string) {
    const run = await this.assertOwnership(tenantId, runId);
    const job = await this.exportJobService.create({
      tenantId,
      requestedBy: run.requested_by,
      purpose: 'TENANT_OFFBOARDING_FINAL_EXPORT',
      exportType: 'FULL_TENANT',
      requestedScope: [
        'cases',
        'alerts',
        'controls',
        'assessments',
        'risks',
        'exceptions',
        'evidence_metadata',
        'audit_packages',
      ],
    });
    await this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: { status: 'EXPORTING', export_job_id: job.id },
    });
    await this.exportWorkerService.run(job.id);

    const finished = await this.prisma.exportJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    if (finished.status !== 'READY' && finished.status !== 'PARTIAL') {
      await this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'FAILED' },
      });
      throw new ConflictException(
        `Final export did not complete (status ${finished.status}) — offboarding cannot proceed until it does`,
      );
    }
    return this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: { status: 'EXPORT_READY' },
    });
  }

  async freezeAccess(tenantId: string, runId: string) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'EXPORT_READY') {
      throw new ConflictException(
        `Offboarding run '${runId}' must be EXPORT_READY before freezing access (currently ${run.status})`,
      );
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'ACCESS_FROZEN' },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.TENANT_ACCESS_FROZEN,
          eventType: 'tenant.access.frozen',
          payload: {},
        }),
      }),
    ]);

    // API clients: SUSPENDED, then credentials REVOKED (spec §76) — no new token issuance from here on.
    const apiClients = await this.prisma.apiClient.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });
    for (const client of apiClients) {
      await this.apiClientService.suspend(tenantId, client.id);
      await this.apiClientService.revoke(tenantId, client.id);
    }
    return updated;
  }

  async revokeConnectors(tenantId: string, runId: string) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'ACCESS_FROZEN') {
      throw new ConflictException(
        `Offboarding run '${runId}' must be ACCESS_FROZEN before revoking connectors (currently ${run.status})`,
      );
    }
    await this.prisma.connectorInstance.updateMany({
      where: { tenant_id: tenantId },
      data: { state: 'NOT_CONNECTED' },
    });
    const [updated] = await this.prisma.$transaction([
      this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'CONNECTOR_REVOCATION' },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.TENANT_CONNECTORS_REVOKED,
          eventType: 'tenant.connectors.revoked',
          payload: {},
        }),
      }),
    ]);
    return updated;
  }

  async startDeletion(
    tenantId: string,
    runId: string,
    requestedBy: string,
    authorizationScopeId?: string,
  ) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'CONNECTOR_REVOCATION') {
      throw new ConflictException(
        `Offboarding run '${runId}' must have completed connector revocation before deletion (currently ${run.status})`,
      );
    }

    const deletionRequest = await this.deletionRequestService.request({
      tenantId,
      authorizationScopeId,
      requestedBy,
      requestAuthority: 'TENANT_OFFBOARDING',
      reason: 'Tenant offboarding',
      scope: { all: true },
      identityVerificationStatus: 'NOT_APPLICABLE',
    });
    return this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: {
        deletion_request_id: deletionRequest.id,
        status:
          deletionRequest.status === 'BLOCKED_BY_HOLD'
            ? 'BLOCKED'
            : 'DELETION_PENDING',
      },
    });
  }

  /**
   * Maker-checker boundary: submission never deletes. A different, explicitly
   * authorized human approves the request before any store task can start.
   */
  async approveAndExecuteDeletion(
    tenantId: string,
    runId: string,
    approvedBy: string,
    decisionReason: string,
    authorizationScopeId?: string,
  ) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'DELETION_PENDING' || !run.deletion_request_id) {
      throw new ConflictException(
        `Offboarding run '${runId}' is not awaiting deletion approval (currently ${run.status})`,
      );
    }

    const deletionRequest = await this.deletionRequestService.approve({
      tenantId,
      authorizationScopeId,
      deletionRequestId: run.deletion_request_id,
      approvedBy,
      decisionReason,
    });

    if (deletionRequest.status === 'BLOCKED_BY_HOLD') {
      return this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'BLOCKED' },
      });
    }

    // Retention eligibility is a gate of its own. Approval says the
    // destruction is authorized; it does not say the data may go yet.
    if (
      deletionRequest.retention_expires_at &&
      deletionRequest.retention_expires_at.getTime() > Date.now()
    ) {
      await this.prisma.deletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: 'AWAITING_RETENTION_EXPIRY',
          outcome: 'AWAITING_RETENTION_EXPIRY',
        },
      });
      this.logger.log(
        `Tenant ${tenantId} deletion approved but not yet retention-eligible; waiting until ${deletionRequest.retention_expires_at.toISOString()}`,
      );
      return this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'RETENTION_WAIT' },
      });
    }

    return this.executeDeletion(tenantId, run.id, deletionRequest.id);
  }

  /**
   * Resume a run whose destructive phase did not finish — after a failure, a
   * worker restart, or the retention period elapsing. Completed store tasks
   * are checkpoints and are not repeated; only incomplete work runs again, and
   * tenant access stays revoked throughout (ZS-ENG-OFF-DEL-001 decision 4).
   */
  async resumeDeletion(tenantId: string, runId: string) {
    const run = await this.assertOwnership(tenantId, runId);
    const resumable = ['RETENTION_WAIT', 'DELETING', 'VERIFYING', 'FAILED'];
    if (!resumable.includes(run.status) || !run.deletion_request_id) {
      throw new ConflictException(
        `Offboarding run '${runId}' cannot be resumed from status ${run.status}`,
      );
    }
    return this.executeDeletion(tenantId, run.id, run.deletion_request_id);
  }

  /**
   * The destructive phase, as a resumable saga. Store tasks run in a fixed
   * order and each is its own durable checkpoint; nothing here rolls back a
   * completed destruction, and no run reaches a closable state until an
   * independent verification pass says the data is actually gone.
   */
  private async executeDeletion(
    tenantId: string,
    runId: string,
    deletionRequestId: string,
  ) {
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_DELETION_STARTED,
        eventType: 'tenant.deletion.started',
        payload: { deletionRequestId },
      }),
    });
    await this.prisma.tenantOffboardingRun.update({
      where: { id: runId },
      data: { status: 'DELETING' },
    });
    await this.deletionRequestService.markRunning(tenantId, deletionRequestId);

    const tasks = await this.prisma.deletionTask.findMany({
      where: { deletion_request_id: deletionRequestId },
    });
    const ordered = [...tasks].sort(
      (a, b) =>
        DELETION_STORE_ORDER.indexOf(a.store_type) -
        DELETION_STORE_ORDER.indexOf(b.store_type),
    );
    for (const task of ordered) {
      try {
        await this.deletionTaskService.executeTask(task.id);
      } catch (error) {
        await this.failRun(tenantId, runId, deletionRequestId);
        throw error;
      }
    }

    await this.backupExpiryService.recordPending(tenantId, deletionRequestId);

    // The completion barrier. Task success is a claim; this is the check.
    await this.prisma.tenantOffboardingRun.update({
      where: { id: runId },
      data: { status: 'VERIFYING' },
    });
    const verification = await this.verificationService.verify(
      tenantId,
      deletionRequestId,
      'shield-core-deletion-verifier',
    );
    if (verification.result === 'FAIL') {
      await this.failRun(tenantId, runId, deletionRequestId);
      throw new ConflictException(
        `Deletion verification failed for tenant '${tenantId}': ${verification.residualCount} unauthorized residual record(s) remain — the run cannot be attested or closed`,
      );
    }

    await this.deletionRequestService.markBackupExpiryPending(
      tenantId,
      deletionRequestId,
    );
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_DELETION_RECONCILED,
        eventType: 'tenant.deletion.reconciled',
        payload: { deletionRequestId },
      }),
    });
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_BACKUP_EXPIRY_PENDING,
        eventType: 'tenant.backup_expiry.pending',
        payload: { deletionRequestId },
      }),
    });

    return this.prisma.tenantOffboardingRun.update({
      where: { id: runId },
      data: { status: 'BACKUP_EXPIRY_PENDING' },
    });
  }

  /**
   * Access stays revoked in every failure state. A run only leaves DELETING
   * downward, never back toward a usable tenant.
   */
  private async failRun(
    tenantId: string,
    runId: string,
    deletionRequestId: string,
  ) {
    const request = await this.deletionRequestService.assertTenantOwnership(
      tenantId,
      deletionRequestId,
    );
    const heldTasks = await this.prisma.deletionTask.count({
      where: {
        deletion_request_id: deletionRequestId,
        status: 'ENGINEERING_REVIEW',
      },
    });
    const status =
      request.status === 'BLOCKED_BY_HOLD'
        ? 'BLOCKED'
        : heldTasks > 0
          ? 'ENGINEERING_REVIEW'
          : 'FAILED';
    await this.prisma.tenantOffboardingRun.update({
      where: { id: runId },
      data: { status },
    });
  }

  async issueAttestationAndClose(
    tenantId: string,
    runId: string,
    issuedBy: string,
  ) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'BACKUP_EXPIRY_PENDING' || !run.deletion_request_id) {
      throw new ConflictException(
        `Offboarding run '${runId}' is not ready for attestation (currently ${run.status})`,
      );
    }

    // Verification PASS is the precondition for saying anything was deleted.
    // Completed tasks are not evidence; an independent reconciliation is.
    const verification = await this.verificationService.latest(
      run.deletion_request_id,
    );
    if (!verification) {
      throw new ConflictException(
        `Offboarding run '${runId}' has no independent deletion verification — an attestation cannot be issued without one`,
      );
    }
    if (verification.result !== 'PASS') {
      throw new ConflictException(
        `Offboarding run '${runId}' last verified as ${verification.result} with ${verification.residual_count} unauthorized residual record(s) — an attestation cannot be issued until verification passes`,
      );
    }

    const attestation = await this.attestationService.issue(
      tenantId,
      run.deletion_request_id,
      issuedBy,
    );
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_DELETION_ATTESTED,
        eventType: 'tenant.deletion.attested',
        payload: { attestationId: attestation.id },
      }),
    });

    // Memberships, roles and grants are not swept here. They belong to the
    // authoritative deletion plan (ZS-ENG-OFF-DEL-001 architecture rule: one
    // orchestration chain) and were removed and residual-verified during
    // DELETING. Closure only records the outcome — it never destroys.

    // Backups may still be PENDING — that is disclosed in the attestation itself (spec §19/§71), closure does not wait on it.
    const [updated] = await this.prisma.$transaction([
      this.prisma.tenantOffboardingRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completed_at: new Date() },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.TENANT_CLOSED,
          eventType: 'tenant.closed',
          payload: {},
        }),
      }),
    ]);
    return { run: updated, attestation };
  }

  async assertOwnership(tenantId: string, runId: string) {
    const run = await this.prisma.tenantOffboardingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });
    if (!run) {
      throw new NotFoundException(`TenantOffboardingRun '${runId}' not found`);
    }
    return run;
  }
}
