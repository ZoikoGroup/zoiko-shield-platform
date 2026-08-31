import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PERMISSION_CODES } from '../../authorization/constants';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';

export interface CreateLegalHoldInput {
  tenantId: string;
  authorizationScopeId?: string;
  scope: Record<string, unknown>;
  authority: string;
  reason: string;
  reviewAt: Date;
  endsAt?: Date;
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
    if (!input.scope || Object.keys(input.scope).length === 0) {
      throw new BadRequestException('Legal hold scope must not be empty');
    }
    if (input.reviewAt <= new Date()) {
      throw new BadRequestException(
        'Legal hold reviewAt must be in the future',
      );
    }
    if (input.endsAt && input.endsAt <= new Date()) {
      throw new BadRequestException('Legal hold endsAt must be in the future');
    }
    if (input.endsAt && input.reviewAt > input.endsAt) {
      throw new BadRequestException(
        'Legal hold reviewAt must not be later than endsAt',
      );
    }
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: input.createdBy,
      tenantId: input.tenantId,
      authorizationScopeId: input.authorizationScopeId,
      action: PERMISSION_CODES.LEGAL_HOLD_CREATE,
      resourceType: 'LegalHold',
      resourceId: input.tenantId,
      effectClass: 'PRIVILEGED',
      purpose: 'legal-hold-creation',
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to create a legal hold',
    );
    const { authorizationDecisionId } = authorization;

    const hold = await this.prisma.legalHold.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        scope: JSON.stringify(input.scope),
        authority: input.authority,
        reason: input.reason,
        review_at: input.reviewAt,
        ends_at: input.endsAt,
        created_by: input.createdBy,
        authorization_decision_id: authorizationDecisionId,
        status: 'ACTIVE',
      },
    });

    // A hold created after a request was submitted must still stop that
    // request. Execution also rechecks immediately before each store task.
    const candidates = await this.prisma.deletionRequest.findMany({
      where: {
        tenant_id: input.tenantId,
        status: {
          in: ['REQUESTED', 'VALIDATING', 'APPROVED', 'RUNNING'],
        },
      },
    });
    for (const request of candidates) {
      const requestScope = this.parseScope(request.scope);
      if (!this.scopeIntersects(input.scope, requestScope)) continue;
      const previousIds = this.parseStringArray(
        request.conflicting_legal_hold_ids,
      );
      await this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'BLOCKED_BY_HOLD',
          legal_hold_state: 'BLOCKED',
          conflicting_legal_hold_ids: JSON.stringify([
            ...new Set([...previousIds, hold.id]),
          ]),
          outcome: 'LEGAL_REVIEW_REQUIRED',
        },
      });
    }
    return hold;
  }

  async release(
    tenantId: string,
    legalHoldId: string,
    releasedBy: string,
    releaseReason: string,
  ) {
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: releasedBy,
      tenantId,
      action: 'legal_hold:release',
      requiredPermissions: [PERMISSION_CODES.LEGAL_HOLD_CREATE],
      resourceType: 'LegalHold',
      resourceId: legalHoldId,
      effectClass: 'PRIVILEGED',
      purpose: 'legal-hold-release',
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to release a legal hold',
    );
    const hold = await this.prisma.legalHold.findFirst({
      where: { id: legalHoldId, tenant_id: tenantId },
    });
    if (!hold) {
      throw new NotFoundException(`LegalHold '${legalHoldId}' not found`);
    }
    return this.prisma.legalHold.update({
      where: { id: hold.id },
      data: {
        status: 'RELEASED',
        ends_at: new Date(),
        released_by: releasedBy,
        release_reason: releaseReason,
        released_at: new Date(),
      },
    });
  }

  async getActiveForTenant(tenantId: string) {
    const now = new Date();
    return this.prisma.legalHold.findMany({
      where: {
        tenant_id: tenantId,
        status: 'ACTIVE',
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** A hold's scope is a plain JSON object (e.g. {caseIds:[...]} or {all:true}) — narrow-scope holds only block matching deletion scopes. */
  scopeIntersects(
    holdScope: Record<string, unknown>,
    deletionScope: Record<string, unknown>,
  ): boolean {
    if (holdScope.all === true || deletionScope.all === true) return true;
    for (const key of Object.keys(holdScope)) {
      if (key === 'all') continue;
      const holdValues = holdScope[key];
      const deletionValues = deletionScope[key];
      if (Array.isArray(holdValues) && Array.isArray(deletionValues)) {
        if (holdValues.some((v) => deletionValues.includes(v))) return true;
      } else if (Array.isArray(holdValues)) {
        if (holdValues.includes(deletionValues)) return true;
      } else if (Array.isArray(deletionValues)) {
        if (deletionValues.includes(holdValues)) return true;
      } else if (
        holdValues &&
        deletionValues &&
        typeof holdValues === 'object' &&
        typeof deletionValues === 'object'
      ) {
        if (
          this.scopeIntersects(
            holdValues as Record<string, unknown>,
            deletionValues as Record<string, unknown>,
          )
        )
          return true;
      } else if (holdValues !== undefined && holdValues === deletionValues) {
        return true;
      }
    }
    return false;
  }

  private parseScope(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private parseStringArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
