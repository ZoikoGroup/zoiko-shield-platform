import { Test, TestingModule } from '@nestjs/testing';
import {
  AiSystemInventoryService,
  AiModelProfile,
} from './ai-system-inventory.service';

describe('AiSystemInventoryService (Section 05 AI Architecture & NIST/EU AI Act)', () => {
  let service: AiSystemInventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiSystemInventoryService],
    }).compile();

    service = module.get<AiSystemInventoryService>(AiSystemInventoryService);
  });

  it('should seed and list default registered AI models', () => {
    const models = service.listRegisteredModels();
    expect(models.length).toBeGreaterThanOrEqual(3);

    const geminiPro = service.getModelProfile('gemini-1.5-pro');
    expect(geminiPro).toBeDefined();
    expect(geminiPro?.provider).toBe('Google');
    expect(geminiPro?.euAiActClassification).toBe('LIMITED_RISK');
    expect(geminiPro?.nistRmfAlignment).toContain('GOVERN');
    expect(geminiPro?.humanOversightRequired).toBe(true);
  });

  it('should compute valid inventory summary with HHI provider concentration index', () => {
    const summary = service.computeInventorySummary();

    expect(summary.inventoryVersion).toBe('1.0.0-NIST-EUAI');
    expect(summary.totalRegisteredModels).toBe(3);
    expect(summary.governanceComplianceStatus).toBe('COMPLIANT_NIST_EU_AI_ACT');
    expect(summary.providerConcentrationHhi).toBeGreaterThan(0);
    expect(summary.highRiskUseCasesCount).toBe(2);
  });

  it('should allow registering a custom AI model profile', () => {
    const customModel: AiModelProfile = {
      modelId: 'custom-local-llama',
      provider: 'Local',
      modelFamily: 'Llama',
      version: '3.1-8b',
      euAiActClassification: 'MINIMAL_RISK',
      nistRmfAlignment: ['MAP', 'MEASURE'],
      purpose: 'Local sovereign inference',
      primaryUseCaseKeys: ['SOVEREIGN_TRANSLATION'],
      deterministicFallbackEngine: 'Deterministic Dictionary',
      hhiWeight: 0.05,
      humanOversightRequired: false,
    };

    const registered = service.registerModel(customModel);
    expect(registered.modelId).toBe('custom-local-llama');
    expect(registered.lifecycleState).toBe('PROPOSED');
    expect(registered.registeredAt).toBeDefined();

    const retrieved = service.getModelProfile('custom-local-llama');
    expect(retrieved).toBeDefined();
    expect(retrieved?.modelId).toBe('custom-local-llama');
    expect(retrieved?.provider).toBe('Local');

    // Test updating lifecycle state
    const updated = service.updateModel('custom-local-llama', { lifecycleState: 'APPROVED_FOR_PRODUCTION' });
    expect(updated.lifecycleState).toBe('APPROVED_FOR_PRODUCTION');

    // Test decommissioning
    const deleted = service.deleteModel('custom-local-llama');
    expect(deleted).toBe(true);
    expect(service.getModelProfile('custom-local-llama')?.lifecycleState).toBe('DECOMMISSIONED');
  });
});
