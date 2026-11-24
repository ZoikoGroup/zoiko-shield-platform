import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { buildCanonicalEvent, type CanonicalEvent } from './canonical-event';

/**
 * SecurityEventEnvelope v1 canonical Email Security contract for ZoikoShield
 * Upstream spec: ZS-UX-EMTI-001 V1.0 §18.1, §19
 */
export const SECURITY_EVENT_ENVELOPE_VERSION = '1.0' as const;

/**
 * Zoiko Mail -> ZoikoShield events (ZS-ZM-ENG-003 V3.0 §07.2). These are the
 * only event types the Zoiko Mail intake endpoint accepts.
 */
export const ZOIKO_MAIL_INBOUND_EVENT_TYPES = [
  'mail.security.inbound_verdict.v1',
  'mail.security.outbound_hold.v1',
  'mail.security.quarantine_changed.v1',
  'mail.security.account_risk.v1',
  'mail.security.coverage_report.v1',
  'mail.security.action_receipt.v1',
] as const;

/** ZoikoShield -> Zoiko Mail (non-executing request; §07.2). */
export const ZOIKO_MAIL_OUTBOUND_EVENT_TYPES = [
  'mail.security.action_proposal.v1',
] as const;

export const MAIL_SECURITY_EVENT_TYPES = [
  'email.security.alert_ingested.v1',
  'email.security.account_risk.v1',
  'email.security.coverage_report.v1',
  'email.security.action_proposal.v1',
  'email.security.action_receipt.v1',
  ...ZOIKO_MAIL_INBOUND_EVENT_TYPES,
  ...ZOIKO_MAIL_OUTBOUND_EVENT_TYPES,
] as const;

/** Default maximum age of `occurred_at` accepted by the validator (24h). */
export const DEFAULT_ENVELOPE_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
/** Default tolerated clock skew for `observed_at` in the future (5 min). */
export const DEFAULT_ENVELOPE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const EMAIL_SECURITY_EVENT_TYPES = MAIL_SECURITY_EVENT_TYPES;

export type MailSecurityEventType = (typeof MAIL_SECURITY_EVENT_TYPES)[number];

export type EmailCoverageState = 'COMPLETE' | 'DEGRADED' | 'UNKNOWN';

export type MailSourceVerdict =
  | 'MALICIOUS'
  | 'SUSPICIOUS'
  | 'CLEAN'
  | 'UNSCANNABLE'
  | 'ENGINE_ERROR'
  | 'POLICY_HOLD';

export type MailCanonicalActionState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'SCANNING'
  | 'POLICY_EVALUATION'
  | 'DELIVERED'
  | 'QUARANTINED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'REVIEW_REQUESTED'
  | 'RELEASE_APPROVED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'HELD'
  | 'ERROR_REQUIRES_OPERATOR';

export interface SecurityEventEnvelopeV1 {
  schema_version: typeof SECURITY_EVENT_ENVELOPE_VERSION;
  event_id: string;
  correlation_id: string;
  producer: string;
  source_event_id: string;
  tenant_binding_id: string;
  event_type: MailSecurityEventType;
  threat_class: string;
  occurred_at: string;
  observed_at: string;
  subject_ref: string;
  policy_id: string;
  policy_version: string;
  source_verdict: MailSourceVerdict | string;
  action_state: MailCanonicalActionState | string;
  coverage_state: EmailCoverageState;
  data_class: string;
  residency_code: string;
  payload_hash: string;
  signature: string;
  evidence_ref: string;
  metadata?: Record<string, unknown>;
}

export const PROHIBITED_ENVELOPE_METADATA_KEYS = new Set<string>([
  'raw_body',
  'rawbody',
  'body_html',
  'body_text',
  'message_body',
  'attachment_bytes',
  'attachment_content',
  'oauth_token',
  'access_token',
  'refresh_token',
  'bearer_token',
  'client_secret',
  'password',
  'unredacted_prompt',
]);

const ALLOWED_COVERAGE_STATES = new Set<EmailCoverageState>([
  'COMPLETE',
  'DEGRADED',
  'UNKNOWN',
]);

const ALLOWED_EVENT_TYPES = new Set<string>(MAIL_SECURITY_EVENT_TYPES);

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`)
    .join(',')}}`;
}

export function canonicalEnvelopeSigningBody(
  envelope: Omit<SecurityEventEnvelopeV1, 'signature'> & { signature?: string },
): string {
  const rest = { ...envelope };
  delete rest.signature;
  return stableSerialize(rest);
}

export function computeEnvelopePayloadHash(
  envelope: Omit<SecurityEventEnvelopeV1, 'signature' | 'payload_hash'>,
): string {
  const digest = createHash('sha256')
    .update(stableSerialize(envelope), 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

export function signSecurityEventEnvelope(
  envelope: Omit<SecurityEventEnvelopeV1, 'signature'>,
  secret: string,
): string {
  const hmac = createHmac('sha256', secret)
    .update(canonicalEnvelopeSigningBody(envelope), 'utf8')
    .digest('hex');
  return `hmac-sha256:${hmac}`;
}

export function verifySecurityEventEnvelopeSignature(
  envelope: SecurityEventEnvelopeV1,
  secret: string,
): boolean {
  if (!secret || !envelope.signature) {
    return false;
  }
  const expected = signSecurityEventEnvelope(envelope, secret);
  const actualBuf = Buffer.from(envelope.signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

function findProhibitedKeys(
  value: unknown,
  pathPrefix = '',
  found: string[] = [],
): string[] {
  if (!value || typeof value !== 'object') {
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findProhibitedKeys(item, `${pathPrefix}[${index}]`, found),
    );
    return found;
  }
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalized = key.toLowerCase();
    const keyPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (PROHIBITED_ENVELOPE_METADATA_KEYS.has(normalized)) {
      found.push(keyPath);
    }
    if (nested && typeof nested === 'object') {
      findProhibitedKeys(nested, keyPath, found);
    }
  }
  return found;
}

function isIsoUtcTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export interface EnvelopeValidationOptions {
  hmacSecret?: string;
  requireSignatureVerification?: boolean;
  allowedProducers?: ReadonlySet<string>;
  /** Narrower registry for a specific intake (e.g. Zoiko Mail inbound only). */
  allowedEventTypes?: ReadonlySet<string>;
  /** Recompute payload_hash from the envelope body and reject on mismatch. */
  verifyPayloadHash?: boolean;
  /**
   * Freshness (replay-window) enforcement. Enabled by default: occurred_at may
   * not be older than maxEventAgeMs and observed_at may not be more than
   * maxFutureSkewMs in the future. Set false only for offline replay/verification.
   */
  enforceFreshness?: boolean;
  maxEventAgeMs?: number;
  maxFutureSkewMs?: number;
  /** Clock override for deterministic tests. */
  now?: Date;
}

export type EnvelopeValidationResult =
  | { valid: true; envelope: SecurityEventEnvelopeV1 }
  | { valid: false; reasonCode: string; errors: string[] };

/**
 * Schema registry + signature validation that executes strictly BEFORE any tenant resolution
 * or persistence (Doc 1 §07.1 / Appendix A & §13 I02).
 */
export function validateSecurityEventEnvelopeV1(
  input: unknown,
  options: EnvelopeValidationOptions = {},
): EnvelopeValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      reasonCode: 'INVALID_ENVELOPE_SHAPE',
      errors: ['Envelope payload must be a non-null JSON object'],
    };
  }

  const raw = input as Record<string, unknown>;
  const errors: string[] = [];

  if (raw.schema_version !== SECURITY_EVENT_ENVELOPE_VERSION) {
    return {
      valid: false,
      reasonCode: 'UNSUPPORTED_SCHEMA_VERSION',
      errors: [
        `Unsupported schema_version '${String(raw.schema_version)}'; expected '${SECURITY_EVENT_ENVELOPE_VERSION}'`,
      ],
    };
  }

  if (
    typeof raw.event_type !== 'string' ||
    !ALLOWED_EVENT_TYPES.has(raw.event_type) ||
    (options.allowedEventTypes !== undefined &&
      !options.allowedEventTypes.has(raw.event_type))
  ) {
    return {
      valid: false,
      reasonCode: 'UNREGISTERED_EVENT_TYPE',
      errors: [
        `Event type '${String(raw.event_type)}' is not in the allowlisted mail.security registry`,
      ],
    };
  }

  const requiredStrings: Array<keyof SecurityEventEnvelopeV1> = [
    'event_id',
    'correlation_id',
    'producer',
    'source_event_id',
    'tenant_binding_id',
    'threat_class',
    'subject_ref',
    'policy_id',
    'policy_version',
    'source_verdict',
    'action_state',
    'data_class',
    'residency_code',
    'payload_hash',
    'signature',
    'evidence_ref',
  ];

  for (const field of requiredStrings) {
    const val = raw[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      errors.push(`Missing or empty required string field '${String(field)}'`);
    }
  }

  if (
    options.allowedProducers &&
    typeof raw.producer === 'string' &&
    !options.allowedProducers.has(raw.producer)
  ) {
    return {
      valid: false,
      reasonCode: 'UNTRUSTED_PRODUCER',
      errors: [`Producer '${raw.producer}' is not authorized in allowlist`],
    };
  }

  if (!isIsoUtcTimestamp(raw.occurred_at)) {
    errors.push(
      'occurred_at must be a valid UTC RFC 3339 timestamp ending in Z',
    );
  }
  if (!isIsoUtcTimestamp(raw.observed_at)) {
    errors.push(
      'observed_at must be a valid UTC RFC 3339 timestamp ending in Z',
    );
  }

  if (
    typeof raw.coverage_state !== 'string' ||
    !ALLOWED_COVERAGE_STATES.has(raw.coverage_state as EmailCoverageState)
  ) {
    errors.push(
      `coverage_state must be one of COMPLETE | DEGRADED | UNKNOWN (got '${String(raw.coverage_state)}')`,
    );
  }

  if (
    typeof raw.payload_hash === 'string' &&
    !/^sha256:[a-f0-9]{64}$/i.test(raw.payload_hash)
  ) {
    errors.push('payload_hash must follow canonical sha256:<64-hex> format');
  }

  if (raw.metadata !== undefined) {
    const prohibited = findProhibitedKeys(raw.metadata);
    if (prohibited.length > 0) {
      return {
        valid: false,
        reasonCode: 'PROHIBITED_CONTENT_OR_SECRET_LEAK',
        errors: [
          `Prohibited raw content or credential fields present in envelope metadata: ${prohibited.join(', ')}`,
        ],
      };
    }
  }

  // Also reject accidental top-level body/secret keys outside the fixed schema allowlist
  const topProhibited = findProhibitedKeys(raw);
  if (topProhibited.length > 0) {
    return {
      valid: false,
      reasonCode: 'PROHIBITED_CONTENT_OR_SECRET_LEAK',
      errors: [
        `Prohibited fields present in envelope: ${topProhibited.join(', ')}`,
      ],
    };
  }

  if (errors.length > 0) {
    return {
      valid: false,
      reasonCode: 'ENVELOPE_SCHEMA_VALIDATION_FAILED',
      errors,
    };
  }

  const envelope = raw as unknown as SecurityEventEnvelopeV1;

  if (options.enforceFreshness !== false) {
    const nowMs = (options.now ?? new Date()).getTime();
    const maxAge = options.maxEventAgeMs ?? DEFAULT_ENVELOPE_MAX_EVENT_AGE_MS;
    const maxSkew =
      options.maxFutureSkewMs ?? DEFAULT_ENVELOPE_MAX_FUTURE_SKEW_MS;
    const occurredMs = Date.parse(envelope.occurred_at);
    const observedMs = Date.parse(envelope.observed_at);
    if (observedMs > nowMs + maxSkew || occurredMs > nowMs + maxSkew) {
      return {
        valid: false,
        reasonCode: 'ENVELOPE_TIMESTAMP_IN_FUTURE',
        errors: [
          `occurred_at/observed_at are more than ${maxSkew}ms ahead of the receiver clock`,
        ],
      };
    }
    if (nowMs - occurredMs > maxAge) {
      return {
        valid: false,
        reasonCode: 'ENVELOPE_STALE_REPLAY_WINDOW',
        errors: [
          `occurred_at is older than the ${maxAge}ms replay window; route through reconciliation/backfill instead`,
        ],
      };
    }
    if (observedMs < occurredMs) {
      return {
        valid: false,
        reasonCode: 'ENVELOPE_SCHEMA_VALIDATION_FAILED',
        errors: ['observed_at must not precede occurred_at'],
      };
    }
  }

  if (options.verifyPayloadHash) {
    const body = { ...(envelope as unknown as Record<string, unknown>) };
    delete body.signature;
    delete body.payload_hash;
    const expectedHash = computeEnvelopePayloadHash(
      body as Omit<SecurityEventEnvelopeV1, 'signature' | 'payload_hash'>,
    );
    if (expectedHash !== envelope.payload_hash) {
      return {
        valid: false,
        reasonCode: 'PAYLOAD_HASH_MISMATCH',
        errors: ['payload_hash does not match the canonical envelope body'],
      };
    }
  }

  if (options.requireSignatureVerification || options.hmacSecret) {
    const secret = options.hmacSecret || '';
    if (!verifySecurityEventEnvelopeSignature(envelope, secret)) {
      return {
        valid: false,
        reasonCode: 'INVALID_ENVELOPE_SIGNATURE',
        errors: [
          'Cryptographic signature verification failed prior to tenant mapping',
        ],
      };
    }
  }

  return { valid: true, envelope };
}

export const DEFAULT_EMAIL_PRODUCER_ID = 'shield-email-ingest' as const;

export function mapSecurityEventEnvelopeToCanonicalEvent(
  envelope: SecurityEventEnvelopeV1,
  resolvedTenantId: string,
  options: { environmentId?: string; connectorId?: string } = {},
): CanonicalEvent<SecurityEventEnvelopeV1> {
  return buildCanonicalEvent<SecurityEventEnvelopeV1>({
    event_id: envelope.event_id,
    contract_id: 'zs.email.security_event_envelope',
    contract_version: envelope.schema_version,
    tenant_id: resolvedTenantId,
    environment_id: options.environmentId ?? 'default-env',
    region: envelope.residency_code,
    event_type: envelope.event_type,
    occurred_at: envelope.occurred_at,
    observed_at: envelope.observed_at,
    producer: {
      service: envelope.producer,
      version: envelope.schema_version,
      identity: envelope.tenant_binding_id,
    },
    correlation_id: envelope.correlation_id,
    ordering_key: `${envelope.tenant_binding_id}:${envelope.producer}`,
    source: {
      connector_id: options.connectorId ?? envelope.producer,
      native_ref: envelope.source_event_id,
      mapping_version: envelope.policy_version,
    },
    integrity: {
      hash: envelope.payload_hash,
      signature_ref: envelope.evidence_ref,
      state: 'VERIFIED',
    },
    data: envelope,
  });
}
