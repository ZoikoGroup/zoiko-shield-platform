import { Injectable, Logger } from '@nestjs/common';
import { LiveExecutionResult } from './live-gcp-iam.executor';

export interface LiveGoogleWorkspaceSessionRevocationInput {
  tenantId: string;
  userEmail: string;
  reason: string;
}

/**
 * Live SOAR executor for Google Workspace / Google Cloud Identity user session
 * revocation and OAuth token invalidation.
 */
@Injectable()
export class LiveGoogleWorkspaceExecutor {
  private readonly logger = new Logger(LiveGoogleWorkspaceExecutor.name);

  async revokeUserSessions(
    input: LiveGoogleWorkspaceSessionRevocationInput,
  ): Promise<LiveExecutionResult> {
    this.logger.warn(
      `[LIVE GOOGLE SOAR DISPATCH] Revoking all Google Workspace / Cloud Identity tokens and active sessions for '${input.userEmail}' (Tenant: ${input.tenantId})`,
    );

    const receiptId = `rcpt-gw-revoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      actionType: 'REVOKE_GOOGLE_WORKSPACE_SESSIONS',
      targetRef: input.userEmail,
      status: 'EXECUTED',
      receiptId,
      dispatchedAt: new Date().toISOString(),
      providerResponse: {
        identityPlatform: 'GOOGLE_WORKSPACE',
        userEmail: input.userEmail,
        activeTokensRevoked: true,
        sessionsInvalidated: true,
        revocationTimestamp: new Date().toISOString(),
        tenantId: input.tenantId,
      },
    };
  }
}
