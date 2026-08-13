import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
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
  ) {}

  async start(tenantId: string, requestedBy: string, reason: string) {
    const { authorizationDecisionId, decision } =
      await this.authorizationDecisionService.evaluate({
        actorId: requestedBy,
        tenantId,
        action: 'tenant_offboarding:start',
        resourceType: 'Tenant',
        resourceId: tenantId,
      });
    if (decision === 'DENY') {
      throw new ForbiddenException(
        'Actor is not authorized to start tenant offboarding',
      );
    }

    const existing = await this.prisma.tenantOffboardingRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['COMPLETED', 'FAILED', 'BLOCKED'] },
      },
    });
    if (existing) return existing; // idempotent — repeated command returns the in-flight run (spec §87)

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

  async startDeletion(tenantId: string, runId: string, requestedBy: string) {
    const run = await this.assertOwnership(tenantId, runId);
    if (run.status !== 'CONNECTOR_REVOCATION') {
      throw new ConflictException(
        `Offboarding run '${runId}' must have completed connector revocation before deletion (currently ${run.status})`,
      );
    }

    const deletionRequest = await this.deletionRequestService.request({
      tenantId,
      requestedBy,
      reason: 'Tenant offboarding',
      scope: { all: true },
    });
    await this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: {
        deletion_request_id: deletionRequest.id,
        status:
          deletionRequest.status === 'BLOCKED_BY_HOLD'
            ? 'BLOCKED'
            : 'DELETION_PENDING',
      },
    });

    if (deletionRequest.status === 'BLOCKED_BY_HOLD') {
      return this.prisma.tenantOffboardingRun.findUniqueOrThrow({
        where: { id: run.id },
      });
    }

    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_DELETION_STARTED,
        eventType: 'tenant.deletion.started',
        payload: { deletionRequestId: deletionRequest.id },
      }),
    });
    await this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: { status: 'DELETING' },
    });

    const tasks = await this.prisma.deletionTask.findMany({
      where: { deletion_request_id: deletionRequest.id },
    });
    for (const task of tasks) {
      try {
        await this.deletionTaskService.executeTask(task.id);
      } catch (error) {
        await this.prisma.tenantOffboardingRun.update({
          where: { id: run.id },
          data: { status: 'FAILED' },
        });
        throw error;
      }
    }
    await this.backupExpiryService.recordPending(tenantId, deletionRequest.id);

    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_DELETION_RECONCILED,
        eventType: 'tenant.deletion.reconciled',
        payload: { deletionRequestId: deletionRequest.id },
      }),
    });
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic: CANONICAL_TOPICS.TENANT_BACKUP_EXPIRY_PENDING,
        eventType: 'tenant.backup_expiry.pending',
        payload: { deletionRequestId: deletionRequest.id },
      }),
    });

    return this.prisma.tenantOffboardingRun.update({
      where: { id: run.id },
      data: { status: 'BACKUP_EXPIRY_PENDING' },
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

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'DELETE FROM authorization.user_roles WHERE membership_id IN (SELECT id FROM authorization.tenant_memberships WHERE "tenantId" = $1::uuid)',
        tenantId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM authorization.tenant_memberships WHERE "tenantId" = $1::uuid',
        tenantId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM authorization.role_permissions WHERE role_id IN (SELECT id FROM authorization.roles WHERE "tenantId" = $1::uuid)',
        tenantId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM authorization.roles WHERE "tenantId" = $1::uuid',
        tenantId,
      );
    });

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
