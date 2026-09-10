import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DecisionRightsService } from '../src/decision-rights/decision-rights.service';
import { KafkaProducerService } from '../src/kafka/kafka-producer.service';
import { LiveActionExecutorService } from '../../shield-action/src/executors/live-action-executor.service';
import { DualCustodyApprovalsService } from '../../shield-action/src/approvals/dual-custody-approvals.service';

describe('Incomplete AI Review Envelope Policy Rejection (Spec §16 & LAB 16)', () => {
  let decisionRightsService: DecisionRightsService;
  let dualCustodyService: DualCustodyApprovalsService;
  let liveActionExecutor: LiveActionExecutorService;

  const tenantId = 'tenant-safety-audit-99';
  const environmentId = 'PRODUCTION-US-EAST';

  const mockKafkaProducer = {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    dualCustodyService = new DualCustodyApprovalsService();
    liveActionExecutor = new LiveActionExecutorService(dualCustodyService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DecisionRightsService,
          useFactory: () => new DecisionRightsService(mockKafkaProducer as any),
        },
      ],
    }).compile();

    decisionRightsService = module.get<DecisionRightsService>(
      DecisionRightsService,
    );
  });

  it('Invariant 1: Rejects envelope creation when supporting sources and spans are missing', () => {
    expect(() =>
      decisionRightsService.wrapInEnvelope({
        tenantId,
        environmentId,
        aiLabelAndUseCaseName: {
          aiLabel: 'AI Recommendation',
          useCaseName: 'RESPONSE_RECOMMENDATION',
          modelRoute: 'gemini-1.5-pro',
        },
        sourcesAndSpans: [], // Empty sources violates human oversight provenance
        calibratedConfidenceAndUncertainty: {
          score: 0.95,
          qualitativeBand: 'HIGH',
          calibrationBasis: 'Historical profile',
          uncertaintyFactors: [],
        },
        expectedImpactAndReversibility: {
          blastRadius: '0.01',
          isReversible: true,
          reversibilityTier: 'R1',
        },
        requiredAuthorityAndApprovals: {
          requiredRole: 'SECURITY_ANALYST',
          responseAuthorityTier: 'R1',
          dualApproverRequired: false,
        },
        payload: { action: 'BLOCK_IP' },
      }),
    ).toThrow(BadRequestException);
  });

  it('Invariant 2: Rejects envelope creation when calibrated confidence score is invalid or missing', () => {
    expect(() =>
      decisionRightsService.wrapInEnvelope({
        tenantId,
        environmentId,
        aiLabelAndUseCaseName: {
          aiLabel: 'AI Recommendation',
          useCaseName: 'RESPONSE_RECOMMENDATION',
          modelRoute: 'gemini-1.5-pro',
        },
        sourcesAndSpans: [
          {
            sourceId: 'src-1',
            sourceType: 'TELEMETRY',
            exactSpan: 'Anomalous SSH connection',
            confidence: 0.9,
          },
        ],
        calibratedConfidenceAndUncertainty: {
          score: 1.5, // Invalid score > 1.0 violates calibration bounds
          qualitativeBand: 'HIGH',
          calibrationBasis: 'Historical profile',
          uncertaintyFactors: [],
        } as any,
        expectedImpactAndReversibility: {
          blastRadius: '0.01',
          isReversible: true,
          reversibilityTier: 'R1',
        },
        requiredAuthorityAndApprovals: {
          requiredRole: 'SECURITY_ANALYST',
          responseAuthorityTier: 'R1',
          dualApproverRequired: false,
        },
        payload: { action: 'BLOCK_IP' },
      }),
    ).toThrow(BadRequestException);
  });

  it('Invariant 3: Rejects envelope creation when reversibility or blast radius is omitted', () => {
    expect(() =>
      decisionRightsService.wrapInEnvelope({
        tenantId,
        environmentId,
        aiLabelAndUseCaseName: {
          aiLabel: 'AI Recommendation',
          useCaseName: 'RESPONSE_RECOMMENDATION',
          modelRoute: 'gemini-1.5-pro',
        },
        sourcesAndSpans: [
          {
            sourceId: 'src-1',
            sourceType: 'TELEMETRY',
            exactSpan: 'Anomalous SSH connection',
            confidence: 0.9,
          },
        ],
        calibratedConfidenceAndUncertainty: {
          score: 0.9,
          qualitativeBand: 'HIGH',
          calibrationBasis: 'Historical profile',
          uncertaintyFactors: [],
        },
        expectedImpactAndReversibility: {} as any, // Missing blastRadius & reversibility
        requiredAuthorityAndApprovals: {
          requiredRole: 'SECURITY_ANALYST',
          responseAuthorityTier: 'R1',
          dualApproverRequired: false,
        },
        payload: { action: 'BLOCK_IP' },
      }),
    ).toThrow(BadRequestException);
  });

  it('Invariant 4: Prevents unreviewed AI proposal from triggering live execution in shield-action', async () => {
    // A raw unreviewed envelope without human sign-off
    const validEnvelope = decisionRightsService.wrapInEnvelope({
      tenantId,
      environmentId,
      aiLabelAndUseCaseName: {
        aiLabel: 'AI Recommendation',
        useCaseName: 'CONTAINMENT_RECOMMENDATION',
        modelRoute: 'gemini-1.5-pro',
      },
      sourcesAndSpans: [
        {
          sourceId: 'src-audit-99',
          sourceType: 'TELEMETRY',
          exactSpan: 'Brute force attempts from 198.51.100.99',
          confidence: 0.99,
        },
      ],
      calibratedConfidenceAndUncertainty: {
        score: 0.96,
        qualitativeBand: 'HIGH',
        calibrationBasis: 'Multi-source correlation match',
        uncertaintyFactors: [],
      },
      expectedImpactAndReversibility: {
        blastRadius: 'Edge perimeter rule only',
        isReversible: true,
        reversibilityTier: 'R2',
        compensationPlan: 'Immediate WAF rule retraction',
      },
      requiredAuthorityAndApprovals: {
        requiredRole: 'SECURITY_ENGINEER',
        responseAuthorityTier: 'R2',
        dualApproverRequired: true,
      },
      payload: {
        targetIp: '198.51.100.99',
        actionType: 'BLOCK_PERIMETER_IP',
      },
    });

    expect(validEnvelope.controls.state).toBe('UNREVIEWED');

    // Attempting live execution without dual-custody approval quorum must throw ForbiddenException
    await expect(
      liveActionExecutor.executeAction({
        tenantId,
        environmentId,
        actionType: 'BLOCK_PERIMETER_IP',
        targetRef: '198.51.100.99',
        authorityLevel: 'R2',
        approvalRef: undefined, // Missing approval reference
        isSimulation: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
