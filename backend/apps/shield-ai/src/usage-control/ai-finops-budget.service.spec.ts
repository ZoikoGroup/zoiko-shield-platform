import { Test, TestingModule } from '@nestjs/testing';
import { AiFinOpsBudgetService } from './ai-finops-budget.service';

describe('AiFinOpsBudgetService (ZS-ENG-AI-001 §22 FinOps & DoW Defenses)', () => {
  let service: AiFinOpsBudgetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiFinOpsBudgetService],
    }).compile();

    service = module.get<AiFinOpsBudgetService>(AiFinOpsBudgetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows requests within default monthly budget limits', () => {
    const check = service.checkBudget('tenant-1', 0.1, 1000);
    expect(check.allowed).toBe(true);
    expect(check.remainingBudgetUsd).toBeLessThan(500);
  });

  it('blocks requests when tenant spend reaches monthly spend ceiling', () => {
    service.setTenantBudgetCap('tenant-1', {
      monthlyLimitUsd: 10.0,
      currentSpendUsd: 9.95,
    });

    const check = service.checkBudget('tenant-1', 0.1, 500);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Monthly AI budget cap exceeded');
  });

  it('blocks requests when tenant token usage exceeds monthly token limit', () => {
    service.setTenantBudgetCap('tenant-1', {
      monthlyTokenLimit: 10000,
      currentTokensUsed: 9500,
    });

    const check = service.checkBudget('tenant-1', 0.01, 600);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Monthly token limit exceeded');
  });

  it('blocks rapid call storms (Denial-of-Wallet loop protection)', () => {
    service.setTenantBudgetCap('tenant-1', {
      maxCallsPerMinute: 5,
    });

    for (let i = 0; i < 5; i++) {
      service.recordUsage({
        tenantId: 'tenant-1',
        useCase: 'AGENT_RUN',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 0.01,
      });
    }

    const check = service.checkBudget('tenant-1', 0.01, 100);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Rate ceiling exceeded');
  });
});
