import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProductDependencyRule {
  sourceProductKey: string;
  relationship: 'REQUIRES' | 'INCOMPATIBLE_WITH' | 'OVERRIDES' | 'INCLUDED_BY';
  targetProductKey: string;
  errorMessage: string;
}

@Injectable()
export class CpqDependencyValidatorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default system CPQ dependency rules matrix */
  private readonly staticRules: ProductDependencyRule[] = [
    {
      sourceProductKey: 'SHIELD_MANAGED_DEFENSE_PRO',
      relationship: 'REQUIRES',
      targetProductKey: 'SHIELD_CORE_PLATFORM',
      errorMessage: 'Managed Defense Pro requires Shield Core Platform',
    },
    {
      sourceProductKey: 'SHIELD_MANAGED_DEFENSE_ENTERPRISE',
      relationship: 'REQUIRES',
      targetProductKey: 'SHIELD_CORE_PLATFORM',
      errorMessage: 'Managed Defense Enterprise requires Shield Core Platform',
    },
    {
      sourceProductKey: 'SHIELD_PILOT_LITE',
      relationship: 'INCOMPATIBLE_WITH',
      targetProductKey: 'SHIELD_ENTERPRISE_UNLIMITED',
      errorMessage: 'Pilot Lite is incompatible with Enterprise Unlimited tier',
    },
    {
      sourceProductKey: 'ZOIKO_ONE_ALL_ACCESS',
      relationship: 'OVERRIDES',
      targetProductKey: 'SHIELD_CORE_PLATFORM',
      errorMessage:
        'Zoiko One All Access overrides individual core platform line items',
    },
  ];

  async validateQuoteLineDependencies(
    tenantId: string,
    proposedProductKeys: string[],
  ): Promise<{ valid: boolean; violations: string[] }> {
    const activeEntitlements = await this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      select: { offer_type: true },
    });

    const activeKeys = new Set([
      ...activeEntitlements.map((e) => e.offer_type),
      ...proposedProductKeys,
    ]);

    const violations: string[] = [];

    for (const rule of this.staticRules) {
      if (proposedProductKeys.includes(rule.sourceProductKey)) {
        if (rule.relationship === 'REQUIRES') {
          if (!activeKeys.has(rule.targetProductKey)) {
            violations.push(
              `Rule Violation: Product '${rule.sourceProductKey}' requires '${rule.targetProductKey}'`,
            );
          }
        } else if (rule.relationship === 'INCOMPATIBLE_WITH') {
          if (activeKeys.has(rule.targetProductKey)) {
            violations.push(
              `Rule Violation: Product '${rule.sourceProductKey}' is incompatible with '${rule.targetProductKey}'`,
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CPQ_DEPENDENCY_RULE_VIOLATION',
        message: 'Quote contains invalid product combinations',
        violations,
      });
    }

    return { valid: true, violations: [] };
  }
}
