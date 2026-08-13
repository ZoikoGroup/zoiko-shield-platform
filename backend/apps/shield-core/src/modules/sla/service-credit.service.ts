import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsNumber, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { InvoiceSkeletonService } from '../billing/invoice-skeleton.service';
import { SlaMeasurementService } from './sla-measurement.service';
import { assertTransition } from '../commerce/state-machine.util';

const CREDIT_TRANSITIONS: Record<string, string[]> = {
  PROPOSED: ['APPROVED', 'REJECTED'],
  APPROVED: ['POSTED'],
  REJECTED: [],
  POSTED: [],
};

export class ProposeCreditDto {
  @IsUUID()
  slaMeasurementId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  proposedBy!: string;
}

/**
 * ZS-COM-BILL-001 FIN-04: service credits are evidence-linked (tied to a
 * breached SlaMeasurement, which itself carries evidence_ref) and kept
 * separate from operational security facts — this service never touches
 * an Alert/Case/Incident record, only the SLA measurement's own evidence
 * pointer. Credits are approved through the generic maker-checker engine
 * and posted as an append-only credit note, never by editing an invoice.
 */
@Injectable()
export class ServiceCreditService {
  private readonly logger = new Logger(ServiceCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementService: SlaMeasurementService,
    private readonly approvalService: CommercialApprovalService,
    private readonly invoiceService: InvoiceSkeletonService,
  ) {}

  async proposeCredit(tenantId: string, dto: ProposeCreditDto) {
    const measurement = await this.measurementService.getMeasurementById(
      tenantId,
      dto.slaMeasurementId,
    );
    if (!measurement.breached) {
      throw new ConflictException({
        statusCode: 409,
        error: 'MEASUREMENT_NOT_BREACHED',
        message: `SLA measurement '${dto.slaMeasurementId}' did not breach its target; no credit is due`,
      });
    }

    const credit = await this.prisma.serviceCredit.create({
      data: {
        sla_measurement_id: dto.slaMeasurementId,
        contract_id: measurement.contract_id,
        amount: dto.amount,
        status: 'PROPOSED',
      },
    });

    const approval = await this.approvalService.requestApproval({
      changeType: 'SERVICE_CREDIT',
      objectType: 'ServiceCredit',
      objectId: credit.id,
      requestedBy: dto.proposedBy,
      reason: `SLA breach on measurement ${dto.slaMeasurementId} (evidence: ${measurement.evidence_ref || 'none'})`,
      financialImpact: dto.amount,
    });

    return this.prisma.serviceCredit.update({
      where: { id: credit.id },
      data: { approval_id: approval.id },
    });
  }

  async getCreditById(tenantId: string, id: string) {
    const credit = await this.prisma.serviceCredit.findUnique({
      where: { id },
    });
    if (!credit) {
      throw new NotFoundException(`Service credit '${id}' not found`);
    }
    await this.measurementService.getMeasurementById(
      tenantId,
      credit.sla_measurement_id,
    );
    return credit;
  }

  async decideCredit(
    tenantId: string,
    creditId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
  ) {
    const credit = await this.getCreditById(tenantId, creditId);
    assertTransition(
      CREDIT_TRANSITIONS,
      credit.status,
      decision,
      'service credit',
    );

    if (!credit.approval_id) {
      throw new ConflictException(
        `Service credit '${creditId}' has no linked commercial approval`,
      );
    }
    await this.approvalService.decideApproval(
      credit.approval_id,
      approverId,
      decision,
      reason,
    );

    return this.prisma.serviceCredit.update({
      where: { id: creditId },
      data: { status: decision },
    });
  }

  /** Posting requires an already-ISSUED invoice for the same contract — the credit note is appended, the invoice is never touched. */
  async postCredit(tenantId: string, creditId: string, invoiceId: string) {
    const credit = await this.getCreditById(tenantId, creditId);
    assertTransition(
      CREDIT_TRANSITIONS,
      credit.status,
      'POSTED',
      'service credit',
    );

    const invoice = await this.prisma.commercialInvoice.findFirst({
      where: { id: invoiceId, contract_id: credit.contract_id },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException(
        `Invoice '${invoiceId}' not found for the service credit contract`,
      );
    }

    const creditNote = await this.invoiceService.issueCreditNote(
      invoiceId,
      Number(credit.amount),
      `SLA service credit (measurement ${credit.sla_measurement_id})`,
    );

    return this.prisma.serviceCredit.update({
      where: { id: creditId },
      data: {
        status: 'POSTED',
        credit_note_id: creditNote.id,
        posted_at: new Date(),
      },
    });
  }
}
