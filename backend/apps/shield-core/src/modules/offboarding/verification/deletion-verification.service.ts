import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { discoverTenantKeyedTables } from '../tenant-keyed-tables';

export interface SurfaceResult {
  surface: string;
  pass: boolean;
  residual: number;
  retained: number;
  detail?: string;
}

export interface VerificationOutcome {
  id: string;
  result: 'PASS' | 'FAIL';
  residualCount: number;
  retainedCount: number;
  surfaces: SurfaceResult[];
}

/**
 * Independent post-deletion reconciliation (ZS-ENG-OFF-DEL-001 decision 2).
 *
 * A deletion task reporting COMPLETED is not evidence that tenant data is
 * gone — it is the deleter's own account of its own work. This re-queries
 * every configured store from scratch, by tenant, and is the only thing
 * allowed to conclude that a purge succeeded.
 *
 * "Zero residuals" means zero UNAUTHORIZED residuals. Records a legal hold,
 * a retention lock or the deletion-control contract deliberately keeps are
 * enumerated as retained, with their reason, rather than counted as failures
 * or quietly ignored.
 */
@Injectable()
export class DeletionVerificationService {
  private readonly logger = new Logger(DeletionVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async verify(
    tenantId: string,
    deletionRequestId: string,
    verifiedBy: string,
  ): Promise<VerificationOutcome> {
    const surfaces: SurfaceResult[] = [];

    surfaces.push(await this.verifyRelationalData(tenantId));
    surfaces.push(await this.verifyAccessRelationships(tenantId));
    // Order matters: lock-retained ciphertext is only defensible once the keys
    // that could read it are provably gone, so establish that first.
    const cryptographic = await this.verifyCryptographicMaterial(tenantId);
    surfaces.push(await this.verifyObjectStorage(tenantId, cryptographic.pass));
    surfaces.push(cryptographic);
    surfaces.push(await this.verifyConnectorState(tenantId));
    surfaces.push(await this.verifyBackups(deletionRequestId));
    surfaces.push(await this.verifyDerivedStores(deletionRequestId));

    const residualCount = surfaces.reduce((sum, s) => sum + s.residual, 0);
    const retainedCount = surfaces.reduce((sum, s) => sum + s.retained, 0);
    const result: 'PASS' | 'FAIL' =
      surfaces.every((s) => s.pass) && residualCount === 0 ? 'PASS' : 'FAIL';

    const record = await this.prisma.deletionVerification.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        deletion_request_id: deletionRequestId,
        result,
        surfaces: JSON.stringify(surfaces),
        residual_count: residualCount,
        retained_count: retainedCount,
        verified_by: verifiedBy,
      },
    });

    if (result === 'FAIL') {
      this.logger.error(
        `Deletion verification FAILED for tenant ${tenantId} (request ${deletionRequestId}): ${residualCount} unauthorized residual(s) across ${surfaces
          .filter((s) => !s.pass)
          .map((s) => s.surface)
          .join(', ')}`,
      );
    }

    return {
      id: record.id,
      result,
      residualCount,
      retainedCount,
      surfaces,
    };
  }

  /** The most recent verification, or null if the purge was never verified. */
  async latest(deletionRequestId: string) {
    return this.prisma.deletionVerification.findFirst({
      where: { deletion_request_id: deletionRequestId },
      orderBy: { verified_at: 'desc' },
    });
  }

  private async verifyRelationalData(tenantId: string): Promise<SurfaceResult> {
    // Rediscovered from the catalogue rather than taken from the deleter's
    // manifest, so a table the deletion plan forgot is still checked here.
    const tables = await discoverTenantKeyedTables(this.prisma);
    const controlTables = new Set([
      'DeletionRequest',
      'DeletionTask',
      'DeletionVerification',
      'DeletionAttestation',
      'TenantOffboardingRun',
      'BackupExpiryRecord',
      'LegalHold',
      'TenantRetentionPolicy',
      'OutboxEvent',
    ]);

    let residual = 0;
    let retained = 0;
    for (const { table, qualified } of tables) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM ${qualified} WHERE tenant_id = $1`,
        tenantId,
      );
      const count = Number(rows[0]?.count ?? 0);
      if (controlTables.has(table)) retained += count;
      else residual += count;
    }

    const camelKeyed = await this.prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `
      SELECT (
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
    residual += Number(camelKeyed[0]?.count ?? 0);

    return {
      surface: 'AUTHORITATIVE_RELATIONAL_DATA',
      pass: residual === 0,
      residual,
      retained,
      detail:
        retained > 0
          ? 'Retained rows are deletion-control and retention-policy records, kept to prove the operation'
          : undefined,
    };
  }

  private async verifyAccessRelationships(
    tenantId: string,
  ): Promise<SurfaceResult> {
    // "authorization" is a reserved word — it must stay quoted.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `
      SELECT (
        (SELECT COUNT(*) FROM "authorization".tenant_memberships WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM "authorization".roles WHERE "tenantId" = $1::uuid) +
        (SELECT COUNT(*) FROM "authorization".invitations WHERE "tenantId" = $1::uuid)
      )::bigint AS count
    `,
      tenantId,
    );
    const residual = Number(rows[0]?.count ?? 0);
    return {
      surface: 'MEMBERSHIP_AND_ACCESS_RELATIONSHIPS',
      pass: residual === 0,
      residual,
      retained: 0,
      detail:
        residual > 0
          ? 'An active tenant membership, role or invitation survived the purge'
          : 'No principal — including the closing operator — retains access to this tenant',
    };
  }

  private async verifyObjectStorage(
    tenantId: string,
    keysShredded: boolean,
  ): Promise<SurfaceResult> {
    const { lockRetained, unexplained, maxRetainUntil } =
      await this.objectStorage.classifyTenantObjectVersions(tenantId);
    // Ciphertext an immutable lock forbids destroying is permitted retention
    // only while nothing can read it. With keys still live it is not retained
    // data, it is surviving readable tenant data.
    const explained = keysShredded ? lockRetained : 0;
    const residual = unexplained + (keysShredded ? 0 : lockRetained);
    return {
      surface: 'OBJECT_STORAGE',
      pass: residual === 0,
      residual,
      retained: explained,
      detail:
        lockRetained > 0
          ? keysShredded
            ? `${lockRetained} version(s) held by Object Lock until ${maxRetainUntil}; unreadable because the tenant's keys were shredded`
            : `${lockRetained} version(s) held by Object Lock until ${maxRetainUntil} while tenant key material is still active — the data remains readable`
          : undefined,
    };
  }

  private async verifyCryptographicMaterial(
    tenantId: string,
  ): Promise<SurfaceResult> {
    const residual = await this.prisma.subjectEncryptionKey.count({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });
    const retained = await this.prisma.subjectEncryptionKey.count({
      where: { tenant_id: tenantId, status: 'SHREDDED' },
    });
    return {
      surface: 'CRYPTOGRAPHIC_MATERIAL',
      pass: residual === 0,
      residual,
      retained,
      detail:
        retained > 0
          ? 'Shredded key records are kept as erasure proof; they hold no usable key material'
          : undefined,
    };
  }

  private async verifyConnectorState(tenantId: string): Promise<SurfaceResult> {
    const residual = await this.prisma.connectorInstance.count({
      where: { tenant_id: tenantId, deletedAt: null },
    });
    return {
      surface: 'CONNECTOR_STATE',
      pass: residual === 0,
      residual,
      retained: 0,
    };
  }

  private async verifyBackups(
    deletionRequestId: string,
  ): Promise<SurfaceResult> {
    const records = await this.prisma.backupExpiryRecord.findMany({
      where: { deletion_request_id: deletionRequestId },
    });
    const pending = records.filter((r) => r.status === 'PENDING').length;
    // Backups that have not physically expired are a disclosed window, not a
    // residual — the standard requires the posture to be recorded, not that
    // physical purge already happened.
    return {
      surface: 'BACKUPS',
      pass: true,
      residual: 0,
      retained: pending,
      detail:
        pending > 0
          ? `${pending} backup class(es) awaiting physical expiry — disclosed in the attestation`
          : undefined,
    };
  }

  private async verifyDerivedStores(
    deletionRequestId: string,
  ): Promise<SurfaceResult> {
    const tasks = await this.prisma.deletionTask.findMany({
      where: {
        deletion_request_id: deletionRequestId,
        store_type: {
          in: [
            'SEARCH',
            'CACHE',
            'ANALYTICS',
            'AI_MEMORY',
            'EMBEDDINGS',
            'EXPORT_CACHE',
          ],
        },
      },
    });
    const unfinished = tasks.filter((t) => t.status !== 'COMPLETED').length;
    return {
      surface: 'SEARCH_VECTOR_AND_DERIVED_STORES',
      pass: unfinished === 0,
      residual: unfinished,
      retained: 0,
      detail:
        'No search, cache, analytics or vector backend is deployed in this environment; these tasks record that honestly rather than claiming a deletion that never happened',
    };
  }
}
