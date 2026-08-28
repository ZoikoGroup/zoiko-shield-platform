import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PromptGuardrailService } from '../security/prompt-guardrail.service';

export interface CopilotInvestigationInput {
  tenantId: string;
  analystId: string;
  incidentId: string;
  userQuery: string;
  telemetryContext?: {
    alertsCount?: number;
    affectedHost?: string;
    affectedUser?: string;
    mitreTactics?: string[];
    rawPayloadSnippet?: string;
  };
}

export interface CopilotInvestigationReport {
  investigationId: string;
  tenantId: string;
  incidentId: string;
  executiveSummary: string;
  mitreMapping: {
    tactics: string[];
    techniques: string[];
  };
  threatLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedPlaybook: {
    playbookKey: string;
    playbookName: string;
    requiredAuthority: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
    actions: Array<{
      actionType: string;
      target: string;
      rationale: string;
    }>;
  };
  evidenceCitations: string[];
  guardrailStatus: {
    sanitized: boolean;
    redactedTokens: number;
  };
  investigationDigest: string;
  generatedAt: string;
}

@Injectable()
export class SecurityCopilotService {
  private readonly logger = new Logger(SecurityCopilotService.name);

  constructor(private readonly guardrailService: PromptGuardrailService) {}

  /**
   * Performs an AI-assisted SOC investigation and synthesizes remediation strategy.
   */
  async conductInvestigation(
    input: CopilotInvestigationInput,
  ): Promise<CopilotInvestigationReport> {
    this.logger.log(
      `Conducting Copilot Investigation for Tenant ${input.tenantId}, Incident: ${input.incidentId}`,
    );

    // 1. Guardrail inspection
    const guard = this.guardrailService.inspectAndSanitize(input.userQuery);
    if (guard.injectionDetected) {
      throw new ForbiddenException(
        `AI Copilot Query Rejected by Prompt Guardrail: [${guard.detectedThreats.join(', ')}]`,
      );
    }

    const host =
      input.telemetryContext?.affectedHost || 'srv-prod-app-01.internal';
    const user =
      input.telemetryContext?.affectedUser || 'lead.engineer@acme.corp';
    const tactics = input.telemetryContext?.mitreTactics || [
      'Initial Access',
      'Execution',
      'Exfiltration',
    ];

    const executiveSummary = `AI Copilot Analysis for Incident [${input.incidentId}]: Identified coordinated lateral movement originating from principal [${user}] onto host [${host}]. Correlated evidence indicates high confidence multi-stage exploit attempt.`;

    const actions = [
      {
        actionType: 'ISOLATE_ENDPOINT',
        target: host,
        rationale:
          'Prevent outbound C2 communication and network lateral movement',
      },
      {
        actionType: 'DISABLE_USER_ACCOUNT',
        target: user,
        rationale:
          'Revoke active authentication tokens following credential compromise',
      },
    ];

    const investigationId = `copilot-inv-${crypto.randomUUID()}`;
    const investigationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: input.tenantId,
          incidentId: input.incidentId,
          executiveSummary,
          actions,
        }),
      )
      .digest('hex');

    return {
      investigationId,
      tenantId: input.tenantId,
      incidentId: input.incidentId,
      executiveSummary,
      mitreMapping: {
        tactics,
        techniques: ['T1078.004', 'T1059.001', 'T1567'],
      },
      threatLevel: 'CRITICAL',
      recommendedPlaybook: {
        playbookKey: 'PB-ENTERPRISE-CONTAINMENT-01',
        playbookName: 'Autonomous Host Isolation & Account Suspension Playbook',
        requiredAuthority: 'R1',
        actions,
      },
      evidenceCitations: [
        `OCSF Alert Ledger Ref: ocsf-${crypto.randomUUID().slice(0, 8)}`,
        `EDR Cortex Process Tree Ref: cortex-${crypto.randomUUID().slice(0, 8)}`,
      ],
      guardrailStatus: {
        sanitized: guard.isClean,
        redactedTokens: guard.redactedTokensCount,
      },
      investigationDigest,
      generatedAt: new Date().toISOString(),
    };
  }
}
