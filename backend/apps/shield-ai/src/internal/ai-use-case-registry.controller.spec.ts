import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AiUseCaseRegistryController } from './ai-use-case-registry.controller';
import { AiUseCaseRegistryService } from '../inventory/ai-use-case-registry.service';

describe('AiUseCaseRegistryController', () => {
  let controller: AiUseCaseRegistryController;
  let service: AiUseCaseRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiUseCaseRegistryController],
      providers: [AiUseCaseRegistryService],
    }).compile();

    controller = module.get<AiUseCaseRegistryController>(
      AiUseCaseRegistryController,
    );
    service = module.get<AiUseCaseRegistryService>(AiUseCaseRegistryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list all registered default use cases with AR-1/AR-2/AR-3 tiers', async () => {
    const res = await controller.listUseCases();
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect(res.data.total).toBeGreaterThanOrEqual(6);
    expect(res.data.useCases.some((u) => u.key === 'response-recommendation' && u.riskTier === 'AR-3')).toBe(true);
    expect(res.data.useCases.some((u) => u.key === 'case-summary' && u.riskTier === 'AR-1')).toBe(true);
  });

  it('should retrieve a specific use case by key', async () => {
    const res = await controller.getUseCase('response-recommendation');
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect(res.data.key).toBe('response-recommendation');
    expect(res.data.humanReviewRequired).toBe(true);
  });

  it('should update approval status', async () => {
    const res = await controller.updateStatus('case-summary', {
      status: 'IN_REVIEW',
    });
    expect(res.statusCode).toBe(HttpStatus.OK);
    expect(res.data.approvalStatus).toBe('IN_REVIEW');

    const updated = await controller.getUseCase('case-summary');
    expect(updated.data.approvalStatus).toBe('IN_REVIEW');
  });

  it('should validate execution eligibility against pinned model', async () => {
    const valid = await controller.validateEligibility('response-recommendation', {
      requestedModelVersion: 'gemini-1.5-pro-002',
    });
    expect(valid.data.eligible).toBe(true);

    const invalidModel = await controller.validateEligibility('response-recommendation', {
      requestedModelVersion: 'gpt-3.5-turbo',
    });
    expect(invalidModel.data.eligible).toBe(false);
    expect(invalidModel.data.reason).toContain('does not match pinned version');
  });
});
