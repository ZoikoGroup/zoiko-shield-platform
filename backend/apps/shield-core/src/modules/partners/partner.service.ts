import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

const PARTNER_TYPES = [
  'REFERRAL',
  'RESELLER',
  'MSP',
  'MSSP',
  'CONSULTANCY',
  'AUDITOR',
  'TECHNOLOGY_PARTNER',
  'IR_SPECIALIST',
] as const;

export class CreatePartnerDto {
  @IsString()
  legalName!: string;

  @IsIn(PARTNER_TYPES)
  partnerType!: (typeof PARTNER_TYPES)[number];
}

export class CreatePartnerAgreementDto {
  @IsString()
  partnerId!: string;

  @IsOptional()
  @IsNumber()
  commissionPercent?: number;

  @IsOptional()
  @IsNumber()
  marginPercent?: number;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  invoiceResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  taxResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  supportResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  renewalRights?: string;
}

/** ZS-COM-BILL-001 Part 21: partner economic terms require an approved agreement, fail-closed like everything else. */
@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPartner(dto: CreatePartnerDto) {
    return this.prisma.partner.create({
      data: { legal_name: dto.legalName, partner_type: dto.partnerType, status: 'ACTIVE' },
    });
  }

  async createAgreement(dto: CreatePartnerAgreementDto) {
    return this.prisma.partnerAgreement.create({
      data: {
        partner_id: dto.partnerId,
        commission_percent: dto.commissionPercent ?? 0,
        margin_percent: dto.marginPercent ?? 0,
        invoice_responsibility: dto.invoiceResponsibility || 'ZOIKOSHIELD',
        tax_responsibility: dto.taxResponsibility || 'ZOIKOSHIELD',
        support_responsibility: dto.supportResponsibility || 'ZOIKOSHIELD',
        renewal_rights: dto.renewalRights || 'ZOIKOSHIELD',
        status: 'DRAFT',
      },
    });
  }

  async approveAgreement(id: string, approvedBy: string) {
    const agreement = await this.prisma.partnerAgreement.findUnique({ where: { id } });
    if (!agreement) {
      throw new NotFoundException(`Partner agreement '${id}' not found`);
    }
    if (agreement.status !== 'DRAFT') {
      throw new ConflictException(`Partner agreement '${id}' is '${agreement.status}', not DRAFT`);
    }
    return this.prisma.partnerAgreement.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async getActiveAgreement(partnerId: string) {
    const now = new Date();
    const agreement = await this.prisma.partnerAgreement.findFirst({
      where: {
        partner_id: partnerId,
        status: 'APPROVED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
    if (!agreement) {
      this.logger.warn(`Partner agreement query FAILED CLOSED for partner '${partnerId}'`);
    }
    return agreement;
  }
}
