import { Injectable, Logger } from '@nestjs/common';
import { IsISO8601, IsNumber, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class SetBudgetDto {
  @IsString()
  tenantId!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsNumber()
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
    return this.prisma.aiBudget.create({
      data: {
        tenant_id: dto.tenantId,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        budget_amount: dto.budgetAmount,
        status: 'ACTIVE',
      },
    });
  }

  async recordSpend(tenantId: string, amount: number) {
    const now = new Date();
    const budget = await this.prisma.aiBudget.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'ACTIVE',
        period_start: { lte: now },
        period_end: { gte: now },
      },
    });
    if (!budget) {
      return null;
    }

    const newConsumed = Number(budget.consumed_amount) + amount;
    const exhausted = newConsumed >= Number(budget.budget_amount);

    return this.prisma.aiBudget.update({
      where: { id: budget.id },
      data: {
        consumed_amount: newConsumed,
        status: exhausted ? 'EXHAUSTED' : 'ACTIVE',
      },
    });
  }

  /** true = over budget OR no budget configured (fail closed). */
  async isOverBudget(tenantId: string): Promise<boolean> {
    const now = new Date();
    const budget = await this.prisma.aiBudget.findFirst({
      where: {
        tenant_id: tenantId,
        period_start: { lte: now },
        period_end: { gte: now },
      },
      orderBy: { created_at: 'desc' },
    });
    if (!budget) {
      this.logger.warn(
        `AI budget check FAILED CLOSED for tenant '${tenantId}' (no budget configured)`,
      );
      return true;
    }
    return Number(budget.consumed_amount) >= Number(budget.budget_amount);
  }
}
