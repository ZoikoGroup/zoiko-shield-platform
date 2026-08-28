import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface DifferentialPrivacyQuery {
  tenantId: string;
  metricName: string;
  trueValue: number;
  sensitivity: number; // Delta f (max change by 1 record)
  epsilonCost: number; // e.g. 0.5 epsilon per query
}

export interface DifferentialPrivacyResult {
  tenantId: string;
  metricName: string;
  perturbedValue: number;
  noiseAdded: number;
  remainingEpsilonBudget: number;
  mechanism: 'LAPLACE_MECHANISM';
  privacyProofDigest: string;
  sanitizedAt: string;
}

/**
 * Differential Privacy Defense Guard for AI Telemetry & Copilot
 * Specification: ZS-AI-SEC-001 §6 (Membership Inference & Model Inversion Protection)
 */
@Injectable()
export class DifferentialPrivacyGuardService {
  private readonly logger = new Logger(DifferentialPrivacyGuardService.name);

  // Epsilon budget tracker per tenant (default: 10.0 epsilon total budget)
  private readonly tenantEpsilonBudgets = new Map<string, number>();
  private readonly DEFAULT_TOTAL_BUDGET = 10.0;

  /**
   * Samples a random number from Laplace distribution: Laplace(0, scale)
   */
  private sampleLaplaceNoise(scale: number): number {
    // Use a cryptographically strong uniform sample for the mechanism.
    const u = crypto.randomBytes(6).readUIntBE(0, 6) / 0x1000000000000 - 0.5;
    // Laplace quantile function: -scale * sgn(u) * ln(1 - 2|u|)
    const sgn = u < 0 ? -1 : 1;
    return -scale * sgn * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Applies the Laplace Mechanism to protect a numerical security aggregation.
   */
  perturbMetric(query: DifferentialPrivacyQuery): DifferentialPrivacyResult {
    let currentBudget =
      this.tenantEpsilonBudgets.get(query.tenantId) ??
      this.DEFAULT_TOTAL_BUDGET;

    if (currentBudget < query.epsilonCost) {
      this.logger.warn(
        `🚨 [PRIVACY BUDGET EXHAUSTED] Tenant ${query.tenantId} epsilon budget remaining: ${currentBudget.toFixed(2)}`,
      );
      throw new ForbiddenException(
        `Differential privacy epsilon budget exhausted for tenant '${query.tenantId}'. Cannot execute query without risking membership leakage.`,
      );
    }

    // Deduct epsilon budget
    currentBudget -= query.epsilonCost;
    this.tenantEpsilonBudgets.set(query.tenantId, currentBudget);

    // Scale parameter b = sensitivity / epsilon
    const scale = query.sensitivity / query.epsilonCost;
    const noiseAdded = this.sampleLaplaceNoise(scale);
    const perturbedValue = Number((query.trueValue + noiseAdded).toFixed(4));

    const privacyProofDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          query,
          perturbedValue,
          noiseAdded,
          remainingBudget: currentBudget,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Perturbed Metric [${query.metricName}] -> Sanitized: ${perturbedValue} (Noise: ${noiseAdded.toFixed(4)}, Epsilon Left: ${currentBudget.toFixed(2)})`,
    );

    return {
      tenantId: query.tenantId,
      metricName: query.metricName,
      perturbedValue,
      noiseAdded,
      remainingEpsilonBudget: Number(currentBudget.toFixed(2)),
      mechanism: 'LAPLACE_MECHANISM',
      privacyProofDigest,
      sanitizedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns current epsilon budget for a tenant.
   */
  getRemainingBudget(tenantId: string): number {
    return this.tenantEpsilonBudgets.get(tenantId) ?? this.DEFAULT_TOTAL_BUDGET;
  }
}
