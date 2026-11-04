import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStateService } from '../commerce/contract-state.service';
import { DunningPolicyService } from './dunning-policy.service';
import { assertTransition } from '../commerce/state-machine.util';

const DUNNING_CASE_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['RESOLVED', 'ESCALATED_TO_TERMINATION', 'CANCELLED'],
  RESOLVED: [],
  ESCALATED_TO_TERMINATION: [],
  CANCELLED: [],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SafeContinuityHold {
  contractId: string;
  incidentId: string;
  reason: string;
  expiresAt: Date;
  authorizedBy: string;
  grantedAt: Date;
}

export class TriggerDunningDto {
  @IsUUID()
  contractId!: string;

  @IsString()
  policyKey!: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

/**
 * ZS-COM-BILL-001 Part 18 & Master Commercial Estate v2.0 §09.4.
 *
 * Invariant C01 / P0-10 / P0-18:
 * "Customer safety precedes monetization. Security-alert intake, access to
 *  incident evidence, authorized containment, legal hold and emergency contacts
 *  survive commercial disputes."
 *
 * Deliberately does not import anything from evidence/case/export/offboarding
 * modules — payment failure escalates a *contract's* commercial status only.
 * Reaching TERMINATION_WORKFLOW here does not touch a single security-plane
 * record or disable incident contacts.
 */
@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);
  private readonly safeContinuityHolds = new Map<string, SafeContinuityHold>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractStateService,
    private readonly dunningPolicyService: DunningPolicyService,
  ) {}

  /**
   * Grant an emergency safe-continuity hold during a declared security incident,
   * active legal hold, or emergency containment event (v2.0 §09.4 / C01).
   */
  grantSafeContinuity(
    contractId: string,
    options: {
      incidentId: string;
      reason: string;
      ttlHours?: number;
      authorizedBy: string;
    },
  ): SafeContinuityHold {
    const ttlHours = options.ttlHours || 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const hold: SafeContinuityHold = {
      contractId,
      incidentId: options.incidentId,
      reason: options.reason,
      expiresAt,
      authorizedBy: options.authorizedBy,
      grantedAt: new Date(),
    };

    this.safeContinuityHolds.set(contractId, hold);
    this.logger.warn(
      `🛡️ [SAFE-CONTINUITY GRANTED] Contract ${contractId} under emergency hold for incident ${options.incidentId}. Expires at ${expiresAt.toISOString()}.`,
    );

    return hold;
  }

  isSafeContinuityActive(contractId: string): boolean {
    const hold = this.safeContinuityHolds.get(contractId);
    if (!hold) return false;
    if (new Date() > hold.expiresAt) {
      this.safeContinuityHolds.delete(contractId);
      return false;
    }
    return true;
  }

  async getCaseById(id: string) {
    const dunningCase = await this.prisma.dunningCase.findUnique({
      where: { id },
    });
    if (!dunningCase) {
      throw new NotFoundException(`Dunning case '${id}' not found`);
    }
    return dunningCase;
  }

  async triggerDunning(dto: TriggerDunningDto) {
    const policy = await this.dunningPolicyService.getActivePolicy(
      dto.policyKey,
    );
    if (!policy) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_DUNNING_POLICY',
        message: `No approved dunning policy for key '${dto.policyKey}'`,
      });
    }

    const existing = await this.prisma.dunningCase.findFirst({
      where: { contract_id: dto.contractId, status: 'ACTIVE' },
    });
    if (existing) {
      return existing; // idempotent — a contract has at most one active dunning case
    }

    // Reuses ContractStateService's own guarded transition — dunning never
    // bypasses the canonical contract state machine.
    await this.contractService.transitionState(
      dto.contractId,
      'PAST_DUE',
      dto.actor || 'dunning-engine',
    );

    return this.prisma.dunningCase.create({
      data: {
        contract_id: dto.contractId,
        dunning_policy_id: policy.id,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Policy-driven, one step at a time — never skips a stage. Called
   * repeatedly (e.g. by a scheduled job); a no-op result means the grace
   * window for the next stage hasn't elapsed yet.
   */
  async advanceDunning(dunningCaseId: string) {
    const dunningCase = await this.getCaseById(dunningCaseId);
    if (dunningCase.status !== 'ACTIVE') {
      throw new ConflictException(
        `Dunning case '${dunningCaseId}' is '${dunningCase.status}', not ACTIVE`,
      );
    }

    const policy = await this.prisma.dunningPolicy.findUniqueOrThrow({
      where: { id: dunningCase.dunning_policy_id },
    });
    const contract = await this.contractService.getContractById(
      dunningCase.contract_id,
    );

    // Invariant C01 & P0-10: Delinquency cannot advance to restrictive/destructive
    // state while under an active safe-continuity incident or legal hold.
    if (this.isSafeContinuityActive(dunningCase.contract_id)) {
      this.logger.log(
        `🛡️ [SAFE-CONTINUITY ENFORCED] Dunning advance held for contract ${dunningCase.contract_id} (active security incident / legal hold). Invariant C01 / P0-10 preserved.`,
      );
      return {
        dunningCase,
        contract,
        advanced: false,
        reason: 'SAFE_CONTINUITY_HOLD_ACTIVE',
      };
    }

    const elapsedDays =
      (Date.now() - dunningCase.triggered_at.getTime()) / MS_PER_DAY;

    let targetStatus: string | null = null;
    if (
      contract.status === 'PAST_DUE' &&
      elapsedDays >= policy.restrict_after_days
    ) {
      targetStatus = 'RESTRICTED';
    } else if (
      contract.status === 'RESTRICTED' &&
      elapsedDays >= policy.suspend_after_days
    ) {
      targetStatus = 'SUSPENDED';
    } else if (
      contract.status === 'SUSPENDED' &&
      elapsedDays >= policy.terminate_after_days
    ) {
      targetStatus = 'TERMINATION_WORKFLOW';
    }

    if (!targetStatus) {
      return { dunningCase, contract, advanced: false };
    }

    if (targetStatus === 'TERMINATION_WORKFLOW') {
      assertTransition(
        DUNNING_CASE_TRANSITIONS,
        dunningCase.status,
        'ESCALATED_TO_TERMINATION',
        'dunning case',
      );
    }

    const updatedContract = await this.contractService.transitionState(
      dunningCase.contract_id,
      targetStatus,
      'dunning-engine',
    );

    const updatedCase = await this.prisma.dunningCase.update({
      where: { id: dunningCaseId },
      data: {
        last_action_at: new Date(),
        ...(targetStatus === 'TERMINATION_WORKFLOW'
          ? { status: 'ESCALATED_TO_TERMINATION' }
          : {}),
      },
    });

    return {
      dunningCase: updatedCase,
      contract: updatedContract,
      advanced: true,
    };
  }

  /** Payment received / dispute resolved — return the contract to ACTIVE. */
  async resolveDunning(dunningCaseId: string, actor = 'system') {
    const dunningCase = await this.getCaseById(dunningCaseId);
    assertTransition(
      DUNNING_CASE_TRANSITIONS,
      dunningCase.status,
      'RESOLVED',
      'dunning case',
    );

    await this.contractService.transitionState(
      dunningCase.contract_id,
      'ACTIVE',
      actor,
    );

    return this.prisma.dunningCase.update({
      where: { id: dunningCaseId },
      data: { status: 'RESOLVED', resolved_at: new Date() },
    });
  }
}
