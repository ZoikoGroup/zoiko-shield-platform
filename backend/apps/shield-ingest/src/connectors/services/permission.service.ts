import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService, CANONICAL_TOPICS } from '../../kafka/kafka.producer.service';

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
    for (const permission of permissions) {
      await this.prisma.connectorPermission.upsert({
        where: { instanceId_permission: { instanceId, permission } },
        update: {},
        create: {
          tenant_id: tenantId,
          instanceId,
          provider,
          permission,
          permissionType,
          granted: false,
        },
      });
    }
  }

  /** Marks the given set as currently granted; anything previously granted but absent from `grantedNow` is flagged missing (permission drift). */
  async reconcileGranted(instanceId: string, grantedNow: string[]): Promise<{ newlyMissing: string[] }> {
    const existing = await this.prisma.connectorPermission.findMany({ where: { instanceId } });
    const newlyMissing: string[] = [];

    for (const perm of existing) {
      const isGrantedNow = grantedNow.includes(perm.permission);
      if (perm.granted && !isGrantedNow) {
        newlyMissing.push(perm.permission);
      }
      await this.prisma.connectorPermission.update({
        where: { id: perm.id },
        data: { granted: isGrantedNow, verifiedAt: new Date() },
      });
    }

    if (newlyMissing.length > 0) {
      this.logger.warn(`Permission drift detected for instance ${instanceId}: lost ${newlyMissing.join(', ')}`);
      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.CONNECTOR_PERMISSION_CHANGED,
        'connector.permission.drift_detected',
        { tenantId: existing[0].tenant_id, instanceId, lostPermissions: newlyMissing },
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
