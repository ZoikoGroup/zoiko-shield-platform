import { Test, TestingModule } from '@nestjs/testing';
import {
  AiUseCaseRegistryService,
  AiUseCaseDefinition,
} from './ai-use-case-registry.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AiUseCaseRegistryService (§05 AI Use Case Governance & Risk Registry)', () => {
  let service: AiUseCaseRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiUseCaseRegistryService],
    }).compile();

    service = module.get<AiUseCaseRegistryService>(AiUseCaseRegistryService);
  });

  it('should be defined and seed default certified use cases', () => {
    expect(service).toBeDefined();
    const useCases = service.listUseCases();
    expect(useCases.length).toBeGreaterThanOrEqual(6);

    const responseRec = service.getUseCase('response-recommendation');
    expect(responseRec.riskTier).toBe('AR-3');
    expect(responseRec.humanReviewRequired).toBe(true);
    expect(responseRec.pinnedModelVersion).toBe('gemini-1.5-pro-002');
  });

  it('should register a new custom use case with valid metadata', () => {
    const customUseCase: Omit<
      AiUseCaseDefinition,
      'registeredAt' | 'updatedAt'
    > = {
      key: 'custom-phishing-classifier',
      name: 'Custom Email Phishing Classifier',
      owner: 'SecOps-Email-Team',
      riskTier: 'AR-2',
      approvalStatus: 'IN_REVIEW',
      pinnedModelVersion: 'gemini-1.5-flash-002',
      fallbackEngine: 'Header Heuristic Analyzer',
      humanReviewRequired: true,
      minGroundingScore: 0.85,
      minCitationPrecision: 0.9,
      allowedDataClasses: ['INTERNAL_TELEMETRY'],
    };

    const registered = service.registerUseCase(customUseCase);
    expect(registered.key).toBe('custom-phishing-classifier');
    expect(registered.approvalStatus).toBe('IN_REVIEW');

    expect(() => service.registerUseCase(customUseCase)).toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when querying an unregistered use case', () => {
    expect(() => service.getUseCase('non-existent-use-case')).toThrow(
      NotFoundException,
    );
  });

  it('should update approval status of a use case', () => {
    const updated = service.updateApprovalStatus('case-summary', 'DEPRECATED');
    expect(updated.approvalStatus).toBe('DEPRECATED');

    const eligibility = service.validateExecutionEligibility(
      'case-summary',
      'gemini-1.5-flash-002',
    );
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('DEPRECATED');
  });

  it('should enforce model version pinning during execution eligibility check', () => {
    // Valid pinned version
    const validCheck = service.validateExecutionEligibility(
      'response-recommendation',
      'gemini-1.5-pro-002',
    );
    expect(validCheck.eligible).toBe(true);

    // Unapproved / experimental model version
    const invalidCheck = service.validateExecutionEligibility(
      'response-recommendation',
      'unapproved-experimental-model-v9',
    );
    expect(invalidCheck.eligible).toBe(false);
    expect(invalidCheck.reason).toContain('does not match pinned version');
  });
});
