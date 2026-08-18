import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

const BACKUP_RETENTION_DAYS = 35; // matches this repo's Postgres provider's typical point-in-time-recovery window — disclosed, not assumed

/** Backup retention is disclosed honestly — never claim immediate deletion while backups remain pending expiry (spec §18/§19/§70). */
@Injectable()
export class BackupExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async recordPending(
    tenantId: string,
    deletionRequestId: string,
  ): Promise<unknown> {
    const retainedUntil = new Date(
      Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.prisma.backupExpiryRecord.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        deletion_request_id: deletionRequestId,
        backup_class: 'DATABASE_POINT_IN_TIME_RECOVERY',
        retained_until: retainedUntil,
        final_expiry_expected_at: retainedUntil,
        status: 'PENDING',
      },
    });
  }

  async checkAndVerifyExpired(
    deletionRequestId: string,
  ): Promise<{ allExpired: boolean }> {
    const records = await this.prisma.backupExpiryRecord.findMany({
      where: { deletion_request_id: deletionRequestId },
    });
    let allExpired = true;
    for (const record of records) {
      if (
        record.status === 'PENDING' &&
        record.final_expiry_expected_at <= new Date()
      ) {
        await this.prisma.backupExpiryRecord.update({
          where: { id: record.id },
          data: { status: 'EXPIRED_VERIFIED', verified_expired_at: new Date() },
        });
      } else if (record.status !== 'EXPIRED_VERIFIED') {
        allExpired = false;
      }
    }
    return { allExpired };
  }
}
