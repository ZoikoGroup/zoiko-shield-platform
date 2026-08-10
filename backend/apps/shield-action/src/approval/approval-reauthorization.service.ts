import { Injectable } from '@nestjs/common';
import { ContentHashService } from '../hashing/content-hash.service';
import { ActionAuthorizationContext } from '../internal-client/action-authorization-context.types';

export interface ApprovalCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Re-checks approval validity/expiry AND independently recomputes the
 * approved_material_hash from the context fields (correction #3) — this is
 * what actually catches "proposal changed after approval," not just an
 * expiry check. Fails closed on any missing field or mismatch.
 */
@Injectable()
export class ApprovalReauthorizationService {
  constructor(private readonly hashService: ContentHashService) {}

  check(context: ActionAuthorizationContext): ApprovalCheckResult {
    if (!context.approval) {
      return { allowed: false, reason: 'No approval recorded for this proposal' };
    }
    if (context.approval.decision !== 'APPROVED') {
      return { allowed: false, reason: `Approval decision is '${context.approval.decision}', expected 'APPROVED'` };
    }
    if (new Date(context.approval.expiresAt).getTime() <= Date.now()) {
      return { allowed: false, reason: `Approval expired at ${context.approval.expiresAt}` };
    }
    if (!context.approvedMaterialHash) {
      return { allowed: false, reason: 'Missing approvedMaterialHash on approval' };
    }

    const { contentHash: recomputedHash } = this.hashService.hashCanonicalJson({
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      proposalId: context.proposalId,
      proposalVersion: context.proposalVersion,
      actionType: context.actionType,
      targetType: context.targetType,
      targetId: context.targetId,
      authorityLevel: context.authorityLevel,
      policyVersion: context.policyVersion,
      approvalExpiresAt: context.approval.expiresAt,
    });

    if (recomputedHash !== context.approvedMaterialHash) {
      return { allowed: false, reason: 'approved_material_hash mismatch — proposal material changed since approval' };
    }

    return { allowed: true };
  }
}
