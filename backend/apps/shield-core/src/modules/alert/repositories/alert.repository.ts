import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByDetectionMatch(tenantId: string, detectionMatchId: string) {
    return this.prisma.alert.findUnique({
      where: { tenant_id_detection_match_id: { tenant_id: tenantId, detection_match_id: detectionMatchId } },
    });
  }

  findById(alertId: string) {
    return this.prisma.alert.findUnique({ where: { id: alertId } });
  }
}
