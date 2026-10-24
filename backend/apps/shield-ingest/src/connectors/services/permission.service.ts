import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../kafka/kafka.producer.service';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /** Declares the required permission set for an instance (granted starts false until verified). */
  async declareRequired(
    tenantId: string,
    instanceId: string,
    provider: string,
    permissions: string[],
    permissionType = 'READ',
  ) {
    // One INSERT ... ON CONFLICT DO NOTHING: rows that already exist (and
    // may already be verified as granted) are left untouched.
    await this.prisma.connectorPermission.createMany({
      data: permissions.map((permission) => ({
        tenant_id: tenantId,
        instanceId,
        provider,
        permission,
        permissionType,
        granted: false,
      })),
      skipDuplicates: true,
    });
  }

  /** Marks the given set as currently granted; anything previously granted but absent from `grantedNow` is flagged missing (permission drift). */
  async reconcileGranted(
    instanceId: string,
    grantedNow: string[],
  ): Promise<{ newlyMissing: string[] }> {
    const existing = await this.prisma.connectorPermission.findMany({
      where: { instanceId },
    });
    const newlyMissing: string[] = [];
    const grantedIds: string[] = [];
    const notGrantedIds: string[] = [];

    for (const perm of existing) {
      const isGrantedNow = grantedNow.includes(perm.permission);
      if (perm.granted && !isGrantedNow) {
        newlyMissing.push(perm.permission);
      }
      (isGrantedNow ? grantedIds : notGrantedIds).push(perm.id);
    }

    // Two set-based updates (granted / not granted) instead of one per row.
    const verifiedAt = new Date();
    const updates = [
      { ids: grantedIds, granted: true },
      { ids: notGrantedIds, granted: false },
    ]
      .filter(({ ids }) => ids.length > 0)
      .map(({ ids, granted }) =>
        this.prisma.connectorPermission.updateMany({
          where: { id: { in: ids } },
          data: { granted, verifiedAt },
        }),
      );
    if (updates.length > 0) await this.prisma.$transaction(updates);

    if (newlyMissing.length > 0) {
      this.logger.warn(
        `Permission drift detected for instance ${instanceId}: lost ${newlyMissing.join(', ')}`,
      );
      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.CONNECTOR_PERMISSION_CHANGED,
        'connector.permission.drift_detected',
        {
          tenantId: existing[0].tenant_id,
          instanceId,
          lostPermissions: newlyMissing,
        },
      );
    }

    return { newlyMissing };
  }

  async getGranted(instanceId: string): Promise<string[]> {
    const rows = await this.prisma.connectorPermission.findMany({
      where: { instanceId, granted: true },
    });
    return rows.map((r) => r.permission);
  }

  async getMissingRequired(instanceId: string): Promise<string[]> {
    const rows = await this.prisma.connectorPermission.findMany({
      where: { instanceId, granted: false },
    });
    return rows.map((r) => r.permission);
  }
}
