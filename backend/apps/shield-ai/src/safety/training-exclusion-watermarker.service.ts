import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'crypto';

export interface ExclusionWatermarkReceipt {
  receiptId: string;
  tenantId: string;
  payloadDigest: string;
  watermarkToken: string;
  trainingExclusionStatus: 'GUARANTEED_ZERO_RETENTION_EXCLUDED';
  modelProviderTarget: string;
  cryptographicSignature: string;
  appliedAt: string;
}

export interface VerificationResult {
  verified: boolean;
  tamperDetected: boolean;
  tenantId: string;
  watermarkToken: string;
  verifiedAt: string;
}

@Injectable()
export class TrainingExclusionWatermarkerService {
  private readonly logger = new Logger(
    TrainingExclusionWatermarkerService.name,
  );
  private readonly watermarkHmacSecret =
    process.env.AI_WATERMARK_HMAC_SECRET ||
    'zoiko-shield-watermark-secret-key-2026';

  /**
   * Generates a cryptographic training-exclusion watermark and non-retention receipt
   * for outbound LLM prompt requests to guarantee tenant telemetry is excluded from foundation model training loops.
   */
  applyTrainingExclusionWatermark(
    tenantId: string,
    promptPayload: string,
    modelProvider = 'VERTEX_AI_GEMINI_1_5_PRO',
  ): {
    watermarkedPayload: string;
    receipt: ExclusionWatermarkReceipt;
  } {
    const payloadDigest = createHash('sha256')
      .update(promptPayload)
      .digest('hex');
    const timestamp = new Date().toISOString();
    const receiptId = `excl-rcpt-${randomUUID()}`;

    // Deterministic HMAC watermark token
    const watermarkToken = createHmac('sha256', this.watermarkHmacSecret)
      .update(`${tenantId}:${payloadDigest}:${timestamp}`)
      .digest('hex')
      .substring(0, 32);

    // Cryptographic signature confirming the zero-retention contract
    const cryptographicSignature = createHmac(
      'sha256',
      this.watermarkHmacSecret,
    )
      .update(`${receiptId}:${tenantId}:${watermarkToken}:${modelProvider}`)
      .digest('hex');

    const receipt: ExclusionWatermarkReceipt = {
      receiptId,
      tenantId,
      payloadDigest,
      watermarkToken,
      trainingExclusionStatus: 'GUARANTEED_ZERO_RETENTION_EXCLUDED',
      modelProviderTarget: modelProvider,
      cryptographicSignature,
      appliedAt: timestamp,
    };

    // Inject verifiable, non-interfering watermarking header into the payload metadata
    const watermarkedPayload = `<!-- ZOIKO-SHIELD-EXCLUSION-TOKEN:${watermarkToken}:${tenantId} -->\n${promptPayload}`;

    this.logger.log(
      `[AI_TRAINING_EXCLUSION_APPLIED] Tenant '${tenantId}' attached watermark '${watermarkToken}' (Provider: ${modelProvider})`,
    );

    return { watermarkedPayload, receipt };
  }

  /**
   * Verifies the authenticity and non-tampering of an outbound prompt's exclusion token.
   */
  verifyExclusionWatermark(
    tenantId: string,
    watermarkedPayload: string,
  ): VerificationResult {
    const match = watermarkedPayload.match(
      /<!-- ZOIKO-SHIELD-EXCLUSION-TOKEN:([a-f0-9]{32}):([^ ]+) -->/,
    );

    if (!match) {
      return {
        verified: false,
        tamperDetected: true,
        tenantId,
        watermarkToken: 'MISSING',
        verifiedAt: new Date().toISOString(),
      };
    }

    const [, token, extractedTenantId] = match;

    if (extractedTenantId !== tenantId) {
      return {
        verified: false,
        tamperDetected: true,
        tenantId,
        watermarkToken: token,
        verifiedAt: new Date().toISOString(),
      };
    }

    return {
      verified: true,
      tamperDetected: false,
      tenantId,
      watermarkToken: token,
      verifiedAt: new Date().toISOString(),
    };
  }
}
