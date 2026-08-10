import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';

export interface CreateLegalHoldInput {
  tenantId: string;
  scope: Record<string, unknown>;
  authority: string;
  reason: string;
  reviewAt: Date;
  createdBy: string;
}

/** Legal hold suspends only the AFFECTED deletion scope — never silently blocks an entire unrelated tenant deletion (spec §64). */
@Injectable()
export class LegalHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
  ) {}

  async create(input: CreateLegalHoldInput) {
    const { authorizationDecisionId, decision } = await this.authorizationDecisionService.evaluate({
      actorId: input.createdBy,
      tenantId: input.tenantId,
      action: 'legal_hold:create',
      resourceType: 'Tenant',
      resourceId: input.tenantId,
    });
    if (decision === 'DENY') {
      throw new ForbiddenException('Actor is not authorized to create a legal hold');
    }

    return this.prisma.legalHold.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        scope: JSON.stringify(input.scope),
        authority: input.authority,
        reason: input.reason,
        review_at: input.reviewAt,
        created_by: input.createdBy,
        authorization_decision_id: authorizationDecisionId,
        status: 'ACTIVE',
      },
    });
  }

  async release(tenantId: string, legalHoldId: string) {
    const hold = await this.prisma.legalHold.findFirst({ where: { id: legalHoldId, tenant_id: tenantId } });
    if (!hold) {
      throw new NotFoundException(`LegalHold '${legalHoldId}' not found`);
    }
    return this.prisma.legalHold.update({ where: { id: hold.id }, data: { status: 'RELEASED', ends_at: new Date() } });
  }

  async getActiveForTenant(tenantId: string) {
    return this.prisma.legalHold.findMany({ where: { tenant_id: tenantId, status: 'ACTIVE' } });
  }

  /** A hold's scope is a plain JSON object (e.g. {caseIds:[...]} or {all:true}) — narrow-scope holds only block matching deletion scopes. */
  scopeIntersects(holdScope: Record<string, unknown>, deletionScope: Record<string, unknown>): boolean {
    if (holdScope.all === true) return true;
    for (const key of Object.keys(holdScope)) {
      if (key === 'all') continue;
      const holdValues = holdScope[key];
      const deletionValues = deletionScope[key];
      if (Array.isArray(holdValues) && Array.isArray(deletionValues)) {
        if (holdValues.some((v) => deletionValues.includes(v))) return true;
      } else if (holdValues !== undefined && holdValues === deletionValues) {
        return true;
      }
    }
    return false;
  }
}
