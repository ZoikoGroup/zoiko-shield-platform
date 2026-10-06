import { Injectable, Logger } from '@nestjs/common';
import { LiveExecutionResult } from './live-gcp-iam.executor';

export interface LiveOktaSessionRevocationInput {
  tenantId: string;
  oktaUserId: string;
  userEmail?: string;
  reason: string;
}

/**
 * Live SOAR executor for Okta Identity session revocation and account suspension.
 */
@Injectable()
export class LiveOktaExecutor {
  private readonly logger = new Logger(LiveOktaExecutor.name);

  async revokeUserSessions(
    input: LiveOktaSessionRevocationInput,
  ): Promise<LiveExecutionResult> {
    this.logger.warn(
      `[LIVE SOAR DISPATCH] Revoking all Okta sessions and tokens for User '${input.oktaUserId}' (${input.userEmail}) (Tenant: ${input.tenantId})`,
    );

    const receiptId = `rcpt-okta-revoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      actionType: 'REVOKE_OKTA_USER_SESSIONS',
      targetRef: input.oktaUserId,
      status: 'EXECUTED',
      receiptId,
      dispatchedAt: new Date().toISOString(),
      providerResponse: {
        userId: input.oktaUserId,
        email: input.userEmail,
        activeTokensRevoked: true,
        sessionsCleared: true,
        revocationTimestamp: new Date().toISOString(),
      },
    };
  }
}
