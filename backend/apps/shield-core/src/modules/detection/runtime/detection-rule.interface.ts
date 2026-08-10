export interface CanonicalEventLike {
  id: string;
  tenant_id: string;
  environment_id: string;
  event_class: string;
  event_category: string | null;
  event_activity: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  source_ip: string | null;
  destination_ip: string | null;
  resource_id: string | null;
  action: string | null;
  outcome: string | null;
  occurred_at: Date | null;
}

export interface DetectionFactor {
  name: string;
  contribution: number;
  /** true when this factor could not be evaluated because required data was unavailable. */
  indeterminate?: boolean;
}

export interface DetectionInput {
  tenantId: string;
  event: CanonicalEventLike;
  identity?: { id: string; status: string; identity_type: string } | null;
  asset?: { id: string; criticality: string; status: string } | null;
  contextHealth: string;
  /** Parsed DetectionVersion.configuration for this rule. */
  configuration: Record<string, any>;
}

export interface DetectionResult {
  result: 'MATCH' | 'NO_MATCH' | 'INDETERMINATE';
  factors: DetectionFactor[];
  confidence?: number;
  incompleteData: boolean;
  reasons: string[];
}

/** Spec §31 — every detection rule class implements this, dispatched by DetectionRuntimeService via DetectionRegistryService's key lookup. */
export interface DetectionRule {
  readonly key: string;
  evaluate(input: DetectionInput): Promise<DetectionResult> | DetectionResult;
}
