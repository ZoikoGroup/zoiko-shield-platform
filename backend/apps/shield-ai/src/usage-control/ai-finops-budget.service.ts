import { Injectable, Logger } from '@nestjs/common';

export interface TenantBudgetCap {
  tenantId: string;
  monthlyLimitUsd: number;
  currentSpendUsd: number;
  monthlyTokenLimit: number;
  currentTokensUsed: number;
  maxCallsPerMinute: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remainingBudgetUsd: number;
  remainingTokens: number;
  reason?: string;
}

export interface UsageRecord {
  tenantId: string;
  useCase: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: Date;
}

@Injectable()
export class AiFinOpsBudgetService {
  private readonly logger = new Logger(AiFinOpsBudgetService.name);

  // In-memory tenant budget state with sensible defaults
  private readonly tenantBudgets = new Map<string, TenantBudgetCap>();
  private readonly usageHistory: UsageRecord[] = [];
  private readonly callTimestamps = new Map<string, number[]>();

  private getOrCreateBudget(tenantId: string): TenantBudgetCap {
    let budget = this.tenantBudgets.get(tenantId);
    if (!budget) {
      budget = {
        tenantId,
        monthlyLimitUsd: 500.0, // Default $500/mo cap (§22)
        currentSpendUsd: 0.0,
        monthlyTokenLimit: 50_000_000,
        currentTokensUsed: 0,
        maxCallsPerMinute: 60, // Denial-of-wallet loop limit
      };
      this.tenantBudgets.set(tenantId, budget);
    }
    return budget;
  }

  setTenantBudgetCap(
    tenantId: string,
    updates: Partial<TenantBudgetCap>,
  ): void {
    const existing = this.getOrCreateBudget(tenantId);
    Object.assign(existing, updates);
    this.tenantBudgets.set(tenantId, existing);
  }

  checkBudget(
    tenantId: string,
    estimatedCostUsd: number = 0.05,
    estimatedTokens: number = 2000,
  ): BudgetCheckResult {
    const budget = this.getOrCreateBudget(tenantId);
    const now = Date.now();

    // 1. Sliding Window Rate Check (Denial of Wallet Defense)
    const timestamps = this.callTimestamps.get(tenantId) || [];
    const recentCalls = timestamps.filter((ts) => now - ts < 60_000);
    this.callTimestamps.set(tenantId, recentCalls);

    if (recentCalls.length >= budget.maxCallsPerMinute) {
      return {
        allowed: false,
        remainingBudgetUsd: Math.max(
          0,
          budget.monthlyLimitUsd - budget.currentSpendUsd,
        ),
        remainingTokens: Math.max(
          0,
          budget.monthlyTokenLimit - budget.currentTokensUsed,
        ),
        reason: `Rate ceiling exceeded: ${recentCalls.length} calls in past 60s (limit: ${budget.maxCallsPerMinute}/min). Denial-of-wallet loop defense triggered.`,
      };
    }

    // 2. Spend Limit Check
    if (budget.currentSpendUsd + estimatedCostUsd > budget.monthlyLimitUsd) {
      return {
        allowed: false,
        remainingBudgetUsd: Math.max(
          0,
          budget.monthlyLimitUsd - budget.currentSpendUsd,
        ),
        remainingTokens: Math.max(
          0,
          budget.monthlyTokenLimit - budget.currentTokensUsed,
        ),
        reason: `Monthly AI budget cap exceeded: spend is $${budget.currentSpendUsd.toFixed(2)} (limit: $${budget.monthlyLimitUsd.toFixed(2)})`,
      };
    }

    // 3. Token Limit Check
    if (budget.currentTokensUsed + estimatedTokens > budget.monthlyTokenLimit) {
      return {
        allowed: false,
        remainingBudgetUsd: Math.max(
          0,
          budget.monthlyLimitUsd - budget.currentSpendUsd,
        ),
        remainingTokens: Math.max(
          0,
          budget.monthlyTokenLimit - budget.currentTokensUsed,
        ),
        reason: `Monthly token limit exceeded: used ${budget.currentTokensUsed} (limit: ${budget.monthlyTokenLimit})`,
      };
    }

    return {
      allowed: true,
      remainingBudgetUsd:
        budget.monthlyLimitUsd - (budget.currentSpendUsd + estimatedCostUsd),
      remainingTokens:
        budget.monthlyTokenLimit - (budget.currentTokensUsed + estimatedTokens),
    };
  }

  recordUsage(params: {
    tenantId: string;
    useCase: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  }): void {
    const budget = this.getOrCreateBudget(params.tenantId);
    const totalTokens = params.promptTokens + params.completionTokens;

    budget.currentSpendUsd += params.costUsd;
    budget.currentTokensUsed += totalTokens;

    const timestamps = this.callTimestamps.get(params.tenantId) || [];
    timestamps.push(Date.now());
    this.callTimestamps.set(params.tenantId, timestamps);

    const record: UsageRecord = {
      tenantId: params.tenantId,
      useCase: params.useCase,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens,
      costUsd: params.costUsd,
      timestamp: new Date(),
    };

    this.usageHistory.push(record);

    this.logger.log(
      `Recorded AI usage for tenant '${params.tenantId}': $${params.costUsd.toFixed(4)} (${totalTokens} tokens, UseCase: ${params.useCase})`,
    );
  }

  getTenantUsageSummary(tenantId: string): {
    budget: TenantBudgetCap;
    recentCalls: number;
    totalUsageRecords: number;
  } {
    const budget = this.getOrCreateBudget(tenantId);
    const now = Date.now();
    const timestamps = this.callTimestamps.get(tenantId) || [];
    const recentCalls = timestamps.filter((ts) => now - ts < 60_000).length;
    const records = this.usageHistory.filter((r) => r.tenantId === tenantId);

    return {
      budget,
      recentCalls,
      totalUsageRecords: records.length,
    };
  }
}
