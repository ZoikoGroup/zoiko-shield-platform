import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

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
  simulateProviderFailure?: boolean;
  simulatePartialFailureIndex?: number;
}

/**
 * Post-delivery Phase 2 Email Action Adapter (ZS-ZM-ENG-003 §06.3, §08 W07, ZS-UX-EMTI-001 WF-13).
 * Hard fail-closed in Phase 0 (`ENABLE_EMAIL_PHASE2_ACTIONS` defaults to false -> T18), enforces
 * distinct-person dual custody (`T26`), mandatory pre-flight simulation (`E13`), and partial/rollback reconciliation (`T27`/`T28`).
 */
@Injectable()
export class EmailActionAdapterService {
  private readonly logger = new Logger(EmailActionAdapterService.name);

  isPhase2Enabled(): boolean {
    return process.env.ENABLE_EMAIL_PHASE2_ACTIONS === 'true';
  }

  simulate(input: EmailActionProposalInput) {
    if (!input.targetRefs?.length) {
      throw new BadRequestException(
        'Simulation requires at least one verified target reference',
      );
    }

    const reversible =
      input.requestedAction === 'QUARANTINE_MESSAGE' ||
      input.requestedAction === 'PULL_BACK_MESSAGE';

    return {
      proposalId: input.proposalId,
      simulated: true,
      mutatedMailbox: false,
      affectedCount: input.targetRefs.length,
      provider: input.provider,
      requestedAction: input.requestedAction,
      reversible,
      dualCustodyRequired: ['R3', 'R4'].includes(input.riskClass.toUpperCase()),
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

  async execute(
    input: EmailActionProposalInput,
    options: { phase2OverrideForTest?: boolean } = {},
  ) {
    const phase2Enabled =
      options.phase2OverrideForTest ?? this.isPhase2Enabled();
    if (!phase2Enabled) {
      throw new ForbiddenException(
        'EMAIL_PHASE2_GATE_LOCKED: Post-delivery mailbox mutations are blocked in Phase 0/1 (T18)',
      );
    }

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

    if (input.approvalExpiresAt) {
      const expMs = Date.parse(input.approvalExpiresAt);
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        throw new ForbiddenException(
          'APPROVAL_EXPIRED: Dual-custody authorization expired before execution (E13)',
        );
      }
    }

    if (input.simulateProviderFailure) {
      // T28: Never report optimistic "success" when upstream provider fails or times out
      return {
        status: 'FAILED',
        providerResponseId: `err-${randomUUID().slice(0, 8)}`,
        reconciliationRequired: true,
        outcomes: input.targetRefs.map((ref) => ({
          targetRef: ref,
          status: 'FAILED',
          error: 'Upstream provider execution timed out or returned HTTP 503',
        })),
        executedAt: new Date().toISOString(),
      };
    }

    const partialIndex = input.simulatePartialFailureIndex ?? -1;
    const outcomes = input.targetRefs.map((targetRef, index) => {
      if (index === partialIndex) {
        return {
          targetRef,
          status: 'FAILED',
          error: 'Target mailbox quota or immutable hold prevented mutation',
        };
      }
      return {
        targetRef,
        status: 'VERIFIED',
        providerReceiptId: `rcpt-${createHash('sha256')
          .update(`${input.proposalId}:${targetRef}`)
          .digest('hex')
          .slice(0, 12)}`,
      };
    });

    const anyFailed = outcomes.some((o) => o.status === 'FAILED');
    this.logger.log(
      `Executed Phase 2 email action proposal=${input.proposalId} tenant=${input.tenantId} status=${anyFailed ? 'PARTIAL' : 'VERIFIED'}`,
    );

    return {
      status: anyFailed ? 'PARTIAL' : 'VERIFIED',
      provider: input.provider,
      requestedAction: input.requestedAction,
      commandEventType: 'provider.post_delivery_receipt.v1',
      outcomes,
      reconciliationRequired: anyFailed,
      executedAt: new Date().toISOString(),
    };
  }

  rollback(input: {
    proposalId: string;
    tenantId: string;
    requestedBy: string;
    targetRefs: string[];
  }) {
    const rollbackReceiptId = `rbk-${randomUUID().slice(0, 12)}`;
    return {
      status: 'COMPENSATING',
      rollbackReceiptId,
      proposalId: input.proposalId,
      tenantId: input.tenantId,
      requestedBy: input.requestedBy,
      targetsQueued: input.targetRefs.length,
      recordedAt: new Date().toISOString(),
    };
  }
}
