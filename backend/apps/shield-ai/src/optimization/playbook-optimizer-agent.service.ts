import { Injectable, Logger } from '@nestjs/common';

export interface ActionExecutionMetric {
  actionId: string;
  actionType: string;
  dependsOn: string[];
  averageDurationMs: number;
  failureRate: number;
  isIdempotent: boolean;
}

export interface PlaybookExecutionTrace {
  playbookId: string;
  tenantId: string;
  totalDurationMs: number;
  actions: ActionExecutionMetric[];
}

export interface OptimizationRecommendation {
  type: 'PARALLELIZE_ACTIONS' | 'ADJUST_TIMEOUT' | 'CACHED_CONTEXT_REUSE';
  description: string;
  targetActionIds: string[];
  estimatedSpeedupMs: number;
}

export interface PlaybookOptimizationReport {
  playbookId: string;
  tenantId: string;
  originalAverageDurationMs: number;
  optimizedEstimatedDurationMs: number;
  predictedMttrReductionPercentage: number;
  criticalPathBottlenecks: string[];
  recommendations: OptimizationRecommendation[];
  optimizedDagStructure: Array<{ phase: number; parallelActions: string[] }>;
  generatedAt: string;
}

@Injectable()
export class PlaybookOptimizerAgentService {
  private readonly logger = new Logger(PlaybookOptimizerAgentService.name);

  /**
   * Analyzes historical SOAR execution DAGs and produces self-tuning optimization recommendations.
   */
  analyzePlaybookDag(
    playbookId: string,
    tenantId: string,
    actions: ActionExecutionMetric[],
  ): PlaybookOptimizationReport {
    let originalTotalDuration = 0;
    const recommendations: OptimizationRecommendation[] = [];
    const criticalPathBottlenecks: string[] = [];

    // 1. Calculate baseline sequential duration & find slow steps
    actions.forEach((a) => {
      originalTotalDuration += a.averageDurationMs;
      if (a.averageDurationMs > 400 || a.failureRate > 0.1) {
        criticalPathBottlenecks.push(
          `${a.actionType} (${a.actionId}): Duration=${a.averageDurationMs}ms, FailureRate=${(a.failureRate * 100).toFixed(1)}%`,
        );
      }
    });

    // 2. Identify independent actions with 0 dependencies that can run concurrently in Phase 1
    const independentActions = actions.filter((a) => a.dependsOn.length === 0);
    const dependentActions = actions.filter((a) => a.dependsOn.length > 0);

    let speedupMs = 0;
    if (independentActions.length > 1) {
      const sequentialTime = independentActions.reduce((sum, a) => sum + a.averageDurationMs, 0);
      const parallelTime = Math.max(...independentActions.map((a) => a.averageDurationMs));
      const phase1Speedup = sequentialTime - parallelTime;
      speedupMs += phase1Speedup;

      recommendations.push({
        type: 'PARALLELIZE_ACTIONS',
        description: `Parallelize ${independentActions.length} independent initial actions (${independentActions.map((a) => a.actionType).join(', ')})`,
        targetActionIds: independentActions.map((a) => a.actionId),
        estimatedSpeedupMs: phase1Speedup,
      });
    }

    // 3. Construct optimized execution DAG
    const optimizedDag = [
      {
        phase: 1,
        parallelActions: independentActions.map((a) => a.actionId),
      },
      {
        phase: 2,
        parallelActions: dependentActions.map((a) => a.actionId),
      },
    ];

    const optimizedEstimatedDuration = Math.max(50, originalTotalDuration - speedupMs);
    const reductionPercentage = Number(
      (((originalTotalDuration - optimizedEstimatedDuration) / Math.max(1, originalTotalDuration)) * 100).toFixed(1),
    );

    const report: PlaybookOptimizationReport = {
      playbookId,
      tenantId,
      originalAverageDurationMs: originalTotalDuration,
      optimizedEstimatedDurationMs: optimizedEstimatedDuration,
      predictedMttrReductionPercentage: reductionPercentage,
      criticalPathBottlenecks,
      recommendations,
      optimizedDagStructure: optimizedDag,
      generatedAt: new Date().toISOString(),
    };

    this.logger.log(
      `⚡ [PLAYBOOK TUNING] Playbook '${playbookId}' optimized: MTTR reduced from ${originalTotalDuration}ms to ${optimizedEstimatedDuration}ms (${reductionPercentage}% speedup)`,
    );

    return report;
  }
}
