import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  EMAIL_LLM_REVIEW_PORT,
  NotConfiguredEmailLlmReviewPort,
  type EmailLlmReviewPort,
} from './email-llm-review.port';
import { createHash } from 'crypto';

export interface EvaluateEmailFindingInput {
  tenantId: string;
  findingId: string;
  threatClass: string;
  provider: string;
  providerVerdict: string;
  subjectRef: string;
  observedSignals: {
    untrustedSnippet?: string;
    lookalikeDomainDetected?: boolean;
    authMisalignment?: boolean;
    bankDetailChangeRequested?: boolean;
    unusualExecutiveRequest?: boolean;
    oauthConsentSpike?: boolean;
    inboxForwardingRuleAdded?: boolean;
    impossibleTravelDetected?: boolean;
    allowAmbiguousLlmReview?: boolean;
    /**
     * @deprecated Client-supplied citations are UNTRUSTED and ignored. LLM
     * citations are accepted only from the gateway-backed review port.
     */
    llmProposedCitations?: string[];
  };
  allowedSourceRefs: string[];
}

export interface EmailDetectionDecisionResult {
  detectorTier: 'DETERMINISTIC' | 'BEHAVIORAL' | 'GUARDED_LLM';
  detectorVersion: string;
  modelVersion: string | null;
  sourceFacts: Array<{ ref: string; detail: string }>;
  inferences: string[];
  alternativeHypothesis: string;
  unknowns: string[];
  citationRefs: string[];
  abstained: boolean;
  confidenceScore: number;
  promptInjectionDetected: boolean;
  hallucinatedCitationRejected: boolean;
  recommendedVerdict: 'CONFIRMED' | 'BENIGN' | 'INSUFFICIENT_EVIDENCE';
  toolExecutionAllowed: false;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*prompt/i,
  /forward\s+all\s+(emails|messages)/i,
  /disable\s+(quarantine|security|alert)/i,
  /exfiltrate/i,
  /execute\s+tool/i,
];

/**
 * Three-stage BEC & Account Takeover detection & guarded investigation service (ZS-ZM-ENG-003 §06.2 & §11, WF-11/WF-12).
 * Enforces deterministic/behavioral priority, untrusted email delimiters, strict citation grounding (T23),
 * explicit ABSTAIN fallback (E12), and zero direct action authority (S04).
 */
@Injectable()
export class EmailBecAdjudicationService {
  private readonly logger = new Logger(EmailBecAdjudicationService.name);
  private readonly llmReview: EmailLlmReviewPort;

  constructor(
    @Optional()
    @Inject(EMAIL_LLM_REVIEW_PORT)
    llmReview?: EmailLlmReviewPort,
  ) {
    this.llmReview = llmReview ?? new NotConfiguredEmailLlmReviewPort();
  }

  /** Kill switch: when engaged only deterministic/behavioral tiers may run. */
  isAiKillSwitchEngaged(): boolean {
    return process.env.EMAIL_AI_KILL_SWITCH === 'true';
  }

  async evaluateFinding(
    input: EvaluateEmailFindingInput,
  ): Promise<EmailDetectionDecisionResult> {
    const snippet = input.observedSignals.untrustedSnippet || '';
    const promptInjectionDetected = PROMPT_INJECTION_PATTERNS.some((re) =>
      re.test(snippet),
    );

    const sourceFacts: Array<{ ref: string; detail: string }> = [];
    const inferences: string[] = [];
    const unknowns: string[] = [];
    const allowedSet = new Set(input.allowedSourceRefs);

    const primaryRef =
      input.allowedSourceRefs[0] || `finding:${input.findingId}`;
    if (input.allowedSourceRefs.length === 0) {
      unknowns.push(
        'No verified telemetry source reference attached to finding',
      );
    }

    // Stage 1: Deterministic provider & auth signals
    if (input.observedSignals.lookalikeDomainDetected) {
      sourceFacts.push({
        ref: primaryRef,
        detail:
          'Lookalike sender domain divergence observed in verified headers',
      });
      inferences.push('High-likelihood domain impersonation signal');
    }
    if (input.observedSignals.authMisalignment) {
      sourceFacts.push({
        ref: primaryRef,
        detail:
          'SPF/DKIM/DMARC alignment failed without valid forwarding ARC chain',
      });
    }
    if (input.observedSignals.bankDetailChangeRequested) {
      sourceFacts.push({
        ref: primaryRef,
        detail:
          'Supplier bank or payment routing modification indicator triggered',
      });
    }

    // Stage 2: Behavioral account-takeover correlation
    const atoSignals = [
      input.observedSignals.oauthConsentSpike &&
        'New high-risk OAuth consent grant',
      input.observedSignals.inboxForwardingRuleAdded &&
        'Suspicious mailbox forwarding rule creation',
      input.observedSignals.impossibleTravelDetected &&
        'Impossible-travel sign-in anomaly',
      input.observedSignals.unusualExecutiveRequest &&
        'Anomalous executive request pattern',
    ].filter((s): s is string => Boolean(s));

    for (const sig of atoSignals) {
      sourceFacts.push({ ref: primaryRef, detail: sig });
      inferences.push(`Correlated behavioral indicator: ${sig}`);
    }

    if (promptInjectionDetected) {
      unknowns.push(
        'Untrusted email text contained instruction-like payload; stripped and blocked from system control path',
      );
      this.logger.warn(
        `Prompt injection pattern neutralized in email finding=${input.findingId} tenant=${input.tenantId}`,
      );
    }

    // Stage 3: guarded LLM review. Citations come ONLY from the gateway-backed
    // port, never from the request. Ungrounded citations -> ABSTAIN (E12/T23).
    if (input.observedSignals.llmProposedCitations?.length) {
      unknowns.push(
        'Client-supplied LLM citations were ignored: only gateway-produced citations are trusted',
      );
    }
    let proposedCitations: string[] = [];
    let llmModelVersion: string | null = null;
    if (input.observedSignals.allowAmbiguousLlmReview) {
      if (this.isAiKillSwitchEngaged()) {
        unknowns.push('AI kill switch engaged: LLM review not executed');
      } else if (
        promptInjectionDetected ||
        input.allowedSourceRefs.length === 0
      ) {
        unknowns.push(
          'LLM review skipped: untrusted payload or no verified source references',
        );
      } else {
        const reviewed = await this.llmReview.review({
          tenantId: input.tenantId,
          findingId: input.findingId,
          untrustedSnippet: snippet,
          allowedSourceRefs: input.allowedSourceRefs,
        });
        if (reviewed) {
          proposedCitations = reviewed.proposedCitations;
          llmModelVersion = reviewed.modelVersion;
        } else {
          unknowns.push(
            'LLM review not executed: no gateway-backed model route is bound for this use case',
          );
        }
      }
    }
    const ungroundedCitations = proposedCitations.filter(
      (ref) => !allowedSet.has(ref),
    );
    const hallucinatedCitationRejected = ungroundedCitations.length > 0;

    if (hallucinatedCitationRejected) {
      unknowns.push(
        `Rejected ungrounded LLM citation reference(s): ${ungroundedCitations.join(', ')}`,
      );
    }

    const totalStrongFacts = sourceFacts.length;
    const mustAbstain =
      input.allowedSourceRefs.length === 0 ||
      hallucinatedCitationRejected ||
      totalStrongFacts === 0 ||
      promptInjectionDetected;

    let detectorTier: EmailDetectionDecisionResult['detectorTier'] =
      'DETERMINISTIC';
    if (atoSignals.length > 0) {
      detectorTier = 'BEHAVIORAL';
    }
    if (llmModelVersion && !mustAbstain && proposedCitations.length > 0) {
      detectorTier = 'GUARDED_LLM';
    }

    const validCitations = [
      ...new Set(
        [
          ...sourceFacts.map((f) => f.ref),
          ...proposedCitations.filter((c) => allowedSet.has(c)),
        ].filter(Boolean),
      ),
    ];

    const confidenceScore = mustAbstain
      ? 0.25
      : Math.min(0.96, 0.45 + totalStrongFacts * 0.14);

    return {
      detectorTier,
      detectorVersion: 'email-bec-ato-v1.0',
      modelVersion: detectorTier === 'GUARDED_LLM' ? llmModelVersion : null,
      sourceFacts,
      inferences,
      alternativeHypothesis:
        totalStrongFacts > 0
          ? 'Legitimate vendor banking workflow change or delegated executive correspondence; verify out-of-band.'
          : 'Insufficient verified metadata telemetry to classify intent.',
      unknowns,
      citationRefs: validCitations,
      abstained: mustAbstain,
      confidenceScore,
      promptInjectionDetected,
      hallucinatedCitationRejected,
      recommendedVerdict: mustAbstain
        ? 'INSUFFICIENT_EVIDENCE'
        : totalStrongFacts >= 2
          ? 'CONFIRMED'
          : 'INSUFFICIENT_EVIDENCE',
      toolExecutionAllowed: false,
    };
  }

  computeNativeBaselineComparison(
    decisions: Array<{
      nativeBaselineVerdict?: string | null;
      adjudicatedLabel?: string | null;
      abstained?: boolean;
      falsePositiveCostUsd?: number | null;
    }>,
  ) {
    const totalEvaluated = decisions.length;
    let nativeDetected = 0;
    let zoikoConfirmedTruePositives = 0;
    let incrementalMissedByNative = 0;
    let falsePositives = 0;
    let abstainedCount = 0;
    let totalFalsePositiveCostUsd = 0;

    for (const d of decisions) {
      if (d.abstained) abstainedCount += 1;
      const nativeHit = Boolean(
        d.nativeBaselineVerdict &&
        ['MALICIOUS', 'PHISHING', 'SUSPICIOUS', 'HIGH', 'CONFIRMED'].includes(
          d.nativeBaselineVerdict.toUpperCase(),
        ),
      );
      if (nativeHit) nativeDetected += 1;
      const confirmedThreat =
        (d.adjudicatedLabel || '').toUpperCase() === 'TRUE_POSITIVE' ||
        (d.adjudicatedLabel || '').toUpperCase() === 'CONFIRMED';
      const isFalsePositive =
        (d.adjudicatedLabel || '').toUpperCase() === 'FALSE_POSITIVE' ||
        (d.adjudicatedLabel || '').toUpperCase() === 'BENIGN';

      if (confirmedThreat) {
        zoikoConfirmedTruePositives += 1;
        if (!nativeHit) incrementalMissedByNative += 1;
      }
      if (isFalsePositive) {
        falsePositives += 1;
        totalFalsePositiveCostUsd += d.falsePositiveCostUsd ?? 0;
      }
    }

    const precisionDenominator = zoikoConfirmedTruePositives + falsePositives;
    const precision =
      precisionDenominator > 0
        ? Number(
            (zoikoConfirmedTruePositives / precisionDenominator).toFixed(4),
          )
        : null;
    const recallDenominator = zoikoConfirmedTruePositives;
    const recall =
      recallDenominator > 0
        ? Number(
            (
              zoikoConfirmedTruePositives /
              Math.max(1, nativeDetected + incrementalMissedByNative)
            ).toFixed(4),
          )
        : null;
    const abstentionRate =
      totalEvaluated > 0
        ? Number((abstainedCount / totalEvaluated).toFixed(4))
        : 0;

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          totalEvaluated,
          nativeDetected,
          incrementalMissedByNative,
          falsePositives,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    return {
      benchmarkRunId: `bench-${digest}`,
      totalEvaluated,
      nativeBaselineDetected: nativeDetected,
      zoikoConfirmedTruePositives,
      incrementalDetectionsMissedByNative: incrementalMissedByNative,
      falsePositives,
      totalFalsePositiveCostUsd,
      precision,
      recall,
      abstentionRate,
      methodologyNote:
        'Blinded comparison separates genuine incremental detections missed by Microsoft/Google native verdicts from duplicate alerts (S03 / T24 / T25).',
    };
  }
}
