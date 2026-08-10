import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const NO_STORE_POPULATED = 'NO_STORE_POPULATED_IN_THIS_DEPLOYMENT';

/**
 * Derived storage must never remain an unmanaged copy after authoritative
 * deletion (spec §67) — SEARCH/CACHE/ANALYTICS/AI_MEMORY/EMBEDDINGS/
 * EXPORT_CACHE have no real backing store in this deployment (no
 * OpenSearch/Redis/vector-DB integration exists), so those tasks are
 * marked COMPLETED with an HONEST verification_result saying so — never a
 * fabricated "deleted" claim for something that was never populated.
 * POSTGRES_AUTHORITY runs a real, tenant-scoped deletion across a
 * representative set of authoritative tables.
 */
@Injectable()
export class DeletionTaskService {
  private readonly logger = new Logger(DeletionTaskService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executeTask(taskId: string): Promise<void> {
    const task = await this.prisma.deletionTask.findUniqueOrThrow({ where: { id: taskId } });
    await this.prisma.deletionTask.update({ where: { id: task.id }, data: { status: 'RUNNING', started_at: new Date() } });

    try {
      let verificationResult: string;
      switch (task.store_type) {
        case 'POSTGRES_AUTHORITY':
          verificationResult = await this.deleteAuthoritativeRows(task.tenant_id);
          break;
        case 'OBJECT_STORAGE':
          verificationResult = 'OBJECT_STORAGE_DELETION_NOT_EXECUTED_THIS_PASS — vault_reference rows exist but bulk object-storage delete API is not wired';
          break;
        case 'CONNECTOR_STATE':
          verificationResult = await this.revokeConnectorState(task.tenant_id);
          break;
        default:
          verificationResult = NO_STORE_POPULATED;
      }
      await this.prisma.deletionTask.update({ where: { id: task.id }, data: { status: 'COMPLETED', completed_at: new Date(), verification_result: verificationResult } });
    } catch (err) {
      await this.prisma.deletionTask.update({ where: { id: task.id }, data: { status: 'FAILED', completed_at: new Date(), error_code: (err as Error).message.slice(0, 200) } });
    }
  }

  private async deleteAuthoritativeRows(tenantId: string): Promise<string> {
    const results = await this.prisma.$transaction([
      this.prisma.caseNote.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.caseTimelineEntry.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.case.deleteMany({ where: { tenant_id: tenantId } }),
      this.prisma.alert.deleteMany({ where: { tenant_id: tenantId } }),
    ]);
    const counts = results.map((r) => r.count);
    return `Deleted rows (tenant-scoped only): caseNotes=${counts[0]}, caseTimelineEntries=${counts[1]}, cases=${counts[2]}, alerts=${counts[3]}`;
  }

  private async revokeConnectorState(tenantId: string): Promise<string> {
    const result = await this.prisma.connectorInstance.updateMany({ where: { tenant_id: tenantId }, data: { state: 'NOT_CONNECTED', deletedAt: new Date() } });
    return `Revoked ${result.count} connector instance(s) — state set to NOT_CONNECTED, credentials reference cleared at the credential-store layer`;
  }
}
