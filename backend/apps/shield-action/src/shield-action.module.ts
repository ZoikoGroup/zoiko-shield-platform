import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { ShieldActionController } from './shield-action.controller';

import { ContentHashService } from './hashing/content-hash.service';
import { ShieldCoreClient } from './internal-client/shield-core.client';
import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { FreezeControllerService } from './freeze-controller/freeze-controller.service';
import { EmergencyFreezeLockdownService } from './freeze-controller/emergency-freeze-lockdown.service';
import { RateControlService } from './rate-control/rate-control.service';
import { DevSimulationSigner } from './command-signing/dev-simulation-signer.service';
import { CloudHsmSignerService } from './command-signing/cloud-hsm-signer.service';
import { DispatcherService } from './dispatcher/dispatcher.service';
import { PolicyReauthorizationService } from './policy/policy-reauthorization.service';
import { ApprovalReauthorizationService } from './approval/approval-reauthorization.service';
import { TwoManRuleService } from './approval/two-man-rule.service';
import { ReceiptVerificationService } from './receipt-verification/receipt-verification.service';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { RollbackService } from './rollback/rollback.service';
import { CredentialExchangeService } from './credential-exchange/credential-exchange.service';
import { SimulationService } from './simulation/simulation.service';
import { ActionApprovedConsumer } from './proposals/action-approved.consumer';

import { ActionAuthorityService } from './policy/action-authority.service';
import { CedarPolicyEvaluatorService } from './policy/cedar-policy-evaluator.service';
import { ActionRollbackBrokerService } from './rollback/action-rollback-broker.service';
import { ActionRollbackOrchestratorService } from './rollback/action-rollback-orchestrator.service';
import { ResponsePlaybookService } from './playbooks/response-playbook.service';
import { ActionExecutionRegistryService } from './execution-adapters/action-execution-registry.service';
import { EntraUserActionAdapter } from './execution-adapters/entra-user.adapter';
import { EdrIsolateActionAdapter } from './execution-adapters/edr-isolate.adapter';
import { AwsIamActionAdapter } from './execution-adapters/aws-iam.adapter';
import { Fido2StepupGuardService } from './auth/fido2-stepup-guard.service';
import { DisasterRecoveryPartitionService } from './dr-orchestrator/disaster-recovery-partition.service';
import { CspmRemediationEngineService } from './cspm/cspm-remediation-engine.service';
import { EbpfNetworkEnforcerService } from './microsegmentation/ebpf-network-enforcer.service';
import { SoarCircuitBreakerService } from './circuit-breaker/soar-circuit-breaker.service';
import { CedarTenantIsolationService } from './policy/cedar-tenant-isolation.service';
import { SignedCommandBrokerService } from './broker/signed-command-broker.service';
import { TemporalContainmentEscalationService } from './orchestration/temporal-containment-escalation.service';
import { DistributedActionLockService } from './orchestration/distributed-action-lock.service';
import { PlaybookSandboxEngineService } from './simulation/playbook-sandbox-engine.service';

@Module({
  imports: [PrismaModule, KafkaModule, ScheduleModule.forRoot()],
  controllers: [ShieldActionController],
  providers: [
    ContentHashService,
    ShieldCoreClient,
    OutboxService,
    OutboxPublisherService,
    FreezeControllerService,
    EmergencyFreezeLockdownService,
    RateControlService,
    DevSimulationSigner,
    CloudHsmSignerService,
    DispatcherService,
    PolicyReauthorizationService,
    ActionAuthorityService,
    CedarPolicyEvaluatorService,
    Fido2StepupGuardService,
    DisasterRecoveryPartitionService,
    CspmRemediationEngineService,
    EbpfNetworkEnforcerService,
    SoarCircuitBreakerService,
    CedarTenantIsolationService,
    SignedCommandBrokerService,
    TemporalContainmentEscalationService,
    DistributedActionLockService,
    PlaybookSandboxEngineService,
    ApprovalReauthorizationService,
    TwoManRuleService,
    ReceiptVerificationService,
    ReconciliationService,
    RollbackService,
    ActionRollbackBrokerService,
    ActionRollbackOrchestratorService,
    ResponsePlaybookService,
    CredentialExchangeService,
    SimulationService,
    ActionApprovedConsumer,
    ActionExecutionRegistryService,
    EntraUserActionAdapter,
    EdrIsolateActionAdapter,
    AwsIamActionAdapter,
  ],
  exports: [
    ActionAuthorityService,
    CedarPolicyEvaluatorService,
    CloudHsmSignerService,
    EmergencyFreezeLockdownService,
    Fido2StepupGuardService,
    DisasterRecoveryPartitionService,
    CspmRemediationEngineService,
    EbpfNetworkEnforcerService,
    SoarCircuitBreakerService,
    CedarTenantIsolationService,
    SignedCommandBrokerService,
    TemporalContainmentEscalationService,
    DistributedActionLockService,
    PlaybookSandboxEngineService,
    TwoManRuleService,
    ActionRollbackBrokerService,
    ActionRollbackOrchestratorService,
    ResponsePlaybookService,
    ActionExecutionRegistryService,
  ],
})
export class ShieldActionModule {}
