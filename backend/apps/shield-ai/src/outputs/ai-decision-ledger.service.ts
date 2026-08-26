import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';

export interface DecisionSourceSpan {
  id: string;
  version: number;
  span: string;
}

export interface AiDecisionValidationState {
  schema: 'pass' | 'fail';
  grounding: 'pass' | 'fail';
  citations: 'pass' | 'fail';
}

export interface AiDecisionHumanReviewState {
  state: 'APPROVED' | 'MODIFIED' | 'REJECTED';
  actor: string;
  reason?: string;
}

export interface AiDecisionCostMetrics {
  tokensIn: number;
  tokensOut: number;
  amountUsd: number;
}

export interface AiDecisionRecord {
  requestId: string;
  tenantId: string;
  actorId: string;
  useCaseId: string;
  policyVersions: string[];
  promptProfile: { id: string; version: number };
  contextManifestHash: string;
  sources: DecisionSourceSpan[];
  modelRoute: string;
  outputHash: string;
  validation: AiDecisionValidationState;
  humanDecision?: AiDecisionHumanReviewState;
  tools: string[];
  cost: AiDecisionCostMetrics;
  evidenceId: string;
  createdAt: Date;
}

/**
 * ZS-ENG-AI-001 §29 (Example D) & §18: AI Decision and Evidence Trace.
 * Emits cryptographic, machine-readable AI decision records linking prompt,
 * context manifest, output hash, and token costs to the immutable Evidence Ledger.
 */
@Injectable()
export class AiDecisionLedgerService {
  private readonly logger = new Logger(AiDecisionLedgerService.name);
  private readonly records = new Map<string, AiDecisionRecord>();

  createDecisionRecord(params: {
    tenantId: string;
    actorId: string;
    useCaseId: string;
    policyVersions: string[];
    promptProfile: { id: string; version: number };
    contextPayload: string;
    outputContent: string;
    sources: DecisionSourceSpan[];
    modelRoute: string;
    validation: AiDecisionValidationState;
    tools?: string[];
    cost?: Partial<AiDecisionCostMetrics>;
  }): AiDecisionRecord {
    const requestId = `ai-dec-${crypto.randomUUID()}`;
    const evidenceId = `ev-ai-${crypto.randomUUID()}`;

    const contextManifestHash = crypto
      .createHash('sha256')
      .update(params.contextPayload || '{}')
      .digest('hex');

    const outputHash = crypto
      .createHash('sha256')
      .update(params.outputContent || '')
      .digest('hex');

    const tokensIn =
      params.cost?.tokensIn ?? Math.ceil(params.contextPayload.length / 4);
    const tokensOut =
      params.cost?.tokensOut ?? Math.ceil(params.outputContent.length / 4);
    const amountUsd =
      params.cost?.amountUsd ??
      Number((tokensIn * 0.000003 + tokensOut * 0.000015).toFixed(4));

    const record: AiDecisionRecord = {
      requestId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      useCaseId: params.useCaseId,
      policyVersions: params.policyVersions,
      promptProfile: params.promptProfile,
      contextManifestHash,
      sources: params.sources,
      modelRoute: params.modelRoute,
      outputHash,
      validation: params.validation,
      tools: params.tools || [],
      cost: { tokensIn, tokensOut, amountUsd },
      evidenceId,
      createdAt: new Date(),
    };

    this.records.set(requestId, record);
    return record;
  }

  getDecisionRecord(tenantId: string, requestId: string): AiDecisionRecord {
    const record = this.records.get(requestId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException(
        `AiDecisionRecord '${requestId}' not found for tenant '${tenantId}'`,
      );
    }
    return record;
  }

  attachHumanDecision(
    tenantId: string,
    requestId: string,
    review: AiDecisionHumanReviewState,
  ): AiDecisionRecord {
    const record = this.getDecisionRecord(tenantId, requestId);
    record.humanDecision = review;
    this.records.set(requestId, record);
    return record;
  }

  verifyIntegrity(
    record: AiDecisionRecord,
    contextPayload: string,
    outputContent: string,
  ): boolean {
    const expectedContextHash = crypto
      .createHash('sha256')
      .update(contextPayload)
      .digest('hex');
    const expectedOutputHash = crypto
      .createHash('sha256')
      .update(outputContent)
      .digest('hex');

    return (
      record.contextManifestHash === expectedContextHash &&
      record.outputHash === expectedOutputHash
    );
  }
}
