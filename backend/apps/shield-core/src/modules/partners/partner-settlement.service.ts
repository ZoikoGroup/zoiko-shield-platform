import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsISO8601, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerService } from './partner.service';
import { assertTransition } from '../commerce/state-machine.util';

const SETTLEMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

export class CalculateSettlementDto {
  @IsString()
  partnerId!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;
}

/**
 * ZS-COM-BILL-001 Part 21: commission is computed only from an approved
 * PartnerAgreement's rate — never invented — applied to the gross revenue
 * of commercial accounts explicitly delegated to that partner
 * (PartnerDelegation), never partner self-reported figures.
 */
@Injectable()
export class PartnerSettlementService {
  private readonly logger = new Logger(PartnerSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerService: PartnerService,
  ) {}

  async calculateSettlement(dto: CalculateSettlementDto) {
    const agreement = await this.partnerService.getActiveAgreement(
      dto.partnerId,
    );
    if (!agreement) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_PARTNER_AGREEMENT',
        message: `No approved partner agreement for partner '${dto.partnerId}'; commission cannot be calculated`,
      });
    }

    const delegations = await this.prisma.partnerDelegation.findMany({
      where: { partner_id: dto.partnerId, status: 'ACTIVE' },
    });
    const accountIds = [
      ...new Set(delegations.map((d) => d.commercial_account_id)),
    ];

    if (accountIds.length === 0) {
      this.logger.warn(
        `Partner '${dto.partnerId}' has no delegated commercial accounts — settlement will be zero`,
      );
    }

    const invoices = await this.prisma.commercialInvoice.findMany({
      where: {
        commercial_account_id: { in: accountIds },
        status: 'ISSUED',
        issued_at: { gte: dto.periodStart, lte: dto.periodEnd },
      },
    });

    const grossAmount = invoices.reduce(
      (sum, inv) => sum + inv.total_amount,
      0,
    );
    const commissionAmount =
      grossAmount * (Number(agreement.commission_percent) / 100);

    return this.prisma.partnerSettlement.create({
      data: {
        partner_id: dto.partnerId,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        gross_amount: grossAmount,
        commission_amount: commissionAmount,
        status: 'DRAFT',
      },
    });
  }

  async getSettlementById(id: string) {
    const settlement = await this.prisma.partnerSettlement.findUnique({
      where: { id },
    });
    if (!settlement) {
      throw new NotFoundException(`Partner settlement '${id}' not found`);
    }
    return settlement;
  }

  async approveSettlement(id: string) {
    const settlement = await this.getSettlementById(id);
    assertTransition(
      SETTLEMENT_TRANSITIONS,
      settlement.status,
      'APPROVED',
      'partner settlement',
    );
    return this.prisma.partnerSettlement.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
  }

  async markPaid(id: string) {
    const settlement = await this.getSettlementById(id);
    assertTransition(
      SETTLEMENT_TRANSITIONS,
      settlement.status,
      'PAID',
      'partner settlement',
    );
    return this.prisma.partnerSettlement.update({
      where: { id },
      data: { status: 'PAID' },
    });
  }
}
