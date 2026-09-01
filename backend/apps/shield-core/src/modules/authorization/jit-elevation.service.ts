import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { JitElevationRequest } from './entities/jit-elevation-request.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { Role } from './entities/role.entity';
import { IdentityEvent } from '../identity-adapter/identity-event.entity';

export interface RequestJitElevationInput {
  superAdminPrincipalId: string;
  targetTenantId: string;
  statedPurpose: string;
  requestedDurationMinutes?: number;
  roleCode?: string;
  isInternalAutoApproved?: boolean;
  autoApprovalReason?: string;
}

export interface ApproveJitElevationInput {
  requestId: string;
  approverPrincipalId: string;
}

export interface RejectJitElevationInput {
  requestId: string;
  approverPrincipalId: string;
  rejectionReason: string;
}

export interface RevokeJitElevationInput {
  requestId: string;
  revokerPrincipalId: string;
  revocationReason: string;
}

/**
 * JIT (Just-In-Time) Elevation Service
 * Specification: Dual-Authorized Scoped & Time-Bound Tenant Access with Customer-Visible Audit Trail
 */
@Injectable()
export class JitElevationService {
  private readonly logger = new Logger(JitElevationService.name);

  constructor(
    @InjectRepository(JitElevationRequest)
    private readonly jitRequestRepo: Repository<JitElevationRequest>,
    @InjectRepository(TenantMembership)
    private readonly membershipRepo: Repository<TenantMembership>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(IdentityEvent)
    private readonly identityEventRepo: Repository<IdentityEvent>,
  ) {}

  /**
   * 1. Super Admin requests access to Tenant X with a stated purpose.
   */
  async requestElevation(
    input: RequestJitElevationInput,
  ): Promise<JitElevationRequest> {
    if (!input.statedPurpose || input.statedPurpose.trim().length < 10) {
      throw new BadRequestException(
        'JIT_PURPOSE_REQUIRED: Stated purpose must be a comprehensive justification of at least 10 characters',
      );
    }

    const durationMinutes = Math.min(
      Math.max(input.requestedDurationMinutes || 60, 5),
      240,
    ); // 5 to 240 mins
    const roleCode = input.roleCode || 'TENANT_SECURITY_ANALYST';

    // Check if there is already an ACTIVE elevation for this principal on this tenant
    const existingActive = await this.jitRequestRepo.findOne({
      where: {
        superAdminPrincipalId: input.superAdminPrincipalId,
        targetTenantId: input.targetTenantId,
        status: 'APPROVED',
        expiresAt: MoreThan(new Date()),
      },
    });

    if (existingActive) {
      throw new ConflictException(
        `JIT_ACTIVE_SESSION_EXISTS: An active JIT elevation already exists until ${existingActive.expiresAt?.toISOString()}`,
      );
    }

    const auditRef = crypto.randomBytes(16).toString('hex');

    const request = this.jitRequestRepo.create({
      superAdminPrincipalId: input.superAdminPrincipalId,
      targetTenantId: input.targetTenantId,
      statedPurpose: input.statedPurpose.trim(),
      requestedDurationMinutes: durationMinutes,
      roleCode,
      status: 'PENDING',
      customerVisibleAuditLogRef: auditRef,
    });

    await this.jitRequestRepo.save(request);

    // If auto-approved (for internal ops / emergency break-glass)
    if (input.isInternalAutoApproved) {
      return this.executeApproval(
        request,
        input.superAdminPrincipalId,
        input.autoApprovalReason || 'EMERGENCY_INTERNAL_OPS_BREAK_GLASS',
      );
    }

    // Record customer-visible audit event for pending request
    await this.recordCustomerAuditEvent({
      eventType: 'JIT_ELEVATION_REQUESTED',
      tenantId: input.targetTenantId,
      actorId: input.superAdminPrincipalId,
      data: {
        requestId: request.id,
        statedPurpose: request.statedPurpose,
        durationMinutes: request.requestedDurationMinutes,
        roleCode: request.roleCode,
        auditRef,
      },
    });

    this.logger.log(
      `✔ [JIT REQUEST] Super Admin '${input.superAdminPrincipalId}' requested access to Tenant '${input.targetTenantId}' (Purpose: ${request.statedPurpose})`,
    );

    return request;
  }

  /**
   * 2. An independent approver approves the elevation request.
   */
  async approveElevation(
    input: ApproveJitElevationInput,
  ): Promise<JitElevationRequest> {
    const request = await this.jitRequestRepo.findOne({
      where: { id: input.requestId },
    });

    if (!request) {
      throw new NotFoundException(`JIT request '${input.requestId}' not found`);
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException(
        `JIT request '${input.requestId}' is already ${request.status}`,
      );
    }

    // Dual-Authorization requirement: Approver cannot be the requester
    if (request.superAdminPrincipalId === input.approverPrincipalId) {
      throw new ForbiddenException(
        'DUAL_AUTHORIZATION_REQUIRED: Independent approver required. Requester cannot approve their own JIT elevation request',
      );
    }

    return this.executeApproval(request, input.approverPrincipalId);
  }

  /**
   * Internal execution of approval: creates scoped time-bound TenantMembership and audit trail.
   */
  private async executeApproval(
    request: JitElevationRequest,
    approverId: string,
    approvalNote?: string,
  ): Promise<JitElevationRequest> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + request.requestedDurationMinutes * 60 * 1000,
    );

    // Look up or assign role
    let role = await this.roleRepo.findOne({
      where: [
        { code: request.roleCode, tenantId: request.targetTenantId },
        { code: request.roleCode, tenantId: IsNull() },
      ],
    });

    if (!role) {
      // Create fallback tenant role if not seeded
      const createdRole = this.roleRepo.create({
        tenantId: request.targetTenantId,
        code: request.roleCode,
        name: 'JIT Elevated Security Analyst',
        roleLevel: 'TENANT',
        permissions: [],
      });
      role = await this.roleRepo.save(createdRole);
    }

    const assignedRole: Role = role;

    // 3. Create or reactivate scoped time-bound TenantMembership
    let membership = await this.membershipRepo.findOne({
      where: {
        tenantId: request.targetTenantId,
        principalId: request.superAdminPrincipalId,
      },
      relations: { roles: true },
    });

    if (!membership) {
      membership = this.membershipRepo.create({
        tenantId: request.targetTenantId,
        principalId: request.superAdminPrincipalId,
        status: 'ACTIVE',
        source: 'JIT_ELEVATION',
        expiresAt,
        elevationPurpose: request.statedPurpose,
        elevationApprovedBy: approverId,
        roles: [assignedRole],
      });
    } else {
      membership.status = 'ACTIVE';
      membership.source = 'JIT_ELEVATION';
      membership.expiresAt = expiresAt;
      membership.elevationPurpose = request.statedPurpose;
      membership.elevationApprovedBy = approverId;
      if (!membership.roles?.some((r) => r.id === assignedRole.id)) {
        membership.roles = [...(membership.roles || []), assignedRole];
      }
    }

    const savedMembership = await this.membershipRepo.save(membership);

    // Update request state
    request.status = 'APPROVED';
    request.approvedByPrincipalId = approverId;
    request.approvedAt = now;
    request.expiresAt = expiresAt;
    request.membershipId = savedMembership.id;

    await this.jitRequestRepo.save(request);

    // 6. Full customer-visible audit trail
    await this.recordCustomerAuditEvent({
      eventType: 'JIT_ELEVATION_GRANTED',
      tenantId: request.targetTenantId,
      actorId: request.superAdminPrincipalId,
      data: {
        requestId: request.id,
        membershipId: savedMembership.id,
        approvedBy: approverId,
        approvalNote: approvalNote || 'APPROVED_BY_PEER_ADMIN',
        statedPurpose: request.statedPurpose,
        expiresAt: expiresAt.toISOString(),
        roleCode: request.roleCode,
        auditRef: request.customerVisibleAuditLogRef,
      },
    });

    this.logger.log(
      `✔ [JIT APPROVED] Access granted for '${request.superAdminPrincipalId}' on Tenant '${request.targetTenantId}' until ${expiresAt.toISOString()} (Approved by: ${approverId})`,
    );

    return request;
  }

  /**
   * Rejects a JIT elevation request.
   */
  async rejectElevation(
    input: RejectJitElevationInput,
  ): Promise<JitElevationRequest> {
    const request = await this.jitRequestRepo.findOne({
      where: { id: input.requestId },
    });

    if (!request)
      throw new NotFoundException(`JIT request '${input.requestId}' not found`);
    if (request.status !== 'PENDING')
      throw new ConflictException(`JIT request is already ${request.status}`);

    request.status = 'REJECTED';
    request.approvedByPrincipalId = input.approverPrincipalId;
    request.rejectionReason = input.rejectionReason;

    await this.jitRequestRepo.save(request);

    await this.recordCustomerAuditEvent({
      eventType: 'JIT_ELEVATION_REJECTED',
      tenantId: request.targetTenantId,
      actorId: request.superAdminPrincipalId,
      data: {
        requestId: request.id,
        rejectedBy: input.approverPrincipalId,
        reason: input.rejectionReason,
        auditRef: request.customerVisibleAuditLogRef,
      },
    });

    return request;
  }

  /**
   * Early revocation of an active JIT elevation.
   */
  async revokeElevation(
    input: RevokeJitElevationInput,
  ): Promise<JitElevationRequest> {
    const request = await this.jitRequestRepo.findOne({
      where: { id: input.requestId },
    });

    if (!request)
      throw new NotFoundException(`JIT request '${input.requestId}' not found`);
    if (request.status !== 'APPROVED') {
      throw new ConflictException(
        `Cannot revoke JIT elevation in '${request.status}' status`,
      );
    }

    // Invalidate the membership immediately
    if (request.membershipId) {
      const membership = await this.membershipRepo.findOne({
        where: { id: request.membershipId },
      });
      if (membership) {
        membership.status = 'REMOVED';
        membership.expiresAt = new Date();
        await this.membershipRepo.save(membership);
      }
    }

    request.status = 'REVOKED';
    request.rejectionReason = input.revocationReason;

    await this.jitRequestRepo.save(request);

    await this.recordCustomerAuditEvent({
      eventType: 'JIT_ELEVATION_REVOKED',
      tenantId: request.targetTenantId,
      actorId: request.superAdminPrincipalId,
      data: {
        requestId: request.id,
        revokedBy: input.revokerPrincipalId,
        reason: input.revocationReason,
        auditRef: request.customerVisibleAuditLogRef,
      },
    });

    this.logger.warn(
      `⚠️ [JIT REVOKED] JIT elevation '${request.id}' revoked by '${input.revokerPrincipalId}'`,
    );
    return request;
  }

  /**
   * 5. Sweeps and marks expired JIT memberships and requests.
   */
  async sweepExpiredMemberships(): Promise<{ expiredCount: number }> {
    const now = new Date();

    const expiredRequests = await this.jitRequestRepo.find({
      where: {
        status: 'APPROVED',
        expiresAt: LessThanOrEqual(now),
      },
    });

    for (const req of expiredRequests) {
      req.status = 'EXPIRED';
      await this.jitRequestRepo.save(req);

      if (req.membershipId) {
        const mem = await this.membershipRepo.findOne({
          where: { id: req.membershipId },
        });
        if (mem && mem.status === 'ACTIVE') {
          mem.status = 'REMOVED';
          await this.membershipRepo.save(mem);
        }
      }

      await this.recordCustomerAuditEvent({
        eventType: 'JIT_ELEVATION_EXPIRED',
        tenantId: req.targetTenantId,
        actorId: req.superAdminPrincipalId,
        data: {
          requestId: req.id,
          expiredAt: now.toISOString(),
          auditRef: req.customerVisibleAuditLogRef,
        },
      });
    }

    if (expiredRequests.length > 0) {
      this.logger.log(
        `✔ [JIT SWEEPER] Auto-expired ${expiredRequests.length} JIT elevation memberships.`,
      );
    }

    return { expiredCount: expiredRequests.length };
  }

  /**
   * 6. Returns customer-visible JIT elevation audit trail for a tenant.
   */
  async getCustomerAuditTrail(
    tenantId: string,
  ): Promise<JitElevationRequest[]> {
    return this.jitRequestRepo.find({
      where: { targetTenantId: tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  private async recordCustomerAuditEvent(event: {
    eventType: string;
    tenantId: string;
    actorId: string;
    data: Record<string, any>;
  }): Promise<void> {
    try {
      const entry = this.identityEventRepo.create({
        eventType: event.eventType,
        tenantId: event.tenantId,
        actorId: event.actorId,
        data: event.data,
      });
      await this.identityEventRepo.save(entry);
    } catch (err) {
      this.logger.warn(`Could not persist customer audit event: ${err}`);
    }
  }
}
