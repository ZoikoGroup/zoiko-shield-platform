import { Test, TestingModule } from '@nestjs/testing';
import { SafeDegradationService } from './safe-degradation.service';

describe('SafeDegradationService (ZS-ENG-AI-001 §27 Safe Operating Modes)', () => {
  let service: SafeDegradationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SafeDegradationService],
    }).compile();

    service = module.get<SafeDegradationService>(SafeDegradationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('resolves NOMINAL state with no degradation', () => {
    const res = service.resolveOperatingMode('NOMINAL');
    expect(res.actionRequired).toBe('PROCEED');
    expect(res.isDegraded).toBe(false);
    expect(res.blockExecution).toBe(false);
  });

  it('enforces FAIL_CLOSED for INJECTION_DETECTED and PROVIDER_INELIGIBLE', () => {
    const injection = service.resolveOperatingMode('INJECTION_DETECTED');
    expect(injection.actionRequired).toBe('FAIL_CLOSED');
    expect(injection.blockExecution).toBe(true);

    const ineligible = service.resolveOperatingMode('PROVIDER_INELIGIBLE');
    expect(ineligible.actionRequired).toBe('FAIL_CLOSED');
    expect(ineligible.blockExecution).toBe(true);
  });

  it('routes MODEL_UNAVAILABLE and KILL_ACTIVE to FALLBACK_DETERMINISTIC', () => {
    const modelUnavail = service.resolveOperatingMode('MODEL_UNAVAILABLE');
    expect(modelUnavail.actionRequired).toBe('FALLBACK_DETERMINISTIC');
    expect(modelUnavail.isDegraded).toBe(true);

    const killActive = service.resolveOperatingMode('KILL_ACTIVE');
    expect(killActive.actionRequired).toBe('FALLBACK_DETERMINISTIC');
    expect(killActive.isDegraded).toBe(true);
  });

  it('routes OUTPUT_UNGROUNDED and AGENT_BUDGET_EXHAUSTED to HUMAN_ONLY', () => {
    const ungrounded = service.resolveOperatingMode('OUTPUT_UNGROUNDED');
    expect(ungrounded.actionRequired).toBe('HUMAN_ONLY');

    const budget = service.resolveOperatingMode('AGENT_BUDGET_EXHAUSTED');
    expect(budget.actionRequired).toBe('HUMAN_ONLY');
  });
});
