import { Test, TestingModule } from '@nestjs/testing';
import {
  DetectionCandidateService,
  DETECTION_CANDIDATE_USE_CASE_KEY,
} from './detection-candidate.service';
import {
  AiGatewayService,
  GatewayRequestContext,
} from '../../gateway/ai-gateway.service';

describe('DetectionCandidateService (ZS-ENG-AI-001 §17)', () => {
  let service: DetectionCandidateService;
  let gatewayMock: { invoke: jest.Mock };

  const mockContext: GatewayRequestContext = {
    tenantId: 'tenant-test-1',
    environmentId: 'env-prod-1',
    region: 'us-east-1',
    dataClass: 'CONFIDENTIAL',
    purpose: 'Detection Engineering',
    actorId: 'user-engineer-1',
    caseId: 'case-test-1',
    authorizationDecisionId: 'authz-decision-1',
    correlationId: 'corr-1',
    traceId: 'trace-1',
  };

  beforeEach(async () => {
    gatewayMock = {
      invoke: jest.fn().mockResolvedValue({
        id: 'out-1',
        outputType: DETECTION_CANDIDATE_USE_CASE_KEY,
        content: JSON.stringify({
          key: 'rule-impossible-travel',
          name: 'Impossible Travel Velocity Detected',
          severity: 'HIGH',
          ruleType: 'POINT',
          status: 'DRAFT',
          reviewState: 'AI_PROPOSED',
          mitreTechnique: 'T1078.004',
          syntheticTestEvents: [
            { description: 'London to Tokyo in 10 mins', shouldMatch: true },
          ],
        }),
        citations: ['evt-test-1'],
        safetyResult: 'PASS',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionCandidateService,
        { provide: AiGatewayService, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get<DetectionCandidateService>(DetectionCandidateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('invokes AI gateway with DETECTION_CANDIDATE key and scoped purpose', async () => {
    const result = await service.generateCandidate(
      {
        name: 'Impossible Travel Velocity',
        description: 'Detects logins from distant geographies in short windows',
        targetEventTypes: ['user.login', 'auth.success'],
        mitreTechnique: 'T1078.004',
      },
      mockContext,
    );

    expect(gatewayMock.invoke).toHaveBeenCalledTimes(1);
    expect(gatewayMock.invoke).toHaveBeenCalledWith(
      DETECTION_CANDIDATE_USE_CASE_KEY,
      DETECTION_CANDIDATE_USE_CASE_KEY,
      expect.objectContaining({
        tenantId: 'tenant-test-1',
        purpose: expect.stringContaining('Impossible Travel Velocity'),
      }),
    );
    expect(result.id).toBe('out-1');
  });
});
