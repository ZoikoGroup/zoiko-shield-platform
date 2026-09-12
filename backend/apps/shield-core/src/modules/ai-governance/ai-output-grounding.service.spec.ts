import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  AiOutputGroundingService,
  GroundingValidationRequest,
} from './ai-output-grounding.service';

describe('AiOutputGroundingService (Section 18 AI Output Grounding & Disclosure)', () => {
  let service: AiOutputGroundingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiOutputGroundingService],
    }).compile();

    service = module.get<AiOutputGroundingService>(AiOutputGroundingService);
  });

  it('should successfully validate and certify grounded AI output', () => {
    const request: GroundingValidationRequest = {
      useCaseName: 'RESPONSE_RECOMMENDATION',
      aiModelId: 'gemini-1.5-pro',
      outputContent: 'Recommend isolating endpoint srv-app-prod-02 due to detected privilege escalation.',
      sources: [
        {
          sourceId: 'alert-001',
          sourceType: 'EDR_TELEMETRY',
          exactSpan: 'Mimikatz memory injection detected on host srv-app-prod-02',
        },
      ],
      confidenceScore: 0.92,
      tenantId: 'tenant-test-01',
      environmentId: 'prod-us-east',
    };

    const result = service.validateAndCertifyGrounding(request);

    expect(result.isGrounded).toBe(true);
    expect(result.groundingScore).toBeGreaterThan(0.5);
    expect(result.citationsCount).toBe(1);
    expect(result.groundingProofHash).toHaveLength(64);
    expect(result.transparencyDisclosure.aiModel).toBe('gemini-1.5-pro');
    expect(result.transparencyDisclosure.humanDecisionRequired).toBe(true);
  });

  it('should reject ungrounded AI output when sources are empty', () => {
    const request: GroundingValidationRequest = {
      useCaseName: 'RESPONSE_RECOMMENDATION',
      aiModelId: 'gemini-1.5-pro',
      outputContent: 'Recommend isolating endpoint without citations.',
      sources: [],
      confidenceScore: 0.95,
      tenantId: 'tenant-test-01',
      environmentId: 'prod-us-east',
    };

    expect(() => service.validateAndCertifyGrounding(request)).toThrow(
      BadRequestException,
    );
  });

  it('should reject AI output with low confidence below threshold', () => {
    const request: GroundingValidationRequest = {
      useCaseName: 'RESPONSE_RECOMMENDATION',
      aiModelId: 'gemini-1.5-pro',
      outputContent: 'Uncertain recommendation.',
      sources: [
        {
          sourceId: 'src-01',
          sourceType: 'LOG',
          exactSpan: 'some log entry',
        },
      ],
      confidenceScore: 0.45,
      tenantId: 'tenant-test-01',
      environmentId: 'prod-us-east',
    };

    expect(() => service.validateAndCertifyGrounding(request)).toThrow(
      BadRequestException,
    );
  });
});
