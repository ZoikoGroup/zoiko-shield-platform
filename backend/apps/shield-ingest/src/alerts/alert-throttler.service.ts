import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertThrottlerService {
  private readonly logger = new Logger(AlertThrottlerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if alert should be throttled to prevent alert storms
   * ALT-01 Rule: Suppress duplicate alerts within sliding window
   */
  async shouldThrottleAlert(
    tenantId: string,
    ruleId: string,
    entityId: string,
    windowMinutes = 5,
  ): Promise<{ throttled: boolean; existingAlertId?: string }> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentAlert = await this.prisma.alert.findFirst({
      where: {
        tenant_id: tenantId,
        detection_version_id: ruleId,
        affected_assets: { contains: entityId },
        created_at: { gte: windowStart },
      },
    });

    if (recentAlert) {
      this.logger.warn(
        `Throttling duplicate alert for rule '${ruleId}' and entity '${entityId}' (existing alert: ${recentAlert.id})`,
      );
      return { throttled: true, existingAlertId: recentAlert.id };
    }

    return { throttled: false };
  }
}
