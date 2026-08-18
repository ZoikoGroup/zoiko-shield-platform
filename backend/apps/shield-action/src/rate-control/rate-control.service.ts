import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_MAXIMUM = 10;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1h

function parseWindowMs(window: string): number {
  const match = /^(\d+)([smh])$/.exec(window);
  if (!match) return DEFAULT_WINDOW_MS;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
  return value * multiplier;
}

@Injectable()
export class RateControlService {
  constructor(private readonly prisma: PrismaService) {}

  async checkCeiling(params: {
    tenantId: string;
    actionType: string;
    targetClass?: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const targetClass = params.targetClass ?? 'DEFAULT';
    const limit = await this.prisma.actionRateLimit.findFirst({
      where: {
        tenant_id: params.tenantId,
        action_type: params.actionType,
        target_class: targetClass,
      },
    });

    const maximum = limit?.maximum ?? DEFAULT_MAXIMUM;
    const windowMs = parseWindowMs(limit?.window ?? '1h');
    const windowStart = new Date(Date.now() - windowMs);

    const count = await this.prisma.actionCommand.count({
      where: {
        tenant_id: params.tenantId,
        action_type: params.actionType,
        created_at: { gte: windowStart },
      },
    });

    if (count >= maximum) {
      return {
        allowed: false,
        reason: `Rate ceiling exceeded: ${count}/${maximum} for '${params.actionType}' in the current window`,
      };
    }
    return { allowed: true };
  }
}
