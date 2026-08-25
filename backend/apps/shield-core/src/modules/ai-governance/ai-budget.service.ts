import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { IsISO8601, IsNumber, IsPositive, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class SetBudgetDto {
  @IsString()
  tenantId!: string;

  @IsString()
  environmentId!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsNumber()
  @IsPositive()
  budgetAmount!: number;
}

/**
 * ZS-COM-BILL-001 AI-01: tenant AI budget/capacity controls. No budget on
 * record is treated as "cannot verify headroom" — conservative, fail
 * closed, rather than assuming unlimited spend is fine.
 */
@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async setBudget(dto: SetBudgetDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException('periodEnd must be after periodStart');
    }
    const overlapping = await this.prisma.aiBudget.findFirst({
      where: {
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId,
        status: 'ACTIVE',
        period_start: { lte: periodEnd },
        period_end: { gte: periodStart },
      },
    });
    if (overlapping) {
      throw new ConflictException(
        'An ACTIVE AI budget already overlaps the requested period',
      );
    }
    return this.prisma.aiBudget.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId,
        period_start: periodStart,
        period_end: periodEnd,
        budget_amount: dto.budgetAmount,
        status: 'ACTIVE',
      },
    });
  }

  async recordSpend(tenantId: string, environmentId: string, amount: number) {
    if (amount < 0) throw new BadRequestException('amount cannot be negative');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-budget:${tenantId}:${environmentId}`})::bigint)`;
      }
      const budget = await tx.aiBudget.findFirst({
        where: {
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'ACTIVE',
          period_start: { lte: now },
          period_end: { gte: now },
        },
      });
      if (!budget) return null;
      const newConsumed = Number(budget.consumed_amount) + amount;
      const exhausted = newConsumed >= Number(budget.budget_amount);
      return tx.aiBudget.update({
        where: { id: budget.id },
        data: {
          consumed_amount: newConsumed,
          status: exhausted ? 'EXHAUSTED' : 'ACTIVE',
        },
      });
    });
  }

  /** true = over budget OR no budget configured (fail closed). */
  async isOverBudget(
    tenantId: string,
    environmentId: string,
  ): Promise<boolean> {
    const now = new Date();
    const budget = await this.prisma.aiBudget.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        period_start: { lte: now },
        period_end: { gte: now },
      },
      orderBy: { created_at: 'desc' },
    });
    if (!budget) {
      this.logger.warn(
        `AI budget check FAILED CLOSED for tenant '${tenantId}' environment '${environmentId}' (no budget configured)`,
      );
      return true;
    }
    return Number(budget.consumed_amount) >= Number(budget.budget_amount);
  }
}
