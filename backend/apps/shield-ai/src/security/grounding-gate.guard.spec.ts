import { Test, TestingModule } from '@nestjs/testing';
import { GroundingGateGuard } from './grounding-gate.guard';
import { UnprocessableEntityException, ExecutionContext } from '@nestjs/common';

describe('GroundingGateGuard (Differential Risk Tier AR-1 / AR-2 / AR-3 Enforcement)', () => {
  let guard: GroundingGateGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroundingGateGuard],
    }).compile();

    guard = module.get<GroundingGateGuard>(GroundingGateGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('AR-1 (Assistive Low) Tier Testing', () => {
    it('should allow AR-1 assistive output with 80% grounding and 85% precision', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              riskTier: 'AR-1',
              groundingScore: 0.8,
              citationPrecision: 0.85,
              citedSourceRefs: ['doc-1'],
              allowedSourceRefs: ['doc-1', 'doc-2'],
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should reject AR-1 assistive output if grounding falls below 75%', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              riskTier: 'AR-1',
              groundingScore: 0.7, // Below 0.75 for AR-1
              citationPrecision: 0.85,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('AR-2 (Controlled Advisory) Tier Testing', () => {
    it('should allow AR-2 advisory output with 90% grounding and 92% precision', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              riskTier: 'AR-2',
              groundingScore: 0.9,
              citationPrecision: 0.92,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should reject AR-2 advisory output if grounding is 80% (which would pass AR-1 but fails AR-2)', () => {
      const evalResult = guard.evaluateGrounding({
        riskTier: 'AR-2',
        groundingScore: 0.8, // Passes AR-1 (0.75) but FAILS AR-2 (0.85)
        citationPrecision: 0.92,
      });

      expect(evalResult.passed).toBe(false);
      expect(evalResult.riskTier).toBe('AR-2');
      expect(evalResult.minGroundingThreshold).toBe(0.85);
      expect(evalResult.requiresHumanReview).toBe(true);
    });
  });

  describe('AR-3 (High-Control Agentic) Tier Testing', () => {
    it('should allow AR-3 agentic output when grounding is >= 95%, precision >= 98%, and simulation receipt exists', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              riskTier: 'AR-3',
              groundingScore: 0.98,
              citationPrecision: 0.99,
              hasSimulationReceipt: true,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should reject AR-3 agentic output if simulation receipt is missing even with 100% grounding', () => {
      const evalResult = guard.evaluateGrounding({
        riskTier: 'AR-3',
        groundingScore: 1.0,
        citationPrecision: 1.0,
        hasSimulationReceipt: false,
      });

      expect(evalResult.passed).toBe(false);
      expect(
        evalResult.blockingReasons.some((r) =>
          r.includes('simulation receipt'),
        ),
      ).toBe(true);
      expect(evalResult.actionRequired).toBe(
        'DIVERT_TO_DETERMINISTIC_FALLBACK',
      );
    });

    it('should reject AR-3 agentic output if grounding is 90% (which passes AR-1 and AR-2 but fails AR-3)', () => {
      const evalResult = guard.evaluateGrounding({
        riskTier: 'AR-3',
        groundingScore: 0.9,
        citationPrecision: 0.95,
        hasSimulationReceipt: true,
      });

      expect(evalResult.passed).toBe(false);
      expect(evalResult.minGroundingThreshold).toBe(0.95);
      expect(evalResult.minPrecisionThreshold).toBe(0.98);
    });
  });
});
