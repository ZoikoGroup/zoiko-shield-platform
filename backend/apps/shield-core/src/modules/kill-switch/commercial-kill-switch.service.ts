import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsArray, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export const KILL_SWITCH_ACTIONS = [
  'QUOTE_APPROVAL',
  'ORDER_CREATION',
  'ENTITLEMENT_EXPANSION',
  'USAGE_BILLING_EXPORT',
  'INVOICE_FINALIZATION',
  'AUTOMATIC_CHARGING',
] as const;
export type KillSwitchAction = (typeof KILL_SWITCH_ACTIONS)[number];

const SCOPE_TYPES = ['GLOBAL', 'REGION', 'CATALOG', 'METER', 'CUSTOMER', 'CHANNEL'] as const;

export class ActivateKillSwitchDto {
  @IsIn(SCOPE_TYPES)
  scopeType!: (typeof SCOPE_TYPES)[number];

  @IsOptional()
  @IsString()
  scopeValue?: string;

  @IsArray()
  blockedActions!: KillSwitchAction[];

  @IsString()
  reason!: string;

  @IsString()
  activatedBy!: string;

  @IsOptional()
  @IsISO8601()
  reviewAt?: Date;
}

/**
 * ZS-COM-BILL-001 Part 28 / OPS-01: a privileged, scoped, auditable
 * control over commercial *actions only*. Deliberately has no import of
 * and no code path into detection/response/evidence modules — it cannot
 * disable security monitoring or touch evidence, structurally, not just
 * by convention. Kept entirely separate from any security-response kill
 * switch.
 */
@Injectable()
export class CommercialKillSwitchService {
  private readonly logger = new Logger(CommercialKillSwitchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async activate(dto: ActivateKillSwitchDto) {
    if (dto.scopeType !== 'GLOBAL' && !dto.scopeValue) {
      throw new ConflictException(`scopeValue is required for scopeType '${dto.scopeType}'`);
    }

    this.logger.warn(
      `Commercial kill switch ACTIVATED: scope=${dto.scopeType}/${dto.scopeValue || '*'} actions=${dto.blockedActions.join(',')} by=${dto.activatedBy}`,
    );

    return this.prisma.commercialKillSwitch.create({
      data: {
        scope_type: dto.scopeType,
        scope_value: dto.scopeValue,
        blocked_actions: JSON.stringify(dto.blockedActions),
        reason: dto.reason,
        activated_by: dto.activatedBy,
        review_at: dto.reviewAt,
        status: 'ACTIVE',
      },
    });
  }

  async deactivate(id: string, deactivatedBy: string) {
    const killSwitch = await this.prisma.commercialKillSwitch.findUnique({ where: { id } });
    if (!killSwitch) {
      throw new NotFoundException(`Kill switch '${id}' not found`);
    }
    if (killSwitch.status !== 'ACTIVE') {
      throw new ConflictException(`Kill switch '${id}' is '${killSwitch.status}', not ACTIVE`);
    }

    return this.prisma.commercialKillSwitch.update({
      where: { id },
      data: { status: 'DEACTIVATED', deactivated_by: deactivatedBy, deactivated_at: new Date() },
    });
  }

  /**
   * Checked at the top of any sensitive commercial mutation. Returns true
   * (blocked) if ANY active switch covers this action at GLOBAL scope or
   * at the given scope/value.
   */
  async isBlocked(action: KillSwitchAction, scopeType?: string, scopeValue?: string): Promise<boolean> {
    const activeSwitches = await this.prisma.commercialKillSwitch.findMany({ where: { status: 'ACTIVE' } });

    for (const killSwitch of activeSwitches) {
      const blockedActions: string[] = JSON.parse(killSwitch.blocked_actions);
      if (!blockedActions.includes(action)) {
        continue;
      }
      if (killSwitch.scope_type === 'GLOBAL') {
        return true;
      }
      if (killSwitch.scope_type === scopeType && killSwitch.scope_value === scopeValue) {
        return true;
      }
    }
    return false;
  }

  async assertNotBlocked(action: KillSwitchAction, scopeType?: string, scopeValue?: string) {
    const blocked = await this.isBlocked(action, scopeType, scopeValue);
    if (blocked) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_KILL_SWITCH_ACTIVE',
        message: `Action '${action}' is currently blocked by an active commercial kill switch`,
      });
    }
  }
}
