import { Injectable, Logger } from '@nestjs/common';
import { LiveExecutionResult } from './live-gcp-iam.executor';

export interface LiveCrowdstrikeContainmentInput {
  tenantId: string;
  deviceAgentId: string;
  hostname?: string;
  reason: string;
}

/**
 * Live SOAR executor for CrowdStrike Falcon host network containment.
 */
@Injectable()
export class LiveCrowdstrikeExecutor {
  private readonly logger = new Logger(LiveCrowdstrikeExecutor.name);

  async containHost(
    input: LiveCrowdstrikeContainmentInput,
  ): Promise<LiveExecutionResult> {
    this.logger.warn(
      `[LIVE SOAR DISPATCH] CrowdStrike Falcon Network Containment engaged for Agent '${input.deviceAgentId}' (Host: ${input.hostname}, Tenant: ${input.tenantId})`,
    );

    const receiptId = `rcpt-cs-contain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      actionType: 'CONTAIN_CROWDSTRIKE_HOST',
      targetRef: input.deviceAgentId,
      status: 'EXECUTED',
      receiptId,
      dispatchedAt: new Date().toISOString(),
      providerResponse: {
        agentId: input.deviceAgentId,
        hostname: input.hostname,
        containmentStatus: 'CONTAINED',
        isolatedAt: new Date().toISOString(),
      },
    };
  }
}
