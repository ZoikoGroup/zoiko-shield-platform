import { Test, TestingModule } from '@nestjs/testing';
import { AiGatewayService, GatewayRequestContext } from './ai-gateway.service';
import { PolicyService } from './policy/policy.service';
import { PromptRegistryService } from '../prompt-registry/prompt-registry.service';
import { ProviderRegistryService } from '../provider-registry/provider-registry.service';
import { RetrievalBrokerService } from '../retrieval/retrieval-broker/retrieval-broker.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { RedactionService } from '../redaction/redaction.service';
import { UsageControlService } from '../usage-control/usage-control.service';
import { MemoryPolicyService } from '../memory-policy/memory-policy.service';
import { AiOutputService } from '../outputs/ai-output.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { PolicyDeniedException } from './fallback/fallback.exceptions';

import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { ShieldCoreClient } from '../internal-client/shield-core.client';

describe('AiGatewayService', () => {
  let service: AiGatewayService;
  let policyService: any;
  let promptRegistry: any;
  let providerRegistry: any;
  let retrievalBroker: any;
  let evaluationService: any;
  let redactionService: any;
  let usageControl: any;
  let memoryPolicy: any;
  let aiOutputService: any;
  let kafkaProducer: any;
  let killSwitch: any;
  let shieldCore: any;

  beforeEach(async () => {
    policyService = { evaluate: jest.fn() };
    promptRegistry = { getActiveForKey: jest.fn() };
    providerRegistry = { get: jest.fn() };
    retrievalBroker = { build: jest.fn() };
    evaluationService = { evaluate: jest.fn() };
    redactionService = { redact: jest.fn() };
    usageControl = { checkAndIncrement: jest.fn() };
    memoryPolicy = { assertRequestScoped: jest.fn() };
    aiOutputService = { create: jest.fn() };
    kafkaProducer = { publishEvent: jest.fn() };
    killSwitch = { assertNotBlocked: jest.fn() };
    shieldCore = { recordUsage: jest.fn(), markBillable: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGatewayService,
        { provide: PolicyService, useValue: policyService },
        { provide: PromptRegistryService, useValue: promptRegistry },
        { provide: ProviderRegistryService, useValue: providerRegistry },
        { provide: RetrievalBrokerService, useValue: retrievalBroker },
        { provide: EvaluationService, useValue: evaluationService },
        { provide: RedactionService, useValue: redactionService },
        { provide: UsageControlService, useValue: usageControl },
        { provide: MemoryPolicyService, useValue: memoryPolicy },
        { provide: AiOutputService, useValue: aiOutputService },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: AiKillSwitchService, useValue: killSwitch },
        { provide: ShieldCoreClient, useValue: shieldCore },
      ],
    }).compile();

    service = module.get<AiGatewayService>(AiGatewayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw PolicyDeniedException when caseId is missing', async () => {
    usageControl.checkAndIncrement.mockReturnValue({ allowed: true });
    policyService.evaluate.mockResolvedValue({
      allowed: true,
      useCase: { id: 'uc-1' },
      modelProfile: { id: 'mp-1', provider: 'MOCK' },
    });
    promptRegistry.getActiveForKey.mockResolvedValue({
      id: 'p-1',
      system_prompt_ref: 'sys',
      output_schema: '{}',
    });

    const context: GatewayRequestContext = {
      tenantId: 't-1',
      environmentId: 'env-1',
      region: 'us-east-1',
      dataClass: 'INTERNAL',
      purpose: 'INVESTIGATION',
      actorId: 'user-1',
      authorizationDecisionId: 'auth-1',
      correlationId: 'corr-1',
      traceId: 'trace-1',
    };

    await expect(
      service.invoke('CASE_SUMMARY', 'CASE_SUMMARY', context),
    ).rejects.toThrow(PolicyDeniedException);
  });

  it('should execute successfully when caseId is provided and policy allows', async () => {
    usageControl.checkAndIncrement.mockReturnValue({ allowed: true });
    policyService.evaluate.mockResolvedValue({
      allowed: true,
      useCase: { id: 'uc-1' },
      modelProfile: { id: 'mp-1', provider: 'MOCK' },
    });
    promptRegistry.getActiveForKey.mockResolvedValue({
      id: 'p-1',
      system_prompt_ref: 'sys',
      output_schema: '{}',
    });
    retrievalBroker.build.mockResolvedValue({
      bundle: {
        id: 'b-1',
        completeness_state: 'COMPLETE',
        freshness_state: 'FRESH',
      },
      sourceRefs: ['ref-1'],
      retrievalContext: 'raw context',
    });
    redactionService.redact.mockReturnValue({ redacted: 'redacted context' });

    const mockProvider = {
      invoke: jest.fn().mockResolvedValue({
        content: { summary: 'Case analysis summary' },
        citedSourceRefs: ['ref-1'],
        confidence: 0.95,
      }),
    };
    providerRegistry.get.mockReturnValue(mockProvider);

    evaluationService.evaluate.mockReturnValue({
      citations: { validatedCitations: [{ sourceRef: 'ref-1' }] },
      limitations: [],
      safetyResult: { passed: true },
    });

    aiOutputService.create.mockResolvedValue({
      id: 'out-1',
      content: { summary: 'Case analysis summary' },
    });

    const context: GatewayRequestContext = {
      tenantId: 't-1',
      environmentId: 'env-1',
      region: 'us-east-1',
      dataClass: 'INTERNAL',
      purpose: 'INVESTIGATION',
      actorId: 'user-1',
      caseId: 'case-123',
      authorizationDecisionId: 'auth-1',
      correlationId: 'corr-1',
      traceId: 'trace-1',
    };

    const result = await service.invoke(
      'CASE_SUMMARY',
      'CASE_SUMMARY',
      context,
    );
    expect(result).toBeDefined();
    expect(result.id).toBe('out-1');
  });
});
