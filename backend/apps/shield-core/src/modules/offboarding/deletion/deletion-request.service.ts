import {
  ConflictException,
  ForbiddenException,
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
import { LegalHoldService } from '../legal-hold/legal-hold.service';

export interface CreateDeletionRequestInput {
  tenantId: string;
  authorizationScopeId?: string;
  requestedBy: string;
  requestAuthority:
    | 'DATA_SUBJECT'
    | 'AUTHORIZED_REPRESENTATIVE'
    | 'TENANT_CONTROLLER'
    | 'TENANT_OFFBOARDING';
  subjectReference?: string;
  reason: string;
  scope: Record<string, unknown>;
  identityVerificationStatus?: 'PENDING' | 'VERIFIED' | 'NOT_APPLICABLE';
  statutoryDeadlineAt?: Date;
}

export interface ApproveDeletionRequestInput {
  tenantId: string;
  authorizationScopeId?: string;
  deletionRequestId: string;
  approvedBy: string;
  decisionReason: string;
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
] as const;

const REVIEWABLE_STATUSES = ['REQUESTED', 'VALIDATING', 'BLOCKED_BY_HOLD'];

/**
 * `deletion:request` submits a reviewable request only. A separate actor with
 * `deletion:approve` must approve a verified, hold-free whole-tenant request
 * before destructive tasks are materialized.
 */
@Injectable()
export class DeletionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly legalHoldService: LegalHoldService,
  ) {}

  async request(input: CreateDeletionRequestInput) {
    this.assertScope(input.scope);
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: input.requestedBy,
      tenantId: input.tenantId,
      authorizationScopeId: input.authorizationScopeId,
      action: PERMISSION_CODES.DELETION_REQUEST,
      resourceType: 'DeletionRequest',
      resourceId: input.tenantId,
      effectClass: 'WRITE',
      purpose: 'privacy-deletion-request',
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to request deletion',
    );

    const conflictingHolds = await this.findConflictingHolds(
      input.tenantId,
      input.scope,
    );
    const blocked = conflictingHolds.length > 0;

    return this.prisma.deletionRequest.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        requested_by: input.requestedBy,
        request_authority: input.requestAuthority,
        subject_reference: input.subjectReference,
        reason: input.reason,
        scope: JSON.stringify(input.scope),
        status: blocked ? 'BLOCKED_BY_HOLD' : 'VALIDATING',
        identity_verification_status:
          input.identityVerificationStatus ?? 'PENDING',
        statutory_deadline_at: input.statutoryDeadlineAt,
        legal_hold_state: blocked ? 'BLOCKED' : 'NONE',
        conflicting_legal_hold_ids: JSON.stringify(
          conflictingHolds.map((hold) => hold.id),
        ),
        authorization_decision_id: authorization.authorizationDecisionId,
      },
    });
  }

  async listForTenant(tenantId: string) {
    return this.prisma.deletionRequest.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getForTenant(tenantId: string, deletionRequestId: string) {
    return this.assertTenantOwnership(tenantId, deletionRequestId);
  }

  async approve(input: ApproveDeletionRequestInput) {
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: input.approvedBy,
      tenantId: input.tenantId,
      authorizationScopeId: input.authorizationScopeId,
      action: PERMISSION_CODES.DELETION_APPROVE,
      resourceType: 'DeletionRequest',
      resourceId: input.deletionRequestId,
      effectClass: 'DESTRUCTIVE',
      purpose: 'privacy-deletion-approval',
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to approve deletion',
    );

    const request = await this.assertTenantOwnership(
      input.tenantId,
      input.deletionRequestId,
    );
    if (request.requested_by === input.approvedBy) {
      throw new ForbiddenException(
        'A deletion requester cannot approve their own request',
      );
    }
    if (request.status === 'APPROVED') return request;
    if (!REVIEWABLE_STATUSES.includes(request.status)) {
      throw new ConflictException(
        `DeletionRequest '${request.id}' cannot be approved from status ${request.status}`,
      );
    }
    if (
      !['VERIFIED', 'NOT_APPLICABLE'].includes(
        request.identity_verification_status,
      )
    ) {
      throw new ConflictException(
        `DeletionRequest '${request.id}' requires verified identity or an explicit not-applicable determination`,
      );
    }

    const scope = this.parseScope(request.scope);
    if (scope.all !== true) {
      throw new ConflictException(
        'Scoped data-subject deletion execution is not enabled in this release; only the verified tenant-offboarding path may execute whole-tenant deletion',
      );
    }

    const conflictingHolds = await this.findConflictingHolds(
      input.tenantId,
      scope,
    );
    if (conflictingHolds.length > 0) {
      return this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'BLOCKED_BY_HOLD',
          legal_hold_state: 'BLOCKED',
          conflicting_legal_hold_ids: JSON.stringify(
            conflictingHolds.map((hold) => hold.id),
          ),
          reviewed_by: input.approvedBy,
          reviewed_at: new Date(),
          decision_reason: input.decisionReason,
          outcome: 'LEGAL_REVIEW_REQUIRED',
        },
      });
    }

    await this.prisma.$transaction([
      this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          legal_hold_state: 'NONE',
          conflicting_legal_hold_ids: '[]',
          reviewed_by: input.approvedBy,
          reviewed_at: new Date(),
          decision_reason: input.decisionReason,
          approved_at: new Date(),
          outcome: 'APPROVED_FOR_EXECUTION',
        },
      }),
      this.prisma.deletionTask.createMany({
        data: STORE_TYPES.map((storeType) => ({
          id: randomUUID(),
          tenant_id: input.tenantId,
          deletion_request_id: request.id,
          store_type: storeType,
          object_type: 'ALL',
          scope: request.scope,
          status: 'PENDING',
        })),
      }),
    ]);

    return this.prisma.deletionRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
  }

  async reject(
    tenantId: string,
    deletionRequestId: string,
    rejectedBy: string,
    decisionReason: string,
  ) {
    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: rejectedBy,
      tenantId,
      action: PERMISSION_CODES.DELETION_APPROVE,
      resourceType: 'DeletionRequest',
      resourceId: deletionRequestId,
      effectClass: 'PRIVILEGED',
      purpose: 'privacy-deletion-review',
    });
    assertPermittedAuthorization(authorization);
    const request = await this.assertTenantOwnership(
      tenantId,
      deletionRequestId,
    );
    if (request.requested_by === rejectedBy) {
      throw new ForbiddenException(
        'A deletion requester cannot decide their own request',
      );
    }
    if (!REVIEWABLE_STATUSES.includes(request.status)) {
      throw new ConflictException(
        `DeletionRequest '${request.id}' cannot be rejected from status ${request.status}`,
      );
    }
    return this.prisma.deletionRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        reviewed_by: rejectedBy,
        reviewed_at: new Date(),
        decision_reason: decisionReason,
        outcome: 'REJECTED',
      },
    });
  }

  async markRunning(tenantId: string, deletionRequestId: string) {
    await this.assertExecutable(tenantId, deletionRequestId);
    return this.prisma.deletionRequest.update({
      where: { id: deletionRequestId },
      data: { status: 'RUNNING', started_at: new Date() },
    });
  }

  async markBackupExpiryPending(tenantId: string, deletionRequestId: string) {
    await this.assertTenantOwnership(tenantId, deletionRequestId);
    return this.prisma.deletionRequest.update({
      where: { id: deletionRequestId },
      data: {
        status: 'BACKUP_EXPIRY_PENDING',
        outcome: 'LOGICAL_DELETION_VERIFIED_BACKUP_EXPIRY_PENDING',
      },
    });
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

  async assertExecutable(tenantId: string, deletionRequestId: string) {
    const request = await this.assertTenantOwnership(
      tenantId,
      deletionRequestId,
    );
    if (!['APPROVED', 'RUNNING'].includes(request.status)) {
      throw new ConflictException(
        `DeletionRequest '${deletionRequestId}' is not approved for execution (currently ${request.status})`,
      );
    }
    const conflictingHolds = await this.findConflictingHolds(
      tenantId,
      this.parseScope(request.scope),
    );
    if (conflictingHolds.length > 0) {
      await this.prisma.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'BLOCKED_BY_HOLD',
          legal_hold_state: 'BLOCKED',
          conflicting_legal_hold_ids: JSON.stringify(
            conflictingHolds.map((hold) => hold.id),
          ),
          outcome: 'LEGAL_REVIEW_REQUIRED',
        },
      });
      throw new ConflictException(
        `DeletionRequest '${deletionRequestId}' is blocked by an active legal hold`,
      );
    }
    return request;
  }

  async assertNotBlocked(tenantId: string, deletionRequestId: string) {
    return this.assertExecutable(tenantId, deletionRequestId);
  }

  private async findConflictingHolds(
    tenantId: string,
    scope: Record<string, unknown>,
  ) {
    const activeHolds =
      await this.legalHoldService.getActiveForTenant(tenantId);
    return activeHolds.filter((hold) =>
      this.legalHoldService.scopeIntersects(this.parseScope(hold.scope), scope),
    );
  }

  private assertScope(scope: Record<string, unknown>) {
    if (!scope || Object.keys(scope).length === 0) {
      throw new ConflictException('Deletion scope must not be empty');
    }
  }

  private parseScope(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new ConflictException('Stored deletion/hold scope is invalid');
    }
  }
}
