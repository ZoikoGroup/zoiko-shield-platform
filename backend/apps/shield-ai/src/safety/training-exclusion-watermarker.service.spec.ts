import { Test, TestingModule } from '@nestjs/testing';
import { TrainingExclusionWatermarkerService } from './training-exclusion-watermarker.service';

describe('TrainingExclusionWatermarkerService', () => {
  let service: TrainingExclusionWatermarkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingExclusionWatermarkerService],
    }).compile();

    service = module.get<TrainingExclusionWatermarkerService>(
      TrainingExclusionWatermarkerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should apply training-exclusion watermark and return verifiable receipt', () => {
    const tenantId = 'tenant-sovereign-01';
    const prompt = 'Analyze incident case-402 for IAM privilege anomaly.';

    const result = service.applyTrainingExclusionWatermark(
      tenantId,
      prompt,
      'VERTEX_AI_GEMINI_1_5_PRO',
    );

    expect(result.watermarkedPayload).toContain(
      'ZOIKO-SHIELD-EXCLUSION-TOKEN:',
    );
    expect(result.watermarkedPayload).toContain(prompt);
    expect(result.receipt.trainingExclusionStatus).toBe(
      'GUARANTEED_ZERO_RETENTION_EXCLUDED',
    );
    expect(result.receipt.tenantId).toBe(tenantId);
    expect(result.receipt.cryptographicSignature).toBeDefined();
  });

  it('should successfully verify a valid watermarked payload', () => {
    const tenantId = 'tenant-sovereign-02';
    const prompt = 'Summarize cloud security findings.';

    const { watermarkedPayload } = service.applyTrainingExclusionWatermark(
      tenantId,
      prompt,
    );

    const verification = service.verifyExclusionWatermark(
      tenantId,
      watermarkedPayload,
    );

    expect(verification.verified).toBe(true);
    expect(verification.tamperDetected).toBe(false);
    expect(verification.tenantId).toBe(tenantId);
  });

  it('should flag tampering if tenant identifier in token is mismatched', () => {
    const tenantId = 'tenant-sovereign-03';
    const attackerTenantId = 'tenant-attacker-99';
    const prompt = 'Investigate endpoint alert.';

    const { watermarkedPayload } = service.applyTrainingExclusionWatermark(
      tenantId,
      prompt,
    );

    const verification = service.verifyExclusionWatermark(
      attackerTenantId,
      watermarkedPayload,
    );

    expect(verification.verified).toBe(false);
    expect(verification.tamperDetected).toBe(true);
  });
});
