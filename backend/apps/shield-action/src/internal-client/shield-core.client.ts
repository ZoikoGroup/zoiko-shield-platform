import { Injectable, Logger } from '@nestjs/common';
import { ActionAuthorizationContext } from './action-authorization-context.types';

const SHIELD_CORE_BASE_URL = process.env.SHIELD_CORE_BASE_URL || 'http://localhost:3001';

export class ShieldCoreUnreachableError extends Error {}

/**
 * shield-action's ONLY window into shield-core-owned data (spec
 * correction #3) — it never queries ActionProposal/ActionApproval/Case/
 * Alert/IdentityEntity/Asset/authorization tables directly, even though
 * the schema is physically shared. Every reauthorization starts here.
 */
@Injectable()
export class ShieldCoreClient {
  private readonly logger = new Logger(ShieldCoreClient.name);

  async getAuthorizationContext(proposalId: string): Promise<ActionAuthorizationContext> {
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!token) {
      throw new ShieldCoreUnreachableError('INTERNAL_SERVICE_TOKEN is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${SHIELD_CORE_BASE_URL}/internal/v1/action-proposals/${proposalId}/authorization-context`, {
        headers: { 'x-internal-service-token': token },
      });
    } catch (err) {
      this.logger.error(`shield-core unreachable: ${(err as Error).message}`);
      throw new ShieldCoreUnreachableError('shield-core unreachable during reauthorization');
    }

    if (!response.ok) {
      throw new ShieldCoreUnreachableError(`shield-core returned ${response.status} for authorization-context`);
    }

    const body = await response.json();
    return body.data as ActionAuthorizationContext;
  }
}
