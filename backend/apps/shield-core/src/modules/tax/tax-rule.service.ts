import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateTaxRuleDto {
  @IsString()
  jurisdiction!: string;

  @IsString()
  productTaxClass!: string;

  @IsNumber()
  ratePercent!: number;

  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

/**
 * ZS-COM-BILL-001 Part 10: tax must be resolved from an approved,
 * versioned rule, never a hardcoded global rate. No rule matching means
 * FAIL CLOSED — the caller must not invent a tax amount.
 */
@Injectable()
export class TaxRuleService {
  private readonly logger = new Logger(TaxRuleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRule(dto: CreateTaxRuleDto) {
    return this.prisma.taxRule.create({
      data: {
        jurisdiction: dto.jurisdiction,
        product_tax_class: dto.productTaxClass,
        rate_percent: dto.ratePercent,
        reverse_charge: dto.reverseCharge || false,
        status: 'DRAFT',
        effective_from: dto.effectiveFrom || new Date(),
        effective_to: dto.effectiveTo,
      },
    });
  }

  async approveRule(id: string, approvedBy: string) {
    const rule = await this.prisma.taxRule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Tax rule '${id}' not found`);
    }
    if (rule.status !== 'DRAFT') {
      throw new ConflictException(`Tax rule '${id}' is '${rule.status}', not DRAFT`);
    }

    return this.prisma.taxRule.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  /**
   * Returns null (fail closed) when no approved rule covers this
   * jurisdiction/tax-class combination right now. Callers must block
   * invoice issuance rather than default to a 0% or invented rate.
   */
  async resolveTax(jurisdiction: string, productTaxClass: string, taxableAmount: number) {
    const now = new Date();
    const rule = await this.prisma.taxRule.findFirst({
      where: {
        jurisdiction,
        product_tax_class: productTaxClass,
        status: 'APPROVED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { effective_from: 'desc' },
    });

    if (!rule) {
      this.logger.warn(
        `Tax resolution FAILED CLOSED for jurisdiction '${jurisdiction}' / class '${productTaxClass}'`,
      );
      return null;
    }

    const rate = Number(rule.rate_percent);
    const taxAmount = rule.reverse_charge ? 0 : Math.round(taxableAmount * (rate / 100) * 10000) / 10000;

    return { ruleId: rule.id, ratePercent: rate, reverseCharge: rule.reverse_charge, taxAmount };
  }
}
