import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmailConnectionIntentDto {
  @IsIn(['MICROSOFT_365', 'GOOGLE_WORKSPACE'])
  provider!: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsOptional()
  @IsIn(['READ_ONLY_TELEMETRY', 'PHASE1_METADATA_SCOPED', 'PHASE2_ACTIONS'])
  requestedMode?:
    'READ_ONLY_TELEMETRY' | 'PHASE1_METADATA_SCOPED' | 'PHASE2_ACTIONS';

  @IsArray()
  @IsString({ each: true })
  requestedScopes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  residencyCode?: string;
}

/**
 * Provider redirect result, posted by the frontend callback page. `state` is the
 * server-generated anti-CSRF value; the code is exchanged server-side with the
 * server-held PKCE verifier. Granted scopes come from the provider, never here.
 */
export class EmailOAuthCallbackDto {
  @IsString()
  @MaxLength(256)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  errorDescription?: string;
}

export class CreateMailBindingDto {
  @IsString()
  @MaxLength(200)
  displayName!: string;
}

/** Internal (shield-ingest -> shield-core) after envelope signature, registry, freshness and replay checks. */
export class InternalMailEventDto {
  @IsString() @MaxLength(256) tenantBindingId!: string;
  @IsString() @MaxLength(128) eventId!: string;
  @IsString() @MaxLength(128) eventType!: string;
  @IsString() @MaxLength(128) producer!: string;
  @IsString() @MaxLength(256) sourceEventId!: string;
  @IsString() occurredAt!: string;
  @IsString() observedAt!: string;
  @IsString() @MaxLength(256) subjectRef!: string;
  @IsOptional() @IsString() @MaxLength(128) threatClass?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceVerdict?: string;
  @IsOptional() @IsString() @MaxLength(64) actionState?: string;
  @IsOptional() @IsString() @MaxLength(128) policyId?: string;
  @IsOptional() @IsString() @MaxLength(128) policyVersion?: string;
  @IsString() @MaxLength(64) dataClass!: string;
  @IsOptional() @IsString() @MaxLength(64) residencyCode?: string;
  @IsString() @MaxLength(32) coverageState!: string;
  @IsOptional() @IsString() @MaxLength(512) evidenceRef?: string;
  @IsString() @MaxLength(256) payloadHash!: string;
  @IsOptional() @IsObject() coverage?: {
    windowStart: string;
    windowEnd: string;
    expectedCount: number;
    observedCount: number;
    gaps?: Array<{ reason: string; detail?: string }>;
  };
}

export class DisconnectEmailConnectorDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * Sync pulls from the provider server-side. Events, expected counts and fault
 * flags are deliberately NOT accepted from the caller (T02/T06).
 */
export class SyncEmailConnectorDto {}

export class RequestEmailBackfillDto {
  @IsString()
  windowStart!: string;

  @IsString()
  windowEnd!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class PromoteEmailThreatToCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export class RecordEmailAdjudicationDto {
  @IsIn(['CONFIRMED', 'BENIGN', 'FALSE_POSITIVE', 'INSUFFICIENT_EVIDENCE'])
  decision!:
    'CONFIRMED' | 'BENIGN' | 'FALSE_POSITIVE' | 'INSUFFICIENT_EVIDENCE';

  @IsString()
  @MaxLength(2000)
  rationale!: string;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  /** Optimistic concurrency (E07): version of the finding the analyst reviewed. */
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BuildEmailEvidenceExportDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controlIds?: string[];

  @IsString()
  timeStart!: string;

  @IsString()
  timeEnd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceProvider?: string;
}

export class GrantEmailAuditorAccessDto {
  @IsString()
  auditorPrincipalId!: string;

  @IsNumber()
  @Min(1)
  expiresInHours!: number;

  /** Only these manifests are shared (WF-09 "expressly shared evidence", T09). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  manifestIds!: string[];
}

export class DraftEmailPolicyDto {
  @IsString()
  @MaxLength(100)
  policyKey!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  providerCoverage!: string[];

  @IsArray()
  @IsString({ each: true })
  inputSources!: string[];

  @IsObject()
  severityMapping!: Record<string, string>;

  @IsString()
  @MaxLength(2000)
  rationale!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  falsePositiveImpact?: string;
}

export class ApproveOrActivateEmailPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class LabelEmailBehaviourDto {
  @IsString()
  findingId!: string;

  @IsIn(['TRUE_POSITIVE', 'FALSE_POSITIVE', 'BENIGN', 'INSUFFICIENT_EVIDENCE'])
  label!:
    'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'BENIGN' | 'INSUFFICIENT_EVIDENCE';

  @IsOptional()
  @IsString()
  nativeBaselineVerdict?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  falsePositiveCostUsd?: number;
}

export class DecideEmailAnalysisDto {
  @IsIn(['CONFIRMED', 'BENIGN', 'INSUFFICIENT_EVIDENCE'])
  decision!: 'CONFIRMED' | 'BENIGN' | 'INSUFFICIENT_EVIDENCE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;

  /** Optimistic concurrency (E07). */
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ProposeEmailActionDto {
  @IsOptional()
  @IsString()
  findingId?: string;

  @IsIn(['MICROSOFT_365', 'GOOGLE_WORKSPACE'])
  provider!: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';

  @IsIn([
    'QUARANTINE_MESSAGE',
    'PULL_BACK_MESSAGE',
    'REMOVE_FORWARDING_RULE',
    'REVOKE_MAILBOX_SESSIONS',
  ])
  requestedAction!:
    | 'QUARANTINE_MESSAGE'
    | 'PULL_BACK_MESSAGE'
    | 'REMOVE_FORWARDING_RULE'
    | 'REVOKE_MAILBOX_SESSIONS';

  @IsArray()
  @IsString({ each: true })
  targetRefs!: string[];

  @IsString()
  consentScope!: string;

  @IsOptional()
  @IsIn(['R2', 'R3', 'R4'])
  riskClass?: 'R2' | 'R3' | 'R4';
}

export class ApproveEmailActionDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInMinutes?: number;
}

export class RevokeEmailAccessDto {
  @IsString()
  connectionId!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class EvaluateEmailAiDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  untrustedSnippet?: string;

  @IsOptional()
  @IsBoolean()
  lookalikeDomainDetected?: boolean;

  @IsOptional()
  @IsBoolean()
  authMisalignment?: boolean;

  @IsOptional()
  @IsBoolean()
  bankDetailChangeRequested?: boolean;

  @IsOptional()
  @IsBoolean()
  unusualExecutiveRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  oauthConsentSpike?: boolean;

  @IsOptional()
  @IsBoolean()
  inboxForwardingRuleAdded?: boolean;

  @IsOptional()
  @IsBoolean()
  impossibleTravelDetected?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAmbiguousLlmReview?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  llmProposedCitations?: string[];
}

export class ExecuteEmailActionDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class RollbackEmailActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
