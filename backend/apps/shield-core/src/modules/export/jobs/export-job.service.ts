import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';

export interface CreateExportJobInput {
  tenantId: string;
  environmentId?: string;
  requestedBy: string;
  purpose: string;
  exportType: string;
  requestedScope: string[];
  formats?: string[];
  idempotencyKey?: string;
}

/**
 * Never generates a large export synchronously in the HTTP request (spec
 * §55) — create() only enqueues (REQUESTED), a separate worker
 * (ExportWorkerService) does the actual building. Duplicate idempotency
 * key returns the SAME existing job, never a duplicate export (spec §37).
 */
@Injectable()
export class ExportJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async create(input: CreateExportJobInput) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.exportJob.findFirst({ where: { tenant_id: input.tenantId, idempotency_key: input.idempotencyKey } });
      if (existing) return existing;
    }

    const { authorizationDecisionId, decision } = await this.authorizationDecisionService.evaluate({
      actorId: input.requestedBy,
      tenantId: input.tenantId,
      action: 'export:create',
      resourceType: 'Tenant',
      resourceId: input.tenantId,
    });
    if (decision === 'DENY') {
      throw new ConflictException('Actor is not authorized to create exports');
    }

    const jobId = randomUUID();
    const [job] = await this.prisma.$transaction([
      this.prisma.exportJob.create({
        data: {
          id: jobId,
          tenant_id: input.tenantId,
          environment_id: input.environmentId,
          requested_by: input.requestedBy,
          purpose: input.purpose,
          export_type: input.exportType,
          requested_scope: JSON.stringify(input.requestedScope),
          formats: JSON.stringify(input.formats ?? ['JSON']),
          status: 'REQUESTED',
          authorization_decision_id: authorizationDecisionId,
          idempotency_key: input.idempotencyKey,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.EXPORT_REQUESTED, eventType: 'export.requested', payload: { jobId } }) }),
    ]);
    return job;
  }

  async cancel(tenantId: string, jobId: string) {
    const job = await this.assertTenantOwnership(tenantId, jobId);
    if (['READY', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(job.status)) {
      throw new ConflictException(`ExportJob '${jobId}' is already terminal (${job.status})`);
    }
    return this.prisma.exportJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  }

  async assertTenantOwnership(tenantId: string, jobId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, tenant_id: tenantId } });
    if (!job) {
      throw new NotFoundException(`ExportJob '${jobId}' not found`);
    }
    return job;
  }

  async list(tenantId: string) {
    return this.prisma.exportJob.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' } });
  }
}
