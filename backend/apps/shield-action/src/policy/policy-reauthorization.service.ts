import { Injectable } from '@nestjs/common';
import { ActionAuthorizationContext } from '../internal-client/action-authorization-context.types';

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Re-checks the parts of ActionAuthorizationContext that are policy-shaped
 * (proposal status, authority level, policy version presence, entitlement)
 * — fails closed on anything missing or indeterminate rather than treating
 * an absent value as permissive.
 */
@Injectable()
export class PolicyReauthorizationService {
  check(context: ActionAuthorizationContext): PolicyCheckResult {
    if (context.proposalStatus !== 'APPROVED') {
      return { allowed: false, reason: `Proposal status is '${context.proposalStatus}', expected 'APPROVED'` };
    }

    if (context.authorityLevel !== 'R0' && context.authorityLevel !== 'R1') {
      return { allowed: false, reason: `Authority level '${context.authorityLevel}' has no live path this milestone — only R0/R1 are enabled` };
    }

    if (!context.policyVersion) {
      return { allowed: false, reason: 'Missing policy version — cannot evaluate against current policy' };
    }

    if (!context.entitlementAllowed) {
      return { allowed: false, reason: 'Entitlement check denied at reauthorization time' };
    }

    if (!context.authorizationDecisionId) {
      return { allowed: false, reason: 'Missing authorizationDecisionId in reauthorization context' };
    }

    return { allowed: true };
  }
}
