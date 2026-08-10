import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateDunningPolicyDto {
  @IsString()
  policyKey!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  gracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  restrictAfterDays?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  suspendAfterDays?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  terminateAfterDays?: number;
}

/**
 * ZS-COM-BILL-001 Part 18: dunning timings are never hardcoded — they come
 * from an approved, versioned policy. No approved policy means dunning
 * cannot be triggered at all (fail closed), same pattern as price books.
 */
@Injectable()
export class DunningPolicyService {
  private readonly logger = new Logger(DunningPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPolicy(dto: CreateDunningPolicyDto) {
    const latest = await this.prisma.dunningPolicy.findFirst({
      where: { policy_key: dto.policyKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.dunningPolicy.create({
      data: {
        policy_key: dto.policyKey,
        version,
        grace_period_days: dto.gracePeriodDays ?? 7,
        restrict_after_days: dto.restrictAfterDays ?? 14,
        suspend_after_days: dto.suspendAfterDays ?? 30,
        terminate_after_days: dto.terminateAfterDays ?? 60,
        status: 'DRAFT',
      },
    });
  }

  async approvePolicy(id: string, approvedBy: string) {
    const policy = await this.prisma.dunningPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Dunning policy '${id}' not found`);
    }
    if (policy.status !== 'DRAFT') {
      throw new ConflictException(`Dunning policy '${id}' is '${policy.status}', not DRAFT`);
    }

    return this.prisma.dunningPolicy.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async getActivePolicy(policyKey: string) {
    const policy = await this.prisma.dunningPolicy.findFirst({
      where: { policy_key: policyKey, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });

    if (!policy) {
      this.logger.warn(`Dunning policy query FAILED CLOSED for key '${policyKey}'`);
      return null;
    }
    return policy;
  }
}
