import {
  ZOIKO_MAIL_INBOUND_EVENT_TYPES,
  computeEnvelopePayloadHash,
  mapSecurityEventEnvelopeToCanonicalEvent,
  signSecurityEventEnvelope,
  validateSecurityEventEnvelopeV1,
  type SecurityEventEnvelopeV1,
} from './security-event-envelope';

describe('SecurityEventEnvelopeV1 Contract (ZoikoShield Email Security)', () => {
  const secret = 'test-shield-email-hmac-secret';
  // Fixture timestamps are 2026-11-22T00:00:0xZ; validate against a receiver
  // clock two minutes later so the freshness window is deterministic.
  const NOW = new Date('2026-11-22T00:02:00Z');

  function buildValidEnvelope(
    overrides: Partial<SecurityEventEnvelopeV1> = {},
  ): SecurityEventEnvelopeV1 {
    const unsignedBase = {
      schema_version: '1.0' as const,
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      correlation_id: 'corr-email-001',
      producer: 'shield-email-ingest',
      source_event_id: 'm365-alert-9910',
      tenant_binding_id: 'tb_opaque_91a4f',
      event_type: 'email.security.alert_ingested.v1' as const,
      threat_class: 'CREDENTIAL_PHISHING',
      occurred_at: '2026-11-22T00:00:00Z',
      observed_at: '2026-11-22T00:00:02Z',
      subject_ref: 'subj_pseudonymous_771a',
      policy_id: 'inbound-standard',
      policy_version: 'v3',
      source_verdict: 'SUSPICIOUS',
      action_state: 'QUARANTINED',
      coverage_state: 'COMPLETE' as const,
      data_class: 'SECURITY_METADATA',
      residency_code: 'eu-west-1',
      evidence_ref: 'evd_ref_0001',
      ...overrides,
    };

    const payload_hash =
      overrides.payload_hash ?? computeEnvelopePayloadHash(unsignedBase);
    const withHash = { ...unsignedBase, payload_hash };
    const signature =
      overrides.signature ?? signSecurityEventEnvelope(withHash, secret);
    return { ...withHash, signature };
  }

  it('validates a well-formed signed envelope and adapts it to CanonicalEvent', () => {
    const envelope = buildValidEnvelope();
    const res = validateSecurityEventEnvelopeV1(envelope, {
      now: NOW,
      hmacSecret: secret,
      requireSignatureVerification: true,
    });
    expect(res.valid).toBe(true);
    if (res.valid) {
      const canonical = mapSecurityEventEnvelopeToCanonicalEvent(
        res.envelope,
        'tenant-resolved-1',
      );
      expect(canonical.tenant_id).toBe('tenant-resolved-1');
      expect(canonical.contract_id).toBe('zs.email.security_event_envelope');
      expect(canonical.integrity.state).toBe('VERIFIED');
      expect(canonical.source.native_ref).toBe('m365-alert-9910');
    }
  });

  it('blocks unsupported schema versions before tenant mapping (I02)', () => {
    const envelope = buildValidEnvelope({
      schema_version: '2.0' as any,
    });
    const res = validateSecurityEventEnvelopeV1(envelope, {
      now: NOW,
      hmacSecret: secret,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('UNSUPPORTED_SCHEMA_VERSION');
    }
  });

  it('blocks unregistered event types outside the email.security registry', () => {
    const envelope = buildValidEnvelope({
      event_type: 'email.security.dump_all_mailboxes.v1' as any,
    });
    const res = validateSecurityEventEnvelopeV1(envelope, { now: NOW });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('UNREGISTERED_EVENT_TYPE');
    }
  });

  it('rejects forged signatures prior to tenant mapping (I02)', () => {
    const envelope = buildValidEnvelope({
      signature: 'hmac-sha256:0000000000000000000000000000000000000000',
    });
    const res = validateSecurityEventEnvelopeV1(envelope, {
      now: NOW,
      hmacSecret: secret,
      requireSignatureVerification: true,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('INVALID_ENVELOPE_SIGNATURE');
    }
  });

  it('rejects envelopes containing raw email bodies or OAuth tokens (I01 / T17)', () => {
    const envelope = buildValidEnvelope({
      metadata: { raw_body: 'secret invoice content', oauth_token: 'tok-123' },
    });
    const res = validateSecurityEventEnvelopeV1(envelope, { now: NOW });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('PROHIBITED_CONTENT_OR_SECRET_LEAK');
    }
  });
  it('accepts the Zoiko Mail inbound registry (§07.2) and can narrow to it', () => {
    for (const eventType of ZOIKO_MAIL_INBOUND_EVENT_TYPES) {
      const res = validateSecurityEventEnvelopeV1(
        buildValidEnvelope({ event_type: eventType as any }),
        {
          now: NOW,
          hmacSecret: secret,
          requireSignatureVerification: true,
          allowedEventTypes: new Set(ZOIKO_MAIL_INBOUND_EVENT_TYPES),
        },
      );
      expect(res.valid).toBe(true);
    }
    const outbound = validateSecurityEventEnvelopeV1(
      buildValidEnvelope({ event_type: 'mail.security.action_proposal.v1' }),
      { now: NOW, allowedEventTypes: new Set(ZOIKO_MAIL_INBOUND_EVENT_TYPES) },
    );
    expect(outbound.valid).toBe(false);
    if (!outbound.valid) {
      expect(outbound.reasonCode).toBe('UNREGISTERED_EVENT_TYPE');
    }
  });

  it('rejects envelopes outside the replay window (stale) or from the future (T03)', () => {
    const stale = validateSecurityEventEnvelopeV1(buildValidEnvelope(), {
      now: new Date('2026-11-23T00:00:03Z'),
    });
    expect(stale.valid).toBe(false);
    if (!stale.valid) {
      expect(stale.reasonCode).toBe('ENVELOPE_STALE_REPLAY_WINDOW');
    }

    const future = validateSecurityEventEnvelopeV1(buildValidEnvelope(), {
      now: new Date('2026-11-21T23:50:00Z'),
    });
    expect(future.valid).toBe(false);
    if (!future.valid) {
      expect(future.reasonCode).toBe('ENVELOPE_TIMESTAMP_IN_FUTURE');
    }

    const custom = validateSecurityEventEnvelopeV1(buildValidEnvelope(), {
      now: NOW,
      maxEventAgeMs: 30_000,
    });
    expect(custom.valid).toBe(false);
  });

  it('rejects observed_at earlier than occurred_at', () => {
    const res = validateSecurityEventEnvelopeV1(
      buildValidEnvelope({ observed_at: '2026-11-21T23:59:00Z' }),
      { now: NOW },
    );
    expect(res.valid).toBe(false);
  });

  it('detects a payload_hash that does not match the envelope body', () => {
    const envelope = buildValidEnvelope();
    const tampered = {
      ...envelope,
      threat_class: 'BENIGN',
    };
    // Re-sign so only the hash (not the signature) is inconsistent.
    const resigned = {
      ...tampered,
      signature: signSecurityEventEnvelope(tampered, secret),
    };
    const res = validateSecurityEventEnvelopeV1(resigned, {
      now: NOW,
      hmacSecret: secret,
      requireSignatureVerification: true,
      verifyPayloadHash: true,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('PAYLOAD_HASH_MISMATCH');
    }
    const ok = validateSecurityEventEnvelopeV1(envelope, {
      now: NOW,
      hmacSecret: secret,
      requireSignatureVerification: true,
      verifyPayloadHash: true,
    });
    expect(ok.valid).toBe(true);
  });
});
