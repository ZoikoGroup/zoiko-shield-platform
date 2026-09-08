export type AiIncidentSeverity =
  | 'SEV1_CRITICAL'
  | 'SEV2_HIGH'
  | 'SEV3_MEDIUM'
  | 'SEV4_LOW';

export type AiIncidentStatus =
  | 'DECLARED'
  | 'CONTAINED_KILL_SWITCH'
  | 'FALLBACK_ACTIVE'
  | 'ROOT_CAUSE_ANALYZED'
  | 'RESOLVED'
  | 'CLOSED';

export type AiIncidentCategory =
  | 'MODEL_HALLUCINATION'
  | 'PROMPT_INJECTION_EXPLOIT'
  | 'DATA_EXFILTRATION'
  | 'UNAUTHORIZED_TOOL_INVOCATION'
  | 'UNAVAILABLE_DEGRADATION'
  | 'DRIFT_ANOMALY';

export class DeclareAiIncidentDto {
  title!: string;
  category!: AiIncidentCategory;
  severity!: AiIncidentSeverity;
  description!: string;
  affectedModel?: string;
  affectedPromptKey?: string;
  affectedTool?: string;
  autoContain?: boolean;
}

export class ContainIncidentDto {
  reason!: string;
  killSwitchScope!: 'GLOBAL' | 'TENANT' | 'FEATURE' | 'PROMPT' | 'MODEL_ROUTE' | 'PROVIDER' | 'AGENT' | 'TOOL';
  targetId!: string;
  containedBy!: string;
}

export class FallbackIncidentDto {
  fallbackStrategy!: 'DETERMINISTIC_RULES' | 'SECONDARY_MODEL' | 'CACHED_RESPONSE' | 'DEGRADED_PASS_THROUGH';
  secondaryModel?: string;
  fallbackNotes?: string;
}

export class CompleteRcaDto {
  rootCauseSummary!: string;
  contributingFactors!: string[];
  preventativeActions!: string[];
  evidenceDigest?: string;
}

export class ResolveIncidentDto {
  resolutionSummary!: string;
  disengageKillSwitch?: boolean;
  resolvedBy!: string;
}
