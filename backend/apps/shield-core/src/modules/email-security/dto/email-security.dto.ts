import {
  IsArray,
  IsBoolean,
  IsIn,
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

  @IsOptional()
  @IsString()
  @MaxLength(256)
  pkceChallengeHash?: string;
}

export class VerifyEmailConnectionIntentDto {
  @IsString()
  oauthState!: string;

  @IsBoolean()
  consentGranted!: boolean;

  @IsArray()
  @IsString({ each: true })
  grantedScopes!: string[];

  @IsOptional()
  @IsBoolean()
  defenderLicenceVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  exchangeAppRbacVerified?: boolean;
}

export class DisconnectEmailConnectorDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SyncEmailConnectorDto {
  @IsArray()
  events!: Record<string, unknown>[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedCount?: number;

  @IsOptional()
  @IsBoolean()
  simulateRateLimit?: boolean;
}

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

export class RollbackEmailActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
