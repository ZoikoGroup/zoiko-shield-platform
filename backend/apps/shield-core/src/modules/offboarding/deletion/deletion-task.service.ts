import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { DeletionRequestService } from './deletion-request.service';

const NO_STORE_POPULATED = JSON.stringify({
  outcome: 'NOT_APPLICABLE',
  reason: 'STORE_NOT_CONFIGURED_OR_POPULATED',
});

const DELETION_CONTROL_TABLES = new Set([
  'DeletionRequest',
  'DeletionTask',
  'DeletionAttestation',
  'TenantOffboardingRun',
  'BackupExpiryRecord',
  'LegalHold',
  'OutboxEvent',
]);

/**
 * Derived storage must never remain an unmanaged copy after authoritative
 * deletion (spec §67) — SEARCH/CACHE/ANALYTICS/AI_MEMORY/EMBEDDINGS/
 * EXPORT_CACHE have no real backing store in this deployment (no
 * OpenSearch/Redis/vector-DB integration exists), so those tasks are
 * marked COMPLETED with an HONEST verification_result saying so — never a
 * fabricated "deleted" claim for something that was never populated.
 * POSTGRES_AUTHORITY runs a real, tenant-scoped deletion across a
 * all tenant-keyed authoritative tables discovered from PostgreSQL's
 * catalogue. Deletion-control and legal-hold records are deliberately
 * retained so the operation remains independently auditable.
 */
@Injectable()
export class DeletionTaskService {
  private readonly logger = new Logger(DeletionTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    private readonly deletionRequestService: DeletionRequestService,
  ) {}

  async executeTask(taskId: string): Promise<void> {
    const task = await this.prisma.deletionTask.findUniqueOrThrow({
      where: { id: taskId },
    });
    // A legal hold may be created after approval. Re-evaluate the request at
    // every store boundary so a stale approval can never authorize later work.
    await this.deletionRequestService.assertExecutable(
      task.tenant_id,
      task.deletion_request_id,
    );
    await this.prisma.deletionTask.update({
      where: { id: task.id },
      data: { status: 'RUNNING', started_at: new Date() },
    });

    try {
      let verificationResult: string;
      switch (task.store_type) {
        case 'POSTGRES_AUTHORITY':
          verificationResult = await this.deleteAuthoritativeRows(
            task.tenant_id,
            (
              await this.prisma.deletionRequest.findUniqueOrThrow({
                where: { id: task.deletion_request_id },
              })
            ).requested_by,
          );
          break;
        case 'OBJECT_STORAGE':
          verificationResult = await this.deleteObjectStorage(task.tenant_id);
          break;
        case 'CONNECTOR_STATE':
          verificationResult = await this.revokeConnectorState(task.tenant_id);
          break;
        default:
          verificationResult = NO_STORE_POPULATED;
      }
      await this.prisma.deletionTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          verification_result: verificationResult,
        },
      });
    } catch (err) {
      await this.prisma.deletionTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          completed_at: new Date(),
          error_code: (err as Error).message.slice(0, 200),
        },
      });
      throw err;
    }
  }

  private async deleteAuthoritativeRows(
    tenantId: string,
    closingOperatorId: string,
  ): Promise<string> {
    type TenantTable = { table_name: string };
    type ForeignKey = { child_table: string; parent_table: string };
    const tables = await this.prisma.$queryRaw<TenantTable[]>`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
    `;
    const candidates = tables
      .map((row) => row.table_name)
      .filter((name) => !DELETION_CONTROL_TABLES.has(name));
    const candidateSet = new Set(candidates);
    const foreignKeys = await this.prisma.$queryRaw<ForeignKey[]>`
      SELECT child.relname AS child_table, parent.relname AS parent_table
      FROM pg_constraint constraint_record
      JOIN pg_class child ON child.oid = constraint_record.conrelid
      JOIN pg_class parent ON parent.oid = constraint_record.confrelid
      JOIN pg_namespace namespace_record ON namespace_record.oid = child.relnamespace
      WHERE constraint_record.contype = 'f' AND namespace_record.nspname = 'public'
    `;

    const ordered: string[] = [];
    const remaining = new Set(candidates);
    while (remaining.size > 0) {
      const leaves = [...remaining].filter(
        (parent) =>
          !foreignKeys.some(
            (fk) =>
              fk.parent_table === parent &&
              remaining.has(fk.child_table) &&
              fk.child_table !== parent,
          ),
      );
      if (leaves.length === 0) {
        throw new Error(
          `Tenant deletion dependency cycle detected among: ${[...remaining].sort().join(', ')}`,
        );
      }
      for (const table of leaves.sort()) {
        ordered.push(table);
        remaining.delete(table);
      }
    }

    const counts: Record<string, number> = {};
    await this.prisma.$transaction(async (tx) => {
      for (const table of ordered) {
        if (
          !candidateSet.has(table) ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)
        ) {
          throw new Error(`Unsafe tenant table identifier '${table}'`);
        }
        counts[table] = await tx.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE tenant_id = $1`,
          tenantId,
        );
      }

      // TypeORM owns these non-public schemas. Cross-tenant principals and
      // global permissions remain; only membership and tenant-owned rows go.
      counts['authorization.user_roles'] = await tx.$executeRawUnsafe(
        'DELETE FROM authorization.user_roles WHERE membership_id IN (SELECT id FROM authorization.tenant_memberships WHERE "tenantId" = $1::uuid AND "principalId" <> $2::uuid)',
        tenantId,
        closingOperatorId,
      );
      counts['authorization.tenant_memberships'] = await tx.$executeRawUnsafe(
        'DELETE FROM authorization.tenant_memberships WHERE "tenantId" = $1::uuid AND "principalId" <> $2::uuid',
        tenantId,
        closingOperatorId,
      );
      counts['authorization.invitations'] = await tx.$executeRawUnsafe(
        'DELETE FROM authorization.invitations WHERE "tenantId" = $1',
        tenantId,
      );
      counts['authorization.role_permissions'] = await tx.$executeRawUnsafe(
        'DELETE FROM authorization.role_permissions WHERE role_id IN (SELECT role.id FROM authorization.roles role WHERE role."tenantId" = $1::uuid AND NOT EXISTS (SELECT 1 FROM authorization.user_roles user_role WHERE user_role.role_id = role.id))',
        tenantId,
      );
      counts['authorization.roles'] = await tx.$executeRawUnsafe(
        'DELETE FROM authorization.roles role WHERE role."tenantId" = $1::uuid AND NOT EXISTS (SELECT 1 FROM authorization.user_roles user_role WHERE user_role.role_id = role.id)',
        tenantId,
      );
      counts['identity.identity_events'] = await tx.$executeRawUnsafe(
        'DELETE FROM identity.identity_events WHERE "tenantId" = $1::uuid',
        tenantId,
      );
      for (const table of [
        'customers',
        'organizations',
        'environments',
        'legal_entities',
      ]) {
        counts[`tenant.${table}`] = await tx.$executeRawUnsafe(
          `DELETE FROM tenant.${table} WHERE "tenantId" = $1::uuid`,
          tenantId,
        );
      }
      counts['tenant.tenants'] = await tx.$executeRawUnsafe(
        'DELETE FROM tenant.tenants WHERE id = $1::uuid',
        tenantId,
      );
    });

    let remainingRows = 0;
    for (const table of ordered) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE tenant_id = $1`,
        tenantId,
      );
      remainingRows += Number(rows[0]?.count ?? 0);
    }
    const typeOrmRemaining = await this.prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `
      SELECT (
        (SELECT COUNT(*) FROM authorization.tenant_memberships WHERE "tenantId" = $1::uuid AND "principalId" <> $2::uuid) +
        (SELECT COUNT(*) FROM authorization.invitations WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM identity.identity_events WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.customers WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.organizations WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.environments WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.legal_entities WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.tenants WHERE id = $1::uuid)
      )::bigint AS count
    `,
      tenantId,
      closingOperatorId,
    );
    remainingRows += Number(typeOrmRemaining[0]?.count ?? 0);
    if (remainingRows !== 0)
      throw new Error(
        `${remainingRows} tenant-scoped PostgreSQL row(s) remain after deletion`,
      );
    return JSON.stringify({
      outcome: 'VERIFIED_DELETED',
      deletedRows: counts,
      remainingRows: 0,
      retainedAuditTables: [...DELETION_CONTROL_TABLES].sort(),
      retainedClosingOperator: closingOperatorId,
    });
  }

  private async deleteObjectStorage(tenantId: string): Promise<string> {
    const result = await this.objectStorage.deleteTenantObjects(tenantId);
    if (result.remaining !== 0)
      throw new Error(
        `${result.remaining} tenant object(s) remain after object-storage deletion`,
      );
    return JSON.stringify({
      outcome: 'VERIFIED_DELETED',
      deletedObjects: result.deleted,
      remainingObjects: 0,
    });
  }

  private async revokeConnectorState(tenantId: string): Promise<string> {
    const result = await this.prisma.connectorInstance.updateMany({
      where: { tenant_id: tenantId },
      data: { state: 'NOT_CONNECTED', deletedAt: new Date() },
    });
    const remaining = await this.prisma.connectorInstance.count({
      where: { tenant_id: tenantId, deletedAt: null },
    });
    if (remaining !== 0)
      throw new Error(
        `${remaining} active connector instance(s) remain after revocation`,
      );
    return JSON.stringify({
      outcome: 'VERIFIED_DELETED',
      revokedConnectors: result.count,
      remainingActiveConnectors: 0,
    });
  }
}
