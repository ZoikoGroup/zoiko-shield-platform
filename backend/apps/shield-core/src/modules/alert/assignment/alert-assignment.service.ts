import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AlertAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Assigns an alert to an analyst or queue, recording the change (spec §7 — visible in the timeline via the AlertAssignment row itself). */
  async assign(params: { tenantId: string; alertId: string; principalId?: string; queueId?: string; assignedBy: string; reason?: string }) {
    const alert = await this.prisma.alert.findUnique({ where: { id: params.alertId } });
    if (!alert || alert.tenant_id !== params.tenantId) {
      throw new NotFoundException(`Alert '${params.alertId}' not found`);
    }

    const [assignment] = await this.prisma.$transaction([
      this.prisma.alertAssignment.create({
        data: {
          tenant_id: params.tenantId,
          alert_id: params.alertId,
          principal_id: params.principalId,
          queue_id: params.queueId,
          assigned_by: params.assignedBy,
          reason: params.reason,
        },
      }),
      this.prisma.alert.update({
        where: { id: params.alertId },
        data: { assigned_to: params.principalId, assigned_queue: params.queueId },
      }),
    ]);

    return assignment;
  }

  async history(tenantId: string, alertId: string) {
    return this.prisma.alertAssignment.findMany({
      where: { tenant_id: tenantId, alert_id: alertId },
      orderBy: { assigned_at: 'desc' },
    });
  }
}
