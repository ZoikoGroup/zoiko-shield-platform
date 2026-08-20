import { Injectable, ForbiddenException, Logger } from '@nestjs/common';

export type ResponseAuthorityLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export interface AuthorityValidationResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class ActionAuthorityService {
  private readonly logger = new Logger(ActionAuthorityService.name);

  requiresDualApproval(authorityLevel: ResponseAuthorityLevel): boolean {
    return authorityLevel === 'R4';
  }

  validateAuthority(params: {
    authorityLevel: ResponseAuthorityLevel;
    proposalStatus: string;
    approverIds: string[];
    actionType: string;
    isSimulation?: boolean;
  }): AuthorityValidationResult {
    // 1. R0 is simulation-only
    if (params.authorityLevel === 'R0') {
      if (!params.isSimulation) {
        return {
          allowed: false,
          reason: 'Authority level R0 is simulation-only and cannot execute live estate actions',
        };
      }
      return { allowed: true };
    }

    // 2. Live execution requires APPROVED status
    if (params.proposalStatus !== 'APPROVED') {
      return {
        allowed: false,
        reason: `Proposal status is '${params.proposalStatus}', expected 'APPROVED' before execution`,
      };
    }

    // 3. Check approvers
    const uniqueApprovers = new Set(params.approverIds.filter(Boolean));

    if (params.authorityLevel === 'R4') {
      if (uniqueApprovers.size < 2) {
        return {
          allowed: false,
          reason: `Authority level R4 requires dual-key approval (at least 2 distinct authorized approvers), found ${uniqueApprovers.size}`,
        };
      }
    } else {
      if (uniqueApprovers.size < 1) {
        return {
          allowed: false,
          reason: `Authority level ${params.authorityLevel} requires at least 1 authorized human approver`,
        };
      }
    }

    return { allowed: true };
  }

  assertAuthority(params: {
    authorityLevel: ResponseAuthorityLevel;
    proposalStatus: string;
    approverIds: string[];
    actionType: string;
    isSimulation?: boolean;
  }): void {
    const result = this.validateAuthority(params);
    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }
  }
}
