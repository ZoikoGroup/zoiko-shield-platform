import {
  computeEnvelopePayloadHash,
  mapSecurityEventEnvelopeToCanonicalEvent,
  signSecurityEventEnvelope,
  validateSecurityEventEnvelopeV1,
  type SecurityEventEnvelopeV1,
} from './security-event-envelope';

describe('SecurityEventEnvelopeV1 Contract (ZoikoShield Email Security)', () => {
  const secret = 'test-shield-email-hmac-secret';

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
    const res = validateSecurityEventEnvelopeV1(envelope);
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
    const res = validateSecurityEventEnvelopeV1(envelope);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reasonCode).toBe('PROHIBITED_CONTENT_OR_SECRET_LEAK');
    }
  });
});
