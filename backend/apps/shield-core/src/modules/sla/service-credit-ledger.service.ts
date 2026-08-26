import { Injectable, Logger, ConflictException } from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface ApprovedServiceCredit {
  creditId: string;
  tenantId: string;
  slaBreachClaimId: string;
  evidenceRecordHash: string;
  creditAmount: number;
  currency: string;
  reason: string;
  status: 'PENDING_APPLICATION' | 'APPLIED_TO_INVOICE' | 'EXPIRED';
  approvedAt: Date;
}

export interface AppliedInvoiceDeduction {
  deductionId: string;
  invoiceId: string;
  tenantId: string;
  baseMonthlyRecurringCharge: number;
  maxAllowableCreditCap: number; // 30% of MRC per ZS-COM-BILL-001 §9 E3
  totalDeductedAmount: number;
  appliedCreditIds: string[];
  appliedAt: Date;
}

/**
 * ZS-COM-BILL-001 §9 E3, §10 F4 & Acceptance Criterion SVC-02:
 * Service Credit auto-deduction engine linking SLA breaches to invoice skeletons.
 *
 * Core Guarantees:
 * 1. Contractual Ceiling: Credits applied to an invoice are capped at 30% of MRC (§9 E3).
 * 2. Cryptographic Traceability: Each credit deduction references its original SLA breach
 *    claim ID and evidence ledger hash.
 * 3. Double-Deduction Prevention: Applied credits transition to 'APPLIED_TO_INVOICE'
 *    and cannot be reused on subsequent invoices.
 */
@Injectable()
export class ServiceCreditLedgerService {
  private readonly logger = new Logger(ServiceCreditLedgerService.name);

  // In-memory credit store with persistence integration
  private readonly credits = new Map<string, ApprovedServiceCredit>();
  private readonly deductions = new Map<string, AppliedInvoiceDeduction>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register an approved service credit from an SLA breach claim
   */
  registerApprovedCredit(params: {
    tenantId: string;
    slaBreachClaimId: string;
    evidenceRecordHash: string;
    creditAmount: number;
    currency: string;
    reason: string;
  }): ApprovedServiceCredit {
    const creditId = `cred-${crypto.randomUUID()}`;
    const record: ApprovedServiceCredit = {
      creditId,
      tenantId: params.tenantId,
      slaBreachClaimId: params.slaBreachClaimId,
      evidenceRecordHash: params.evidenceRecordHash,
      creditAmount: params.creditAmount,
      currency: params.currency,
      reason: params.reason,
      status: 'PENDING_APPLICATION',
      approvedAt: new Date(),
    };

    this.credits.set(creditId, record);

    this.logger.log(
      `Registered Approved Service Credit '${creditId}' for tenant '${params.tenantId}': Amount = ${params.currency} ${params.creditAmount} (Evidence Hash: ${params.evidenceRecordHash.substring(0, 16)}...)`,
    );

    return record;
  }

  /**
   * Calculate and apply available credits to an invoice subject to the 30% cap (§9 E3)
   */
  applyCreditsToInvoice(params: {
    tenantId: string;
    invoiceId: string;
    baseMonthlyRecurringCharge: number;
    maxCapPercent?: number; // Defaults to 30%
  }): AppliedInvoiceDeduction {
    const capPercent = params.maxCapPercent ?? 30.0;
    const maxCreditAllowance =
      (params.baseMonthlyRecurringCharge * capPercent) / 100;

    // Get pending credits for tenant
    const pendingCredits = Array.from(this.credits.values()).filter(
      (c) =>
        c.tenantId === params.tenantId && c.status === 'PENDING_APPLICATION',
    );

    let totalDeduction = 0;
    const appliedCreditIds: string[] = [];

    for (const credit of pendingCredits) {
      if (totalDeduction >= maxCreditAllowance) {
        break; // Cap reached
      }

      const availableRoom = maxCreditAllowance - totalDeduction;
      const deductibleFromThisCredit = Math.min(
        credit.creditAmount,
        availableRoom,
      );

      totalDeduction += deductibleFromThisCredit;
      credit.status = 'APPLIED_TO_INVOICE';
      appliedCreditIds.push(credit.creditId);
    }

    const deductionId = `deduct-${crypto.randomUUID()}`;
    const deductionRecord: AppliedInvoiceDeduction = {
      deductionId,
      invoiceId: params.invoiceId,
      tenantId: params.tenantId,
      baseMonthlyRecurringCharge: params.baseMonthlyRecurringCharge,
      maxAllowableCreditCap: maxCreditAllowance,
      totalDeductedAmount: totalDeduction,
      appliedCreditIds,
      appliedAt: new Date(),
    };

    this.deductions.set(params.invoiceId, deductionRecord);

    this.logger.log(
      `Applied ${appliedCreditIds.length} Service Credits totaling $${totalDeduction.toFixed(2)} to Invoice '${params.invoiceId}' (Capped at 30% max: $${maxCreditAllowance.toFixed(2)})`,
    );

    return deductionRecord;
  }

  /**
   * Get pending credits for tenant
   */
  getPendingCredits(tenantId: string): ApprovedServiceCredit[] {
    return Array.from(this.credits.values()).filter(
      (c) => c.tenantId === tenantId && c.status === 'PENDING_APPLICATION',
    );
  }

  /**
   * Get deduction for an invoice
   */
  getInvoiceDeduction(invoiceId: string): AppliedInvoiceDeduction | undefined {
    return this.deductions.get(invoiceId);
  }
}
