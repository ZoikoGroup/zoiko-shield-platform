import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

/**
 * ZS-COM-BILL-001 §29 & Section 26 Acceptance Criterion REC-01.
 * Automated periodic reconciliation worker.
 *
 * Runs scheduled multi-domain reconciliation:
 * 1. Contract ↔ Active Entitlements
 * 2. Invoices ↔ Net Settled Payments
 * 3. Service Obligations ↔ Due Date & Delivery State
 * 4. Contractual SLA Breaches ↔ Proposed Service Credits
 * 5. Partner Settlements ↔ Approved Partner Agreements
 * 6. Claim Eligibility ↔ Commercial Account Status
 *
 * All discrepancies are recorded as immutable ReconciliationIssue records.
 * Reconciliation NEVER mutates or deletes original operational/commercial records.
 */
@Injectable()
export class PeriodicReconciliationWorker {
  private readonly logger = new Logger(PeriodicReconciliationWorker.name);
  private isRunning = false;

  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * Daily scheduled reconciliation at midnight UTC
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyReconciliation(): Promise<{
    runId: string;
    totalIssuesFound: number;
    status: string;
  }> {
    if (this.isRunning) {
      this.logger.warn(
        'Previous reconciliation run is still active. Skipping concurrent run.',
      );
      return { runId: '', totalIssuesFound: 0, status: 'SKIPPED' };
    }

    this.isRunning = true;
    this.logger.log(
      'Starting automated daily financial and governance reconciliation run (REC-01)...',
    );

    try {
      const run = await this.reconciliationService.startRun('DAILY_SCHEDULED');
      const runId = run.id;

      // 1. Reconcile Contract ↔ Entitlements
      const contractResult =
        await this.reconciliationService.reconcileContractEntitlement(runId);

      // 2. Reconcile Invoices ↔ Payments
      const invoiceResult =
        await this.reconciliationService.reconcileInvoicePayments(runId);

      // 3. Reconcile Service Obligations
      const obligationResult =
        await this.reconciliationService.reconcileServiceObligations(runId);

      // 4. Reconcile Service Credits
      const creditResult =
        await this.reconciliationService.reconcileServiceCredits(runId);

      // 5. Reconcile Partner Costs
      const partnerResult =
        await this.reconciliationService.reconcilePartnerCosts(runId);

      // 6. Reconcile Claim Eligibility
      const claimResult =
        await this.reconciliationService.reconcileClaimEligibility(runId);

      const totalIssues =
        contractResult.issuesFound +
        invoiceResult.issuesFound +
        obligationResult.issuesFound +
        creditResult.issuesFound +
        partnerResult.issuesFound +
        claimResult.issuesFound;

      await this.reconciliationService.completeRun(runId);

      this.logger.log(
        `Completed daily reconciliation run '${runId}'. Total issues recorded: ${totalIssues}`,
      );

      return {
        runId,
        totalIssuesFound: totalIssues,
        status: 'COMPLETED',
      };
    } catch (error) {
      this.logger.error(
        'Error executing automated daily reconciliation run',
        error,
      );
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * On-demand manual trigger for testing / immediate reconciliation
   */
  async triggerManualRun(runType = 'ON_DEMAND') {
    this.logger.log(`Triggering manual reconciliation run (${runType})...`);
    return this.handleDailyReconciliation();
  }
}
