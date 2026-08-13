import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { LegalHoldService } from '../legal-hold/legal-hold.service';

export interface CreateDeletionRequestInput {
  tenantId: string;
  requestedBy: string;
  reason: string;
  scope: Record<string, unknown>;
}

const STORE_TYPES = [
  'POSTGRES_AUTHORITY',
  'OBJECT_STORAGE',
  'SEARCH',
  'CACHE',
  'ANALYTICS',
  'AI_MEMORY',
  'EMBEDDINGS',
  'EXPORT_CACHE',
  'CONNECTOR_STATE',
];

/**
 * A deletion conflicting with an active legal hold is an explicit
 * first-class state (BLOCKED_BY_HOLD), never silently retained and never
 * silently deleted (spec §17/§68).
 */
@Injectable()
export class DeletionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly legalHoldService: LegalHoldService,
  ) {}

  async request(input: CreateDeletionRequestInput) {
    const { authorizationDecisionId, decision } =
      await this.authorizationDecisionService.evaluate({
        actorId: input.requestedBy,
        tenantId: input.tenantId,
        action: 'deletion:request',
        resourceType: 'Tenant',
        resourceId: input.tenantId,
      });
    if (decision === 'DENY') {
      throw new ForbiddenException(
        'Actor is not authorized to request deletion',
      );
    }

    const activeHolds = await this.legalHoldService.getActiveForTenant(
      input.tenantId,
    );
    const conflictingHold = activeHolds.find((hold) =>
      this.legalHoldService.scopeIntersects(
        JSON.parse(hold.scope),
        input.scope,
      ),
    );
    const status = conflictingHold ? 'BLOCKED_BY_HOLD' : 'APPROVED';
    const legalHoldState = conflictingHold ? 'BLOCKED' : 'NONE';

    const request = await this.prisma.deletionRequest.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        requested_by: input.requestedBy,
        reason: input.reason,
        scope: JSON.stringify(input.scope),
        status,
        legal_hold_state: legalHoldState,
        authorization_decision_id: authorizationDecisionId,
        approved_at: status === 'APPROVED' ? new Date() : null,
      },
    });

    if (status === 'APPROVED') {
      await this.prisma.deletionTask.createMany({
        data: STORE_TYPES.map((storeType) => ({
          id: randomUUID(),
          tenant_id: input.tenantId,
          deletion_request_id: request.id,
          store_type: storeType,
          object_type: 'ALL',
          scope: JSON.stringify(input.scope),
          status: 'PENDING',
        })),
      });
    }

    return request;
  }

  async assertTenantOwnership(tenantId: string, deletionRequestId: string) {
    const request = await this.prisma.deletionRequest.findFirst({
      where: { id: deletionRequestId, tenant_id: tenantId },
    });
    if (!request) {
      throw new NotFoundException(
        `DeletionRequest '${deletionRequestId}' not found`,
      );
    }
    return request;
  }

  async assertNotBlocked(tenantId: string, deletionRequestId: string) {
    const request = await this.assertTenantOwnership(
      tenantId,
      deletionRequestId,
    );
    if (request.status === 'BLOCKED_BY_HOLD') {
      throw new ConflictException(
        `DeletionRequest '${deletionRequestId}' is blocked by an active legal hold`,
      );
    }
    return request;
  }
}
