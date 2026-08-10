import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ZS-COM-BILL-001 Part 27 / REC-01. Core principle: unknown state must
 * never automatically become PAID/BILLABLE/COVERED/DELIVERED/ENTITLED —
 * every check here only ever records a ReconciliationIssue on mismatch,
 * it NEVER mutates the underlying commercial record to "fix" it. A human
 * resolves the issue explicitly via resolveIssue.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startRun(runType: string = 'ON_DEMAND') {
    return this.prisma.reconciliationRun.create({ data: { run_type: runType, status: 'RUNNING' } });
  }

  async getRunById(id: string) {
    const run = await this.prisma.reconciliationRun.findUnique({ where: { id }, include: { issues: true } });
    if (!run) {
      throw new NotFoundException(`Reconciliation run '${id}' not found`);
    }
    return run;
  }

  private async recordIssue(
    runId: string,
    domain: string,
    objectType: string,
    objectId: string,
    expectedValue: string,
    actualValue: string,
    severity: string,
    reason: string,
  ) {
    return this.prisma.reconciliationIssue.create({
      data: {
        run_id: runId,
        domain,
        object_type: objectType,
        object_id: objectId,
        expected_value: expectedValue,
        actual_value: actualValue,
        severity,
        reason,
        status: 'OPEN',
      },
    });
  }

  /** Domain: CONTRACT_ENTITLEMENT — an ACTIVE contract with no matching ACTIVE entitlement is drift, not auto-corrected. */
  async reconcileContractEntitlement(runId: string) {
    const activeContracts = await this.prisma.contract.findMany({ where: { status: 'ACTIVE' } });
    let issues = 0;

    for (const contract of activeContracts) {
      const matchingEntitlement = await this.prisma.entitlement.findFirst({
        where: { commercial_account_id: contract.commercial_account_id, status: 'ACTIVE' },
      });
      if (!matchingEntitlement) {
        await this.recordIssue(
          runId,
          'CONTRACT_ENTITLEMENT',
          'Contract',
          contract.id,
          'at least one ACTIVE entitlement',
          'none',
          'HIGH',
          `Contract '${contract.id}' is ACTIVE but commercial account '${contract.commercial_account_id}' has no ACTIVE entitlement`,
        );
        issues++;
      }
    }
    return { checked: activeContracts.length, issuesFound: issues };
  }

  /** Domain: BILLING (invoice vs. payment) — a mismatch is filed, never silently written off or force-settled. */
  async reconcileInvoicePayments(runId: string) {
    const issuedInvoices = await this.prisma.commercialInvoice.findMany({
      where: { status: 'ISSUED' },
      include: { payments: { include: { refunds: true } } },
    });
    let issues = 0;

    for (const invoice of issuedInvoices) {
      const settledPayments = invoice.payments.filter((p) => ['SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status));
      const totalSettled = settledPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalRefunded = settledPayments.reduce(
        (sum, p) => sum + p.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + Number(r.amount), 0),
        0,
      );
      const netSettled = totalSettled - totalRefunded;

      if (invoice.payments.length === 0) {
        continue; // not yet paid is not a mismatch, it is simply unpaid
      }

      if (Math.abs(netSettled - Number(invoice.total_amount)) > 0.01) {
        await this.recordIssue(
          runId,
          'BILLING_PAYMENT',
          'CommercialInvoice',
          invoice.id,
          String(invoice.total_amount),
          String(netSettled),
          'CRITICAL',
          `Invoice '${invoice.id}' total ${invoice.total_amount} does not match net settled payments ${netSettled}`,
        );
        issues++;
      }
    }
    return { checked: issuedInvoices.length, issuesFound: issues };
  }

  async completeRun(runId: string) {
    const issueCount = await this.prisma.reconciliationIssue.count({ where: { run_id: runId } });
    return this.prisma.reconciliationRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', completed_at: new Date(), issue_count: issueCount },
    });
  }

  async resolveIssue(issueId: string, resolution: string) {
    const issue = await this.prisma.reconciliationIssue.findUnique({ where: { id: issueId } });
    if (!issue) {
      throw new NotFoundException(`Reconciliation issue '${issueId}' not found`);
    }
    if (issue.status !== 'OPEN') {
      throw new ConflictException(`Reconciliation issue '${issueId}' is '${issue.status}', not OPEN`);
    }
    return this.prisma.reconciliationIssue.update({
      where: { id: issueId },
      data: { status: 'RESOLVED', resolved_at: new Date(), resolution },
    });
  }
}
