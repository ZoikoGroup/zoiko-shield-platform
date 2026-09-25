import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { CryptographicShreddingService } from '../../privacy/cryptographic-shredding.service';
import { DeletionRequestService } from './deletion-request.service';
import { discoverTenantKeyedTables } from '../tenant-keyed-tables';

/** Retries are bounded; an exhausted task stops and waits for a human. */
export const MAX_DELETION_ATTEMPTS = 3;

const NO_STORE_POPULATED = JSON.stringify({
  outcome: 'NOT_APPLICABLE',
  reason: 'STORE_NOT_CONFIGURED_OR_POPULATED',
});

const DELETION_CONTROL_TABLES = new Set([
  'DeletionRequest',
  'DeletionTask',
  'DeletionVerification',
  'DeletionAttestation',
  'TenantOffboardingRun',
  'BackupExpiryRecord',
  'LegalHold',
  // The retention determination is the basis on which the destruction was
  // lawful; erasing it would erase the proof that the gate was honoured.
  'TenantRetentionPolicy',
  'OutboxEvent',
]);

/**
 * Tenant-keyed tables a LATER task owns end to end. The generic authoritative
 * sweep must not take them, or it would destroy the key material before
 * CRYPTO_SHRED can shred it and issue a certificate — a vacuous "0 keys
 * shredded" success instead of real, evidenced destruction.
 */
const TASK_OWNED_TABLES = new Set(['SubjectEncryptionKey']);

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
    private readonly shreddingService: CryptographicShreddingService,
    private readonly deletionRequestService: DeletionRequestService,
  ) {}

  /**
   * One store's worth of destruction, as a durable checkpoint.
   *
   * Reruns are safe and are the normal recovery path: a COMPLETED task is
   * never repeated, a failed one resumes, and retries are bounded so a task
   * that cannot succeed stops for a human instead of looping
   * (ZS-ENG-OFF-DEL-001 decisions 1/4). Destructive work is never rolled
   * back across stores — only re-attempted where it did not finish.
   */
  async executeTask(taskId: string): Promise<void> {
    const task = await this.prisma.deletionTask.findUniqueOrThrow({
      where: { id: taskId },
    });

    // Completed work is a checkpoint, not something to redo.
    if (task.status === 'COMPLETED') return;
    if (task.status === 'ENGINEERING_REVIEW') {
      throw new ConflictException(
        `DeletionTask '${taskId}' exhausted its retries and is held for engineering review — it must be cleared deliberately before running again`,
      );
    }

    // A legal hold may be created after approval, and retention eligibility is
    // re-checked too. Re-evaluate the request at every store boundary so a
    // stale approval can never authorize later work.
    await this.deletionRequestService.assertExecutable(
      task.tenant_id,
      task.deletion_request_id,
    );

    const attempt = task.attempt + 1;
    await this.prisma.deletionTask.update({
      where: { id: task.id },
      data: {
        status: 'RUNNING',
        started_at: task.started_at ?? new Date(),
        attempt,
        last_attempt_at: new Date(),
      },
    });

    try {
      let verificationResult: string;
      switch (task.store_type) {
        case 'POSTGRES_AUTHORITY':
          verificationResult = await this.deleteAuthoritativeRows(
            task.tenant_id,
          );
          break;
        case 'OBJECT_STORAGE':
          verificationResult = await this.purgeObjectStorage(task.tenant_id);
          break;
        case 'CRYPTO_SHRED':
          verificationResult = await this.shredTenantKeys(task.tenant_id);
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
          last_checkpoint: 'STORE_COMPLETE',
          error_code: null,
        },
      });
    } catch (err) {
      const exhausted = attempt >= MAX_DELETION_ATTEMPTS;
      await this.prisma.deletionTask.update({
        where: { id: task.id },
        data: {
          // Not completed — a failed attempt must never look finished.
          status: exhausted ? 'ENGINEERING_REVIEW' : 'FAILED',
          last_checkpoint: 'STORE_INCOMPLETE',
          error_code: (err as Error).message.slice(0, 200),
        },
      });
      // Operational signal: every destructive failure is logged, and an
      // exhausted one is escalated. These are the alerting hooks required by
      // ZS-ENG-OFF-DEL-001 §8; shield-core has no live metrics pipeline yet
      // (PrometheusMetricsService is not registered in any module), so this is
      // a log signal rather than a fabricated metric nothing emits.
      this.logger.warn(
        `DeletionTask ${task.id} (${task.store_type}, tenant ${task.tenant_id}) failed on attempt ${attempt}/${MAX_DELETION_ATTEMPTS}: ${(err as Error).message}`,
      );
      if (exhausted) {
        this.logger.error(
          `DeletionTask ${task.id} (${task.store_type}, tenant ${task.tenant_id}) exhausted ${MAX_DELETION_ATTEMPTS} attempts and is held for engineering review: ${(err as Error).message}`,
        );
      }
      throw err;
    }
  }

  private async deleteAuthoritativeRows(tenantId: string): Promise<string> {
    type ForeignKey = { child_table: string; parent_table: string };
    const candidates = (await discoverTenantKeyedTables(this.prisma))
      .filter(
        ({ table }) =>
          !DELETION_CONTROL_TABLES.has(table) && !TASK_OWNED_TABLES.has(table),
      )
      .map(({ qualified }) => qualified);
    const candidateSet = new Set(candidates);
    const foreignKeys = await this.prisma.$queryRaw<ForeignKey[]>`
      SELECT format('%I.%I', child_namespace.nspname, child.relname) AS child_table,
             format('%I.%I', parent_namespace.nspname, parent.relname) AS parent_table
      FROM pg_constraint constraint_record
      JOIN pg_class child ON child.oid = constraint_record.conrelid
      JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = constraint_record.confrelid
      JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
      WHERE constraint_record.contype = 'f'
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
        // Only catalogue-discovered, identifier-validated names reach SQL.
        if (!candidateSet.has(table)) {
          throw new Error(`Unsafe tenant table identifier '${table}'`);
        }
        counts[table] = await tx.$executeRawUnsafe(
          `DELETE FROM ${table} WHERE tenant_id = $1`,
          tenantId,
        );
      }

      // The identity, authorization and tenant schemas key rows by "tenantId"
      // rather than tenant_id. Cross-tenant principals and
      // global permissions remain; every membership of THIS tenant goes,
      // including the operator closing it (ZS-ENG-OFF-DEL-001 decision 3).
      // Their attribution survives in the retained control tables
      // (requested_by / reviewed_by / issued_by) as a non-authorizing
      // reference — never as access that outlives the tenant.
      counts['"authorization".user_roles'] = await tx.$executeRawUnsafe(
        'DELETE FROM "authorization".user_roles WHERE membership_id IN (SELECT id FROM "authorization".tenant_memberships WHERE "tenantId" = $1::uuid)',
        tenantId,
      );
      counts['"authorization".tenant_memberships'] = await tx.$executeRawUnsafe(
        'DELETE FROM "authorization".tenant_memberships WHERE "tenantId" = $1::uuid',
        tenantId,
      );
      counts['"authorization".invitations'] = await tx.$executeRawUnsafe(
        'DELETE FROM "authorization".invitations WHERE "tenantId" = $1',
        tenantId,
      );
      counts['"authorization".role_permissions'] = await tx.$executeRawUnsafe(
        'DELETE FROM "authorization".role_permissions WHERE role_id IN (SELECT role.id FROM "authorization".roles role WHERE role."tenantId" = $1::uuid AND NOT EXISTS (SELECT 1 FROM "authorization".user_roles user_role WHERE user_role.role_id = role.id))',
        tenantId,
      );
      counts['"authorization".roles'] = await tx.$executeRawUnsafe(
        'DELETE FROM "authorization".roles role WHERE role."tenantId" = $1::uuid AND NOT EXISTS (SELECT 1 FROM "authorization".user_roles user_role WHERE user_role.role_id = role.id)',
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
        `SELECT COUNT(*)::bigint AS count FROM ${table} WHERE tenant_id = $1`,
        tenantId,
      );
      remainingRows += Number(rows[0]?.count ?? 0);
    }
    const camelKeyedRemaining = await this.prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `
      SELECT (
        (SELECT COUNT(*) FROM "authorization".tenant_memberships WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM "authorization".roles WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM "authorization".invitations WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM identity.identity_events WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.customers WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.organizations WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.environments WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.legal_entities WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM tenant.tenants WHERE id = $1::uuid)
      )::bigint AS count
    `,
      tenantId,
    );
    remainingRows += Number(camelKeyedRemaining[0]?.count ?? 0);
    if (remainingRows !== 0)
      throw new Error(
        `${remainingRows} tenant-scoped PostgreSQL row(s) remain after deletion`,
      );
    return JSON.stringify({
      outcome: 'VERIFIED_DELETED',
      deletedRows: counts,
      remainingRows: 0,
      retainedAuditTables: [...DELETION_CONTROL_TABLES].sort(),
      deferredToLaterTask: [...TASK_OWNED_TABLES].sort(),
    });
  }

  /**
   * Evidence bytes live under Object Lock in COMPLIANCE mode, so versions
   * inside their retain-until window cannot be destroyed by anyone. Deleting
   * them makes them unreachable, not gone. Rather than report that as a
   * verified deletion, this records what physically survives and until when;
   * the CRYPTO_SHRED task removes the ability to read it, and the attestation
   * discloses the expiry window.
   */
  private async purgeObjectStorage(tenantId: string): Promise<string> {
    const result = await this.objectStorage.purgeTenantObjects(tenantId);
    if (result.wormRetained === 0) {
      return JSON.stringify({
        outcome: 'VERIFIED_DELETED',
        deletedObjects: result.permanentlyDeleted,
        remainingObjects: 0,
      });
    }
    return JSON.stringify({
      outcome: 'LOGICALLY_DELETED_PENDING_PHYSICAL_EXPIRY',
      permanentlyDeletedVersions: result.permanentlyDeleted,
      deleteMarkersPlaced: result.deleteMarkersPlaced,
      wormProtectedVersions: result.wormRetained,
      physicalExpiryAt: result.physicalExpiryAt,
      reason:
        'Object Lock (COMPLIANCE) forbids destroying these versions before their retain-until date. Readability is removed by tenant key shredding; the physical expiry window is disclosed rather than claimed as deleted.',
    });
  }

  private async shredTenantKeys(tenantId: string): Promise<string> {
    const { certificates, remainingActiveKeys } =
      await this.shreddingService.shredAllTenantKeys(tenantId);
    if (remainingActiveKeys !== 0) {
      throw new Error(
        `${remainingActiveKeys} active subject encryption key(s) remain after tenant key shredding`,
      );
    }
    // Shredded first, then removed: the certificates live on in this task's
    // retained verification_result, so destroying the rows loses no evidence.
    const removedKeyRows = await this.prisma.subjectEncryptionKey.deleteMany({
      where: { tenant_id: tenantId },
    });
    const remainingKeyRows = await this.prisma.subjectEncryptionKey.count({
      where: { tenant_id: tenantId },
    });
    if (remainingKeyRows !== 0) {
      throw new Error(
        `${remainingKeyRows} subject encryption key row(s) remain after tenant key shredding`,
      );
    }
    return JSON.stringify({
      outcome: 'VERIFIED_DELETED',
      shreddedSubjectKeys: certificates.length,
      removedKeyRows: removedKeyRows.count,
      remainingActiveKeys: 0,
      proofOfObliterationDigests: certificates.map(
        (certificate) => certificate.proofOfObliterationDigest,
      ),
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
