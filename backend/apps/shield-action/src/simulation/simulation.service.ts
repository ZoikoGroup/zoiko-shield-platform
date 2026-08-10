import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { ShieldCoreClient } from '../internal-client/shield-core.client';
import { PolicyReauthorizationService } from '../policy/policy-reauthorization.service';
import { ApprovalReauthorizationService } from '../approval/approval-reauthorization.service';
import { FreezeControllerService } from '../freeze-controller/freeze-controller.service';
import { RateControlService } from '../rate-control/rate-control.service';
import { DevSimulationSigner } from '../command-signing/dev-simulation-signer.service';
import { DispatcherService } from '../dispatcher/dispatcher.service';
import { CANONICAL_TOPICS } from '../kafka/kafka-producer.service';

export interface SimulationOutcome {
  status: 'SIMULATED' | 'REJECTED';
  reason?: string;
  actionCommandId?: string;
  actionReceiptId?: string;
}

/**
 * The orchestrator for spec flow step 7: re-fetches a fresh
 * ActionAuthorizationContext (never trusts the triggering Kafka payload as
 * authorization), runs every independent check in sequence, fails closed
 * at the first failure, and — only if everything passes — signs and
 * persists a SIMULATION-only receipt. No live provider call exists in this
 * pipeline; the terminal state is always SIMULATED or REJECTED.
 */
@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly shieldCoreClient: ShieldCoreClient,
    private readonly policy: PolicyReauthorizationService,
    private readonly approval: ApprovalReauthorizationService,
    private readonly freeze: FreezeControllerService,
    private readonly rateControl: RateControlService,
    private readonly signer: DevSimulationSigner,
    private readonly dispatcher: DispatcherService,
  ) {}

  async simulate(proposalId: string, correlationId: string): Promise<SimulationOutcome> {
    const context = await this.shieldCoreClient.getAuthorizationContext(proposalId);

    const policyResult = this.policy.check(context);
    if (!policyResult.allowed) {
      this.logger.warn(`Reauthorization denied (policy) for proposal ${proposalId}: ${policyResult.reason}`);
      return { status: 'REJECTED', reason: policyResult.reason };
    }

    const approvalResult = this.approval.check(context);
    if (!approvalResult.allowed) {
      this.logger.warn(`Reauthorization denied (approval) for proposal ${proposalId}: ${approvalResult.reason}`);
      return { status: 'REJECTED', reason: approvalResult.reason };
    }

    const freezeResult = await this.freeze.isFrozen({
      tenantId: context.tenantId,
      actionType: context.actionType,
      connectorScopeRef: context.connectorCapability,
    });
    if (freezeResult.frozen) {
      this.logger.warn(`Reauthorization denied (freeze) for proposal ${proposalId}: ${freezeResult.reason}`);
      return { status: 'REJECTED', reason: freezeResult.reason };
    }

    const rateResult = await this.rateControl.checkCeiling({ tenantId: context.tenantId, actionType: context.actionType });
    if (!rateResult.allowed) {
      this.logger.warn(`Reauthorization denied (rate ceiling) for proposal ${proposalId}: ${rateResult.reason}`);
      return { status: 'REJECTED', reason: rateResult.reason };
    }

    const nonce = randomUUID();
    const actionCommandId = randomUUID();
    const target = { targetType: context.targetType, targetId: context.targetId };

    const signed = this.signer.sign(
      { tenantId: context.tenantId, actionCommandId, nonce, payload: { actionType: context.actionType, target } },
      'SIMULATION',
    );

    const observedState = this.dispatcher.dispatchSimulated({
      actionType: context.actionType,
      targetType: context.targetType,
      targetId: context.targetId,
      authorityLevel: context.authorityLevel,
    });

    const actionReceiptId = randomUUID();

    const [actionCommand, actionReceipt] = await this.prisma.$transaction([
      this.prisma.actionCommand.create({
        data: {
          id: actionCommandId,
          tenant_id: context.tenantId,
          environment_id: context.environmentId,
          proposal_id: context.proposalId,
          action_type: context.actionType,
          target: JSON.stringify(target),
          authority_level: context.authorityLevel,
          approval_refs: JSON.stringify(context.approval ? [context.approval.approvalId] : []),
          policy_version: context.policyVersion,
          nonce,
          expires_at: new Date(Date.now() + 60 * 60 * 1000),
          signature: signed.signature,
          correlation_id: correlationId,
        },
      }),
      this.prisma.actionReceipt.create({
        data: {
          id: actionReceiptId,
          tenant_id: context.tenantId,
          action_command_id: actionCommandId,
          provider: 'SIMULATION',
          status: 'SIMULATED',
          accepted_at: new Date(),
          observed_state: JSON.stringify(observedState),
          signature_verified: true,
          correlation_id: correlationId,
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: context.tenantId,
          topic: CANONICAL_TOPICS.ACTION_SIMULATED,
          eventType: 'action.simulated',
          correlationId,
          payload: {
            environmentId: context.environmentId,
            proposalId: context.proposalId,
            approvalId: context.approval?.approvalId,
            caseId: context.caseId,
            actionCommandId,
            actionReceiptId,
            actionType: context.actionType,
            targetType: context.targetType,
            targetId: context.targetId,
            authorityLevel: context.authorityLevel,
            status: 'SIMULATED',
          },
        }),
      }),
    ]);

    this.logger.log(`Proposal ${proposalId} simulated: actionCommand=${actionCommand.id} actionReceipt=${actionReceipt.id}`);
    return { status: 'SIMULATED', actionCommandId: actionCommand.id, actionReceiptId: actionReceipt.id };
  }
}
