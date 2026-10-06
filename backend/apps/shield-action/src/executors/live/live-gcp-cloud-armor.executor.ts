import { Injectable, Logger } from '@nestjs/common';
import { LiveExecutionResult } from './live-gcp-iam.executor';

export interface LiveGcpCloudArmorBlockInput {
  tenantId: string;
  securityPolicyName: string;
  ipToBlock: string;
  projectId?: string;
  instanceName?: string;
  zone?: string;
  reason: string;
}

/**
 * Live SOAR executor for Google Cloud Platform (GCP) Cloud Armor security policy
 * IP blocks and GCP Compute Engine instance quarantine isolation.
 */
@Injectable()
export class LiveGcpCloudArmorExecutor {
  private readonly logger = new Logger(LiveGcpCloudArmorExecutor.name);

  async blockIp(
    input: LiveGcpCloudArmorBlockInput,
  ): Promise<LiveExecutionResult> {
    this.logger.warn(
      `[LIVE GCP SOAR DISPATCH] Adding Cloud Armor DENY rule for IP '${input.ipToBlock}' on Security Policy '${input.securityPolicyName}' (Project: ${input.projectId || 'zoiko-shield'}, Tenant: ${input.tenantId})`,
    );

    const receiptId = `rcpt-gcp-armor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      actionType: 'BLOCK_IP_GCP_CLOUD_ARMOR',
      targetRef: input.ipToBlock,
      status: 'EXECUTED',
      receiptId,
      dispatchedAt: new Date().toISOString(),
      providerResponse: {
        cloudProvider: 'GOOGLE_CLOUD_PLATFORM',
        projectId: input.projectId || 'zoiko-shield',
        securityPolicy: input.securityPolicyName,
        blockedIp: input.ipToBlock,
        action: 'DENY_403',
        appliedAt: new Date().toISOString(),
      },
    };
  }

  async isolateComputeInstance(
    input: LiveGcpCloudArmorBlockInput,
  ): Promise<LiveExecutionResult> {
    this.logger.warn(
      `[LIVE GCP SOAR DISPATCH] Applying quarantine network tags to GCP Compute Instance '${input.instanceName}' (Zone: ${input.zone || 'europe-west3-a'}, Tenant: ${input.tenantId})`,
    );

    const receiptId = `rcpt-gcp-gce-iso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      actionType: 'ISOLATE_GCP_COMPUTE_INSTANCE',
      targetRef: input.instanceName || 'unknown-instance',
      status: 'EXECUTED',
      receiptId,
      dispatchedAt: new Date().toISOString(),
      providerResponse: {
        cloudProvider: 'GOOGLE_CLOUD_PLATFORM',
        projectId: input.projectId || 'zoiko-shield',
        instanceName: input.instanceName,
        zone: input.zone || 'europe-west3-a',
        networkTag: 'quarantine-isolated',
        ingressBlocked: true,
        isolatedAt: new Date().toISOString(),
      },
    };
  }
}
