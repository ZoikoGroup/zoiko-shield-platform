import { Test, TestingModule } from '@nestjs/testing';
import {
  DetectionExplanationService,
  DETECTION_EXPLANATION_USE_CASE_KEY,
} from './detection-explanation.service';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

describe('DetectionExplanationService (ZS-ENG-AI-001 §17 & §18)', () => {
  let service: DetectionExplanationService;
  let gatewayMock: { invoke: jest.Mock };

  const mockContext: GatewayRequestContext = {
    tenantId: 'tenant-test-1',
    environmentId: 'env-prod-1',
    region: 'us-east-1',
    dataClass: 'CONFIDENTIAL',
    purpose: 'Detection Explanation',
    actorId: 'user-analyst-1',
    caseId: 'case-test-1',
    authorizationDecisionId: 'authz-decision-1',
    correlationId: 'corr-1',
    traceId: 'trace-1',
  };

  beforeEach(async () => {
    gatewayMock = {
      invoke: jest.fn().mockResolvedValue({
        id: 'out-2',
        outputType: DETECTION_EXPLANATION_USE_CASE_KEY,
        content: JSON.stringify({
          ruleSummary: 'Threshold of 5 failed logins within 60s was exceeded (7 observed)',
          truePositiveIndicators: ['Non-standard user-agent', 'Multiple source IPs targeting single account'],
          recommendedTuning: 'Consider adding geographic subnet whitelist to reduce false positives from corporate VPN',
          citations: ['evt-test-1', 'evt-test-2'],
        }),
        citations: ['evt-test-1', 'evt-test-2'],
        safetyResult: 'PASS',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionExplanationService,
        { provide: AiGatewayService, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get<DetectionExplanationService>(
      DetectionExplanationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('invokes AI gateway with DETECTION_EXPLANATION key and scoped purpose', async () => {
    const result = await service.explainMatch(
      {
        ruleId: 'rule-threshold-failed-login',
        ruleVersion: 1,
        alertId: 'alt-1',
        matchedEventIds: ['evt-test-1', 'evt-test-2'],
      },
      mockContext,
    );

    expect(gatewayMock.invoke).toHaveBeenCalledTimes(1);
    expect(gatewayMock.invoke).toHaveBeenCalledWith(
      DETECTION_EXPLANATION_USE_CASE_KEY,
      DETECTION_EXPLANATION_USE_CASE_KEY,
      expect.objectContaining({
        tenantId: 'tenant-test-1',
        purpose: expect.stringContaining('rule-threshold-failed-login'),
      }),
    );
    expect(result.id).toBe('out-2');
  });
});
