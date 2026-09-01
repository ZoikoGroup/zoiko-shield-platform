import { Injectable, Logger } from '@nestjs/common';

export interface TargetAsset {
  assetId: string;
  assetType:
    | 'KUBERNETES_POD'
    | 'AWS_IAM_ROLE'
    | 'FIREWALL_RULE'
    | 'EDR_HOST'
    | 'DATABASE_CLUSTER';
  criticalityTier: 'TIER_0_CRITICAL' | 'TIER_1_STANDARD' | 'TIER_2_DEV';
  currentState: Record<string, any>;
}

export interface PlaybookAction {
  actionId: string;
  type:
    | 'REVOKE_IAM_SESSION'
    | 'BLOCK_IP_EGRESS'
    | 'ISOLATE_EDR_HOST'
    | 'TERMINATE_POD'
    | 'DRAIN_CLUSTER';
  parameters: Record<string, any>;
}

export interface DryRunPlaybookRequest {
  tenantId: string;
  playbookId: string;
  incidentId: string;
  actions: PlaybookAction[];
  targetAssets: TargetAsset[];
}

export interface SimulatedStateDiff {
  assetId: string;
  assetType: string;
  field: string;
  before: any;
  after: any;
}

export interface PlaybookDryRunReport {
  dryRunId: string;
  playbookId: string;
  tenantId: string;
  status: 'DRY_RUN_PASSED' | 'DRY_RUN_BLOCKED';
  simulatedBlastRadiusScore: number;
  totalAssetsTargeted: number;
  totalActionsPlanned: number;
  stateDiffs: SimulatedStateDiff[];
  policyVerdict: 'ALLOWED' | 'DENIED';
  safetyViolations: string[];
  simulatedAt: string;
}

@Injectable()
export class PlaybookSandboxEngineService {
  private readonly logger = new Logger(PlaybookSandboxEngineService.name);

  /**
   * Executes a zero-side-effect dry run of a containment playbook.
   */
  async simulatePlaybook(
    request: DryRunPlaybookRequest,
  ): Promise<PlaybookDryRunReport> {
    const dryRunId = `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.logger.log(
      `🧪 [SANDBOX DRY-RUN] Simulating Playbook '${request.playbookId}' on Tenant '${request.tenantId}' (Incident: ${request.incidentId})`,
    );

    const stateDiffs: SimulatedStateDiff[] = [];
    const safetyViolations: string[] = [];
    let blastRadiusAccumulator = 0;

    for (const asset of request.targetAssets) {
      if (asset.criticalityTier === 'TIER_0_CRITICAL') {
        blastRadiusAccumulator += 0.4;
      } else if (asset.criticalityTier === 'TIER_1_STANDARD') {
        blastRadiusAccumulator += 0.15;
      } else {
        blastRadiusAccumulator += 0.05;
      }

      for (const action of request.actions) {
        // Evaluate simulated effect based on action type
        if (action.type === 'REVOKE_IAM_SESSION') {
          stateDiffs.push({
            assetId: asset.assetId,
            assetType: asset.assetType,
            field: 'attachedPolicies',
            before: asset.currentState.attachedPolicies || [
              'AdministratorAccess',
            ],
            after: ['AWSQuarantinePolicy-ReadOnly'],
          });
        } else if (action.type === 'BLOCK_IP_EGRESS') {
          stateDiffs.push({
            assetId: asset.assetId,
            assetType: asset.assetType,
            field: 'outboundEgress',
            before: asset.currentState.outboundEgress || 'ALLOW_ALL',
            after: 'DENY_TARGET_IP_BURST',
          });
        } else if (action.type === 'ISOLATE_EDR_HOST') {
          stateDiffs.push({
            assetId: asset.assetId,
            assetType: asset.assetType,
            field: 'networkIsolationState',
            before: asset.currentState.networkIsolationState || 'CONNECTED',
            after: 'ISOLATED_SOC_MGMT_ONLY',
          });
        }

        // Check safety rules: Tier 0 assets cannot be drained/quarantined without break-glass
        if (
          asset.criticalityTier === 'TIER_0_CRITICAL' &&
          (action.type === 'DRAIN_CLUSTER' ||
            action.type === 'ISOLATE_EDR_HOST')
        ) {
          safetyViolations.push(
            `Safety Violation: Asset '${asset.assetId}' is TIER_0_CRITICAL; automated isolation prohibited without break-glass quorum.`,
          );
        }
      }
    }

    const blastRadiusScore = Math.min(
      1.0,
      Number(blastRadiusAccumulator.toFixed(2)),
    );
    const policyVerdict = safetyViolations.length > 0 ? 'DENIED' : 'ALLOWED';
    const status =
      safetyViolations.length === 0 ? 'DRY_RUN_PASSED' : 'DRY_RUN_BLOCKED';

    return {
      dryRunId,
      playbookId: request.playbookId,
      tenantId: request.tenantId,
      status,
      simulatedBlastRadiusScore: blastRadiusScore,
      totalAssetsTargeted: request.targetAssets.length,
      totalActionsPlanned: request.actions.length,
      stateDiffs,
      policyVerdict,
      safetyViolations,
      simulatedAt: new Date().toISOString(),
    };
  }
}
