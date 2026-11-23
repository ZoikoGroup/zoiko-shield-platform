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
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';
import {
  EMAIL_PROVIDER_MUTATION_PORT,
  EmailProviderMutationNotConfiguredError,
  type EmailProviderMutationPort,
  type EmailProviderTargetOutcome,
} from './email-provider-mutation.port';

export interface EmailActionProposalInput {
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

/**
 * Post-delivery Phase 2 Email Action Adapter (ZS-ZM-ENG-003 §06.3, §08 W07, ZS-UX-EMTI-001 WF-13).
 *
 * Every execution passes the SAME controls as any other response action:
 * Phase-2 gate (T18), dedicated write credential, distinct-person approval with
 * freshness (T26/E13), R0-R4 authority (ActionAuthorityService), freeze check
 * (FreezeControllerService) and blast-radius evaluation per target
 * (BlastRadiusEvaluatorService). Mailbox mutation goes only through the
 * EmailProviderMutationPort; a receipt is reported only when the provider
 * returned one (T28: never optimistic success).
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

  simulate(input: EmailActionProposalInput) {
    this.assertTargets(input);
    const level = this.parseRiskClass(input.riskClass);

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
      outcomes: checked,
      reconciliationRequired: !allVerified,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Rollback is a REQUEST for compensation, not a claim that it happened: no
   * provider receipt exists until the compensating mutation is itself executed
   * and verified.
   */
  rollback(input: {
    proposalId: string;
    tenantId: string;
    requestedBy: string;
    targetRefs: string[];
  }) {
    return {
      status: 'COMPENSATION_REQUESTED',
      compensationRequestId: `cmp-${randomUUID().slice(0, 12)}`,
      providerReceipt: null,
      proposalId: input.proposalId,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      targetsQueued: input.targetRefs.length,
      reconciliationRequired: true,
      recordedAt: new Date().toISOString(),
    };
  }
}
