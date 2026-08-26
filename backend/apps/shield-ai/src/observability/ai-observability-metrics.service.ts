import { Injectable, Logger } from '@nestjs/common';

export interface AiMetricsSnapshot {
  timestamp: Date;
  ai_request_eligible_rate: number; // 0.0 - 1.0
  ai_grounded_claim_rate: number; // 0.0 - 1.0
  ai_critical_failure_count: number;
  ai_human_override_rate: number; // 0.0 - 1.0
  ai_fallback_success_rate: number; // 0.0 - 1.0
  ai_agent_budget_breach: number;
  ai_tool_authorization_denial: number;
  ai_retrieval_citation_failure: number;
  ai_model_route_latency_ms: number;
  ai_cost_per_outcome_usd: number;
  ai_provider_concentration: Record<string, number>;
  ai_drift_alert: number;
  ai_kill_switch_test: number;
  ai_audit_trace_complete_rate: number; // 0.0 - 1.0
}

/**
 * ZS-ENG-AI-001 §22: Observability, SLOs, Capacity and Cost Controls.
 * Tracks and exposes the 14 mandatory AI governance metrics.
 */
@Injectable()
export class AiObservabilityMetricsService {
  private readonly logger = new Logger(AiObservabilityMetricsService.name);

  private totalRequests = 0;
  private eligibleRequests = 0;
  private totalClaims = 0;
  private groundedClaims = 0;
  private criticalFailures = 0;
  private totalHumanReviews = 0;
  private humanOverrides = 0;
  private totalFallbacks = 0;
  private successfulFallbacks = 0;
  private budgetBreaches = 0;
  private toolDenials = 0;
  private citationFailures = 0;
  private totalLatenciesMs = 0;
  private totalOutcomes = 0;
  private totalCostUsd = 0;
  private driftAlerts = 0;
  private killSwitchTests = 0;
  private totalDecisions = 0;
  private completeTraces = 0;
  private readonly providerCallCounts = new Map<string, number>();

  recordRequest(eligible: boolean): void {
    this.totalRequests += 1;
    if (eligible) this.eligibleRequests += 1;
  }

  recordGrounding(
    totalClaimsInDoc: number,
    supportedClaimsInDoc: number,
  ): void {
    this.totalClaims += totalClaimsInDoc;
    this.groundedClaims += supportedClaimsInDoc;
  }

  recordCriticalFailure(reason: string): void {
    this.criticalFailures += 1;
    this.logger.error(`CRITICAL AI FAILURE RECORDED: ${reason}`);
  }

  recordHumanReview(action: 'APPROVED' | 'MODIFIED' | 'REJECTED'): void {
    this.totalHumanReviews += 1;
    if (action === 'MODIFIED' || action === 'REJECTED') {
      this.humanOverrides += 1;
    }
  }

  recordFallback(success: boolean): void {
    this.totalFallbacks += 1;
    if (success) this.successfulFallbacks += 1;
  }

  recordAgentRun(breached: boolean): void {
    if (breached) this.budgetBreaches += 1;
  }

  recordToolDenial(): void {
    this.toolDenials += 1;
  }

  recordCitationFailure(): void {
    this.citationFailures += 1;
  }

  recordCallLatency(latencyMs: number, provider: string): void {
    this.totalLatenciesMs += latencyMs;
    const current = this.providerCallCounts.get(provider) || 0;
    this.providerCallCounts.set(provider, current + 1);
  }

  recordOutcomeCost(costUsd: number): void {
    this.totalOutcomes += 1;
    this.totalCostUsd += costUsd;
  }

  recordDriftAlert(): void {
    this.driftAlerts += 1;
  }

  recordKillSwitchTest(): void {
    this.killSwitchTests += 1;
  }

  recordDecisionTrace(hasCompleteAuditTrace: boolean): void {
    this.totalDecisions += 1;
    if (hasCompleteAuditTrace) this.completeTraces += 1;
  }

  getMetricsSnapshot(): AiMetricsSnapshot {
    const providerConcentration: Record<string, number> = {};
    let totalProviderCalls = 0;
    for (const count of this.providerCallCounts.values()) {
      totalProviderCalls += count;
    }
    for (const [provider, count] of this.providerCallCounts.entries()) {
      providerConcentration[provider] =
        totalProviderCalls > 0
          ? Number((count / totalProviderCalls).toFixed(2))
          : 0;
    }

    return {
      timestamp: new Date(),
      ai_request_eligible_rate:
        this.totalRequests > 0
          ? Number((this.eligibleRequests / this.totalRequests).toFixed(2))
          : 1.0,
      ai_grounded_claim_rate:
        this.totalClaims > 0
          ? Number((this.groundedClaims / this.totalClaims).toFixed(2))
          : 1.0,
      ai_critical_failure_count: this.criticalFailures,
      ai_human_override_rate:
        this.totalHumanReviews > 0
          ? Number((this.humanOverrides / this.totalHumanReviews).toFixed(2))
          : 0.0,
      ai_fallback_success_rate:
        this.totalFallbacks > 0
          ? Number((this.successfulFallbacks / this.totalFallbacks).toFixed(2))
          : 1.0,
      ai_agent_budget_breach: this.budgetBreaches,
      ai_tool_authorization_denial: this.toolDenials,
      ai_retrieval_citation_failure: this.citationFailures,
      ai_model_route_latency_ms:
        this.totalRequests > 0
          ? Math.round(this.totalLatenciesMs / Math.max(1, this.totalRequests))
          : 0,
      ai_cost_per_outcome_usd:
        this.totalOutcomes > 0
          ? Number((this.totalCostUsd / this.totalOutcomes).toFixed(4))
          : 0.0,
      ai_provider_concentration: providerConcentration,
      ai_drift_alert: this.driftAlerts,
      ai_kill_switch_test: this.killSwitchTests,
      ai_audit_trace_complete_rate:
        this.totalDecisions > 0
          ? Number((this.completeTraces / this.totalDecisions).toFixed(2))
          : 1.0,
    };
  }
}
