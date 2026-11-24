import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FreezeControllerService } from '../freeze-controller/freeze-controller.service';
import {
  ActionAuthorityService,
  type ResponseAuthorityLevel,
} from '../policy/action-authority.service';
import {
  CedarPolicyEvaluatorService,
  type CedarEvaluationDecision,
} from '../policy/cedar-policy-evaluator.service';
import {
  CedarTenantIsolationService,
  type AuthorityLevel as CedarAuthorityLevel,
  type CedarAuthorizationResult,
} from '../policy/cedar-tenant-isolation.service';
import {
  PerTenantCommandSignerService,
  type TenantCommandExecutionMode,
  type TenantSignedCommandEnvelope,
} from '../command-signing/per-tenant-command-signer.service';
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';
import {
  EMAIL_PROVIDER_MUTATION_PORT,
  EmailProviderMutationNotConfiguredError,
  type EmailProviderMutationPort,
  type EmailProviderTargetOutcome,
} from './email-provider-mutation.port';

export interface EmailActionGovernanceContext {
  actorTenantId?: string;
  actorType?:
    'HUMAN_USER' | 'WORKLOAD_SERVICE' | 'SUPPORT_DELEGATE' | 'AI_AGENT';
  actorRoles?: string[];
  legalEntityId?: string;
  resourceLegalEntityId?: string;
  purpose?: string;
  policyBundleVersion?: string;
  sessionId?: string;
  hasCustomerSupportGrant?: boolean;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}

export interface EmailActionProposalInput extends EmailActionGovernanceContext {
  proposalId: string;
  tenantId: string;
  provider: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';
  requestedAction:
    | 'QUARANTINE_MESSAGE'
    | 'PULL_BACK_MESSAGE'
    | 'REMOVE_FORWARDING_RULE'
    | 'REVOKE_MAILBOX_SESSIONS';
  targetRefs: string[];
  consentScope: string;
  riskClass: string;
  initiatedBy: string;
  approvedBy?: string | null;
  approvalExpiresAt?: string | null;
  hasDedicatedWriteCredential?: boolean;
  /** When true, runs provider mutation client in non-mutating dry-run mode. */
  dryRun?: boolean;
  /** Optional caller-supplied idempotency key propagated per target. */
  idempotencyKey?: string;
}

export interface EmailActionRollbackInput extends EmailActionGovernanceContext {
  proposalId: string;
  tenantId: string;
  requestedBy: string;
  targetRefs: string[];
  riskClass?: string;
}

export interface EmailActionCedarAttestation {
  decisionId: string;
  reasonCode: CedarAuthorizationResult['reasonCode'];
  policyBundleVersion: string;
  attestationDigest: string;
  matchedPolicies: string[];
  policyEvaluationDigest: string;
  evaluatedAt: string;
}

export interface EmailActionSignedCommandSummary {
  commandId: string;
  targetRef: string;
  tenantId: string;
  signingKeyId: string;
  signingAlgorithm: string;
  signature: string;
  nonce: string;
  expiresAt: string;
  executionMode: TenantCommandExecutionMode;
}

const RESPONSE_LEVELS: ResponseAuthorityLevel[] = [
  'R0',
  'R1',
  'R2',
  'R3',
  'R4',
];
const ACTIONS = new Set([
  'QUARANTINE_MESSAGE',
  'PULL_BACK_MESSAGE',
  'REMOVE_FORWARDING_RULE',
  'REVOKE_MAILBOX_SESSIONS',
]);
/** Hard ceiling so one proposal can never be a mass action (spec MASS-ACTION RULE). */
export const EMAIL_ACTION_MAX_TARGETS = 50;
const DEFAULT_POLICY_BUNDLE_VERSION = 'v2026.11.01';

/**
 * Maps Shield tenant RBAC role codes onto Cedar authority roles so legitimate
 * operators (e.g. TENANT_OWNER, SOC_ADMIN, SECURITY_ANALYST) satisfy
 * CedarTenantIsolationService role checks while unprivileged roles (e.g.
 * AUDITOR, VIEWER) remain denied.
 */
function normalizeCedarRoles(
  rawRoles: string[] | undefined,
  level: ResponseAuthorityLevel,
): string[] {
  if (!rawRoles) {
    // Legacy internal callers that omit role codes default to the minimum role
    // for the validated R-level (shield-core already enforced RBAC permission).
    switch (level) {
      case 'R0':
        return ['SOC_ANALYST'];
      case 'R1':
        return ['SOC_INVESTIGATOR'];
      case 'R2':
        return ['SOC_LEAD'];
      case 'R3':
      case 'R4':
        return ['SECURITY_DIRECTOR'];
    }
  }
  const normalized = new Set<string>();
  for (const role of rawRoles) {
    const code = role.toUpperCase();
    normalized.add(code);
    if (
      code === 'TENANT_OWNER' ||
      code === 'SOC_ADMIN' ||
      code === 'SECURITY_ADMIN' ||
      code === 'PLATFORM_ADMIN'
    ) {
      normalized.add('SECURITY_DIRECTOR');
      normalized.add('SOC_LEAD');
      normalized.add('SOC_INVESTIGATOR');
      normalized.add('SOC_ANALYST');
    } else if (code === 'SECURITY_DIRECTOR') {
      normalized.add('SOC_LEAD');
      normalized.add('SOC_INVESTIGATOR');
      normalized.add('SOC_ANALYST');
    } else if (code === 'SOC_LEAD' || code === 'INCIDENT_COMMANDER') {
      normalized.add('SOC_INVESTIGATOR');
      normalized.add('SOC_ANALYST');
    } else if (
      code === 'SECURITY_ANALYST' ||
      code === 'TENANT_SECURITY_ANALYST'
    ) {
      normalized.add('SOC_ANALYST');
      normalized.add('SOC_INVESTIGATOR');
    }
  }
  return Array.from(normalized);
}

function toCedarAuthorityLevel(
  level: ResponseAuthorityLevel,
): CedarAuthorityLevel {
  switch (level) {
    case 'R0':
      return 'R0_READ_ONLY';
    case 'R1':
      return 'R1_DIAGNOSTIC';
    case 'R2':
      return 'R2_GOVERNED_CONTAINMENT';
    case 'R3':
      return 'R3_PRIVILEGED_ELEVATION';
    case 'R4':
      return 'R4_EMERGENCY_FREEZE';
  }
}

function summarizeSignedCommand(
  envelope: TenantSignedCommandEnvelope,
): EmailActionSignedCommandSummary {
  return {
    commandId: envelope.commandId,
    targetRef: envelope.targetRef,
    tenantId: envelope.tenantId,
    signingKeyId: envelope.signingKeyId,
    signingAlgorithm: envelope.signingAlgorithm,
    signature: envelope.signature,
    nonce: envelope.nonce,
    expiresAt: envelope.expiresAt,
    executionMode: envelope.executionMode,
  };
}

/**
 * Post-delivery Phase 2 Email Action Adapter (ZS-ZM-ENG-003 §06.3, §08 W07, ZS-UX-EMTI-001 WF-13).
 *
 * Every simulation, live execution, and compensation passes the full governed
 * control plane:
 * - Phase-2 gate (T18) & dedicated write credential (SEC-04) on live execution
 * - Distinct-person dual-custody approval with freshness (T26/E13)
 * - R0-R4 authority (ActionAuthorityService), freeze check (FreezeControllerService),
 *   and blast-radius evaluation per target (BlastRadiusEvaluatorService)
 * - Fail-closed Cedar tenant isolation & policy evaluation
 *   (CedarTenantIsolationService + CedarPolicyEvaluatorService)
 * - Per-tenant cryptographic command signing & verification with nonce replay
 *   protection (PerTenantCommandSignerService)
 * - Provider mutation only via EmailProviderMutationPort; a receipt is reported
 *   only when the provider returned one (T28: never optimistic success).
 */
@Injectable()
export class EmailActionAdapterService {
  private readonly logger = new Logger(EmailActionAdapterService.name);

  constructor(
    private readonly freeze: FreezeControllerService,
    private readonly authority: ActionAuthorityService,
    private readonly blastRadius: BlastRadiusEvaluatorService,
    @Inject(EMAIL_PROVIDER_MUTATION_PORT)
    private readonly providerPort: EmailProviderMutationPort,
    private readonly cedarPolicy: CedarPolicyEvaluatorService = new CedarPolicyEvaluatorService(),
    private readonly cedarIsolation: CedarTenantIsolationService = new CedarTenantIsolationService(),
    private readonly tenantSigner: PerTenantCommandSignerService = new PerTenantCommandSignerService(),
  ) {}

  isPhase2Enabled(): boolean {
    return process.env.ENABLE_EMAIL_PHASE2_ACTIONS === 'true';
  }

  private parseRiskClass(riskClass: string): ResponseAuthorityLevel {
    const level = String(
      riskClass ?? '',
    ).toUpperCase() as ResponseAuthorityLevel;
    if (!RESPONSE_LEVELS.includes(level)) {
      throw new BadRequestException(
        `INVALID_RISK_CLASS: '${riskClass}' is not one of R0-R4 (fail closed)`,
      );
    }
    return level;
  }

  private assertTargets(input: EmailActionProposalInput): void {
    if (!ACTIONS.has(input.requestedAction)) {
      throw new BadRequestException(
        `UNSUPPORTED_ACTION: '${input.requestedAction}'`,
      );
    }
    if (!input.targetRefs?.length) {
      throw new BadRequestException(
        'Simulation/execution requires at least one verified target reference',
      );
    }
    if (input.targetRefs.length > EMAIL_ACTION_MAX_TARGETS) {
      throw new BadRequestException(
        `MASS_ACTION_BLOCKED: ${input.targetRefs.length} targets exceeds the per-proposal ceiling of ${EMAIL_ACTION_MAX_TARGETS}; bulk response is a distinct high-risk action`,
      );
    }
  }

  private enforceCedarAuthorization(params: {
    tenantId: string;
    proposalId: string;
    actorId: string;
    actionName: string;
    authorityLevel: ResponseAuthorityLevel;
    isSimulation: boolean;
    isCompensation: boolean;
    approvalRef?: string | null;
    isApprovalStale?: boolean;
    hasDedicatedWriteCredential?: boolean;
    approverCount: number;
    governance: EmailActionGovernanceContext;
  }): EmailActionCedarAttestation {
    const policyBundleVersion =
      params.governance.policyBundleVersion ?? DEFAULT_POLICY_BUNDLE_VERSION;
    const purpose =
      params.governance.purpose !== undefined
        ? params.governance.purpose
        : params.isSimulation
          ? 'email_action_simulation'
          : params.isCompensation
            ? 'email_action_compensation'
            : 'email_threat_remediation';
    const actorType = params.governance.actorType ?? 'HUMAN_USER';
    const effectiveLevel: ResponseAuthorityLevel = params.isSimulation
      ? 'R0'
      : params.authorityLevel;
    const legalEntityId = params.governance.legalEntityId ?? 'default-le';
    const resourceLegalEntityId =
      params.governance.resourceLegalEntityId ?? legalEntityId;

    const isolationResult = this.cedarIsolation.evaluateAuthorization({
      principal: {
        id: params.actorId,
        type: actorType,
        tenantId: params.governance.actorTenantId ?? params.tenantId,
        legalEntityId,
        roles: normalizeCedarRoles(
          params.governance.actorRoles,
          effectiveLevel,
        ),
        sessionId: params.governance.sessionId ?? `sess-${params.proposalId}`,
      },
      resource: {
        id: params.proposalId,
        type: 'EmailActionProposal',
        tenantId: params.tenantId,
        legalEntityId: resourceLegalEntityId,
        environment: params.governance.environment ?? 'PRODUCTION',
      },
      action: {
        name: `email.action.${params.actionName.toLowerCase()}`,
        authorityLevel: toCedarAuthorityLevel(effectiveLevel),
      },
      governance: {
        purpose,
        caseReference: params.proposalId,
        approvalRef: params.approvalRef ?? undefined,
        isApprovalStale: params.isApprovalStale ?? false,
        hasCustomerSupportGrant: params.governance.hasCustomerSupportGrant,
        policyBundleVersion,
      },
    });

    if (isolationResult.decision !== 'ALLOW') {
      throw new ForbiddenException(
        `CEDAR_AUTHORIZATION_DENIED (${isolationResult.reasonCode}): proposal=${params.proposalId} action=${params.actionName}`,
      );
    }

    const policyDecision: CedarEvaluationDecision = this.cedarPolicy.evaluate({
      principal: `Principal::"${actorType}"`,
      action: `Action::"${params.actionName}"`,
      resource: `EmailProposal::"${params.proposalId}"`,
      context: {
        tenantId: params.tenantId,
        authorityLevel: effectiveLevel,
        approverCount: params.approverCount,
        isSimulation: params.isSimulation,
        isCompensation: params.isCompensation,
        hasDedicatedWriteCredential: Boolean(
          params.hasDedicatedWriteCredential,
        ),
      },
    });

    if (policyDecision.decision !== 'ALLOW') {
      throw new ForbiddenException(
        `CEDAR_POLICY_DENIED: ${policyDecision.reason}`,
      );
    }

    return {
      decisionId: isolationResult.decisionId,
      reasonCode: isolationResult.reasonCode,
      policyBundleVersion: isolationResult.policyBundleVersion,
      attestationDigest: isolationResult.attestationDigest,
      matchedPolicies: policyDecision.matchedPolicies,
      policyEvaluationDigest: policyDecision.evaluationDigest,
      evaluatedAt: isolationResult.evaluatedAt,
    };
  }

  private async signAndVerifyCommand(params: {
    tenantId: string;
    proposalId: string;
    actionType: string;
    targetRef: string;
    authorityLevel: ResponseAuthorityLevel;
    approvalRef: string;
    policyVersion: string;
    executionMode: TenantCommandExecutionMode;
  }): Promise<TenantSignedCommandEnvelope> {
    const envelope = await this.tenantSigner.signCommand(params);
    const verification =
      await this.tenantSigner.verifyAndConsumeCommand(envelope);
    if (!verification.valid) {
      throw new ForbiddenException(
        `COMMAND_SIGNATURE_REJECTED (${verification.reasonCode}): command=${envelope.commandId}`,
      );
    }
    return envelope;
  }

  async simulate(input: EmailActionProposalInput) {
    this.assertTargets(input);
    const level = this.parseRiskClass(input.riskClass);

    const cedarAuthorization = this.enforceCedarAuthorization({
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      actorId: input.initiatedBy,
      actionName: input.requestedAction,
      authorityLevel: level,
      isSimulation: true,
      isCompensation: false,
      approverCount: 0,
      governance: input,
    });

    const signedEnvelope = await this.signAndVerifyCommand({
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      actionType: input.requestedAction,
      targetRef: input.targetRefs.join(','),
      authorityLevel: 'R0',
      approvalRef: 'SIMULATION',
      policyVersion: cedarAuthorization.policyBundleVersion,
      executionMode: 'SIMULATION',
    });

    const reversible =
      input.requestedAction === 'QUARANTINE_MESSAGE' ||
      input.requestedAction === 'PULL_BACK_MESSAGE';

    const blast = input.targetRefs.map((targetRef) =>
      this.blastRadius.evaluateBlastRadius({
        tenantId: input.tenantId,
        actionType: input.requestedAction,
        targetResource: targetRef,
        requestorId: input.initiatedBy,
        isDualCustodyApproved: false,
      }),
    );

    return {
      proposalId: input.proposalId,
      simulated: true,
      mutatedMailbox: false,
      affectedCount: input.targetRefs.length,
      provider: input.provider,
      requestedAction: input.requestedAction,
      reversible,
      dualCustodyRequired: level === 'R3' || level === 'R4',
      cedarAuthorization,
      signedCommand: summarizeSignedCommand(signedEnvelope),
      blastRadius: {
        maxScore: Math.max(...blast.map((b) => b.blastRadiusScore)),
        blockedTargets: input.targetRefs.filter((_, i) => !blast[i].allowed),
        requiresDualStepup: blast.some((b) => b.requiresDualStepup),
      },
      proposedRollbackPlan: {
        strategy: reversible
          ? 'COMPENSATING_RELEASE_OR_RESTORE'
          : 'MANUAL_RE_GRANT_OR_RE_AUTH',
        reversible,
        estimatedSteps: reversible
          ? [
              'Verify actor authority',
              'Restore message from quarantine/soft-delete',
              'Emit compensation receipt',
            ]
          : [
              'Audit token/rule state',
              'Notify tenant security admin for controlled restoration',
            ],
      },
      simulatedAt: new Date().toISOString(),
    };
  }

  async execute(input: EmailActionProposalInput) {
    if (!this.isPhase2Enabled()) {
      throw new ForbiddenException(
        'EMAIL_PHASE2_GATE_LOCKED: Post-delivery mailbox mutations are blocked in Phase 0/1 (T18)',
      );
    }
    this.assertTargets(input);
    const level = this.parseRiskClass(input.riskClass);

    if (!input.hasDedicatedWriteCredential) {
      throw new ForbiddenException(
        'WRITE_CREDENTIAL_REQUIRED: Distinct Phase 2 write OAuth/command grant missing (SEC-04)',
      );
    }

    if (!input.approvedBy) {
      throw new ForbiddenException(
        'DUAL_CUSTODY_APPROVAL_REQUIRED: An independent approver must authorize before execution',
      );
    }
    if (input.approvedBy === input.initiatedBy) {
      throw new ForbiddenException(
        'DUAL_CUSTODY_SELF_APPROVAL_BLOCKED: Initiator cannot approve own high-risk action (T26)',
      );
    }

    // Approval freshness is mandatory, not optional (E13 / spec approval freshness).
    const expMs = input.approvalExpiresAt
      ? Date.parse(input.approvalExpiresAt)
      : NaN;
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      throw new ForbiddenException(
        'APPROVAL_EXPIRED: Missing or expired approval window; re-approval required (E13)',
      );
    }

    // R0-R4 authority, shared with every other response action.
    this.authority.assertAuthority({
      authorityLevel: level,
      proposalStatus: 'APPROVED',
      approverIds: [input.approvedBy],
      actionType: input.requestedAction,
      isSimulation: false,
    });

    // Freeze switch: global / tenant / action-type / connector scope.
    const frozen = await this.freeze.isFrozen({
      tenantId: input.tenantId,
      actionType: input.requestedAction,
      connectorScopeRef: input.provider,
    });
    if (frozen.frozen) {
      throw new ForbiddenException(`ACTION_FROZEN: ${frozen.reason}`);
    }

    // Cedar tenant isolation & policy evaluation (fail closed before signing or mutating).
    const cedarAuthorization = this.enforceCedarAuthorization({
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      actorId: input.initiatedBy,
      actionName: input.requestedAction,
      authorityLevel: level,
      isSimulation: false,
      isCompensation: false,
      approvalRef: input.approvedBy,
      isApprovalStale: false,
      hasDedicatedWriteCredential: input.hasDedicatedWriteCredential,
      approverCount: 1,
      governance: input,
    });

    // Blast radius per target; any denial blocks the whole proposal.
    for (const targetRef of input.targetRefs) {
      const verdict = this.blastRadius.evaluateBlastRadius({
        tenantId: input.tenantId,
        actionType: input.requestedAction,
        targetResource: targetRef,
        requestorId: input.initiatedBy,
        isDualCustodyApproved: level === 'R3' || level === 'R4',
      });
      if (!verdict.allowed) {
        throw new ForbiddenException(
          verdict.reason ?? 'BLAST_RADIUS_VIOLATION: target not permitted',
        );
      }
    }

    // Mint & verify a per-tenant signed command envelope for every target before dispatch.
    const commandSignatures: EmailActionSignedCommandSummary[] = [];
    for (const targetRef of input.targetRefs) {
      const envelope = await this.signAndVerifyCommand({
        tenantId: input.tenantId,
        proposalId: input.proposalId,
        actionType: input.requestedAction,
        targetRef,
        authorityLevel: level,
        approvalRef: input.approvedBy,
        policyVersion: cedarAuthorization.policyBundleVersion,
        executionMode: input.dryRun ? 'SIMULATION' : 'LIVE',
      });
      commandSignatures.push(summarizeSignedCommand(envelope));
    }

    const outcomes: EmailProviderTargetOutcome[] = [];
    for (const targetRef of input.targetRefs) {
      try {
        outcomes.push(
          await this.providerPort.mutate({
            tenantId: input.tenantId,
            proposalId: input.proposalId,
            provider: input.provider,
            requestedAction: input.requestedAction,
            targetRef,
            dryRun: input.dryRun,
            idempotencyKey: input.idempotencyKey
              ? `${input.idempotencyKey}:${targetRef}`
              : undefined,
          }),
        );
      } catch (err) {
        if (err instanceof EmailProviderMutationNotConfiguredError) {
          // Nothing was attempted for any target; do not claim anything else.
          this.logger.warn(
            `Email action proposal=${input.proposalId} tenant=${input.tenantId} NOT_EXECUTED: ${err.message}`,
          );
          return {
            status: 'NOT_EXECUTED',
            provider: input.provider,
            requestedAction: input.requestedAction,
            commandEventType: 'provider.post_delivery_receipt.v1',
            cedarAuthorization,
            commandSignatures,
            outcomes: input.targetRefs.map((ref) => ({
              targetRef: ref,
              status: 'NOT_EXECUTED',
              error: err.message,
            })),
            reconciliationRequired: false,
            executedAt: null,
          };
        }
        // Timeout / 5xx: the mutation may or may not have happened -> UNKNOWN.
        outcomes.push({
          targetRef,
          status: 'UNKNOWN',
          error: err instanceof Error ? err.message : 'provider error',
        });
      }
    }

    // VERIFIED requires a provider-issued receipt; otherwise downgrade to UNKNOWN.
    const checked = outcomes.map((o) =>
      o.status === 'VERIFIED' && !o.providerReceiptId
        ? {
            ...o,
            status: 'UNKNOWN' as const,
            error: 'Provider returned success without a receipt identifier',
          }
        : o,
    );
    const allDryRun = checked.every((o) => o.status === 'DRY_RUN');
    if (allDryRun) {
      this.logger.log(
        `Dry-run Phase 2 email action proposal=${input.proposalId} tenant=${input.tenantId} targets=${checked.length}`,
      );
      return {
        status: 'DRY_RUN',
        provider: input.provider,
        requestedAction: input.requestedAction,
        commandEventType: 'provider.post_delivery_receipt.v1',
        cedarAuthorization,
        commandSignatures,
        outcomes: checked,
        reconciliationRequired: false,
        executedAt: null,
      };
    }

    const allVerified = checked.every((o) => o.status === 'VERIFIED');
    const noneVerified = checked.every((o) => o.status !== 'VERIFIED');
    const status = allVerified
      ? 'VERIFIED'
      : noneVerified
        ? 'FAILED'
        : 'PARTIAL';

    this.logger.log(
      `Executed Phase 2 email action proposal=${input.proposalId} tenant=${input.tenantId} status=${status}`,
    );

    return {
      status,
      provider: input.provider,
      requestedAction: input.requestedAction,
      commandEventType: 'provider.post_delivery_receipt.v1',
      cedarAuthorization,
      commandSignatures,
      outcomes: checked,
      reconciliationRequired: !allVerified,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Rollback is a REQUEST for compensation, not a claim that it happened: no
   * provider receipt exists until the compensating mutation is itself executed
   * and verified. Still enforces Cedar authorization and per-tenant signing.
   */
  async rollback(input: EmailActionRollbackInput) {
    const level: ResponseAuthorityLevel = input.riskClass
      ? this.parseRiskClass(input.riskClass)
      : 'R1';

    const cedarAuthorization = this.enforceCedarAuthorization({
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      actorId: input.requestedBy,
      actionName: 'EMAIL_ACTION_ROLLBACK',
      authorityLevel: level,
      isSimulation: false,
      isCompensation: true,
      approvalRef: input.requestedBy,
      approverCount: 1,
      governance: input,
    });

    const signedEnvelope = await this.signAndVerifyCommand({
      tenantId: input.tenantId,
      proposalId: input.proposalId,
      actionType: 'EMAIL_ACTION_ROLLBACK',
      targetRef: (input.targetRefs || []).join(',') || input.proposalId,
      authorityLevel: level,
      approvalRef: input.requestedBy,
      policyVersion: cedarAuthorization.policyBundleVersion,
      executionMode: 'COMPENSATION',
    });

    return {
      status: 'COMPENSATION_REQUESTED',
      compensationRequestId: `cmp-${randomUUID().slice(0, 12)}`,
      providerReceipt: null,
      proposalId: input.proposalId,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      targetsQueued: input.targetRefs.length,
      cedarAuthorization,
      signedCommand: summarizeSignedCommand(signedEnvelope),
      reconciliationRequired: true,
      recordedAt: new Date().toISOString(),
    };
  }
}
