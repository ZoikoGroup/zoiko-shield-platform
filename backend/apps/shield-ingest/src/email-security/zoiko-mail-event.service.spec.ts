import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ZoikoMailEventService } from './zoiko-mail-event.service';
import {
  MailEventRejectedError,
  ShieldCoreUnreachableError,
} from '../internal-client/shield-core.client';
import {
  computeEnvelopePayloadHash,
  signSecurityEventEnvelope,
  type SecurityEventEnvelopeV1,
} from '../../../../libs/contracts/src/security-event-envelope';

describe('ZoikoMailEventService (EW06, §07.3, T03, I02)', () => {
  const SECRET = 'zoiko-mail-test-secret-0123456789';
  const ENV_KEYS = [
    'EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED',
    'ZOIKO_MAIL_EVENT_HMAC_SECRET',
    'ZOIKO_MAIL_ALLOWED_PRODUCERS',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED = 'true';
    process.env.ZOIKO_MAIL_EVENT_HMAC_SECRET = SECRET;
    delete process.env.ZOIKO_MAIL_ALLOWED_PRODUCERS;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function envelope(
    overrides: Partial<SecurityEventEnvelopeV1> & {
      metadata?: Record<string, unknown>;
    } = {},
  ): SecurityEventEnvelopeV1 {
    const now = Date.now();
    const base = {
      schema_version: '1.0' as const,
      event_id: 'evt-0001',
      correlation_id: 'corr-1',
      producer: 'zoiko-mail-security',
      source_event_id: 'mail-msg-ref-1',
      tenant_binding_id: 'tb_opaque_1',
      event_type: 'mail.security.inbound_verdict.v1' as const,
      threat_class: 'CREDENTIAL_PHISHING',
      occurred_at: new Date(now - 60_000).toISOString(),
      observed_at: new Date(now - 30_000).toISOString(),
      subject_ref: 'subj_pseudo_1',
      policy_id: 'inbound-standard',
      policy_version: 'v7',
      source_verdict: 'SUSPICIOUS',
      action_state: 'QUARANTINED',
      coverage_state: 'COMPLETE' as const,
      data_class: 'SECURITY_METADATA',
      residency_code: 'eu-west-1',
      evidence_ref: 'evd-1',
      ...overrides,
    };
    const payload_hash = computeEnvelopePayloadHash(base as any);
    const withHash = { ...base, payload_hash };
    return {
      ...withHash,
      signature: signSecurityEventEnvelope(withHash as any, SECRET),
    } as SecurityEventEnvelopeV1;
  }

  function build() {
    const nonces = new Set<string>();
    const prisma = {
      webhookReplayNonce: {
        deleteMany: jest.fn(async ({ where }: any) => {
          if (where?.nonce_hash) nonces.delete(where.nonce_hash);
          return { count: 0 };
        }),
        create: jest.fn(async ({ data }: any) => {
          if (nonces.has(data.nonce_hash)) throw new Error('P2002 unique');
          nonces.add(data.nonce_hash);
          return data;
        }),
      },
    } as any;
    const core = {
      forwardMailSecurityEvent: jest.fn().mockResolvedValue({
        accepted: true,
        duplicate: false,
        findingId: 'finding-1',
      }),
    } as any;
    return { svc: new ZoikoMailEventService(prisma, core), core, nonces };
  }

  it('is disabled unless EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED=true', async () => {
    process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED = 'false';
    const { svc, core } = build();
    await expect(svc.ingest(envelope())).rejects.toThrow(ForbiddenException);
    expect(core.forwardMailSecurityEvent).not.toHaveBeenCalled();
  });

  it('fails closed when the signature key is not configured', async () => {
    delete process.env.ZOIKO_MAIL_EVENT_HMAC_SECRET;
    const { svc } = build();
    await expect(svc.ingest(envelope())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('verifies, forwards to core without a tenant header and records the receipt', async () => {
    const { svc, core } = build();
    const res = await svc.ingest(envelope());
    expect(res).toEqual({
      accepted: true,
      duplicate: false,
      findingId: 'finding-1',
    });
    const sent = core.forwardMailSecurityEvent.mock.calls[0][0];
    expect(sent.tenantBindingId).toBe('tb_opaque_1');
    expect(sent.eventType).toBe('mail.security.inbound_verdict.v1');
    expect(sent).not.toHaveProperty('tenantId');
  });

  it('rejects a replayed event_id without forwarding it again (T03)', async () => {
    const { svc, core } = build();
    const e = envelope();
    await svc.ingest(e);
    const again = await svc.ingest(e);
    expect(again).toEqual({
      accepted: false,
      duplicate: true,
      reason: 'REPLAYED_EVENT_ID',
    });
    expect(core.forwardMailSecurityEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects forged signatures, untrusted producers and Shield->Mail event types before forwarding (I02)', async () => {
    const { svc, core } = build();
    await expect(
      svc.ingest({ ...envelope(), signature: 'hmac-sha256:00' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      svc.ingest(envelope({ producer: 'someone-else' })),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.ingest(
        envelope({ event_type: 'mail.security.action_proposal.v1' as any }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.ingest(
        envelope({
          occurred_at: '2020-01-01T00:00:00Z',
          observed_at: '2020-01-01T00:00:01Z',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(core.forwardMailSecurityEvent).not.toHaveBeenCalled();
  });

  it('validates and forwards coverage reports with provider-side counts', async () => {
    const { svc, core } = build();
    const windowEnd = new Date().toISOString();
    const windowStart = new Date(Date.now() - 3_600_000).toISOString();
    await svc.ingest(
      envelope({
        event_id: 'evt-cov-1',
        event_type: 'mail.security.coverage_report.v1' as any,
        metadata: {
          coverage: {
            windowStart,
            windowEnd,
            expectedCount: 100,
            observedCount: 97,
            gaps: [{ reason: 'SCANNER_TIMEOUT', detail: '3 deferred' }],
          },
        },
      }),
    );
    expect(core.forwardMailSecurityEvent.mock.calls[0][0].coverage).toEqual({
      windowStart,
      windowEnd,
      expectedCount: 100,
      observedCount: 97,
      gaps: [{ reason: 'SCANNER_TIMEOUT', detail: '3 deferred' }],
    });

    await expect(
      svc.ingest(
        envelope({
          event_id: 'evt-cov-2',
          event_type: 'mail.security.coverage_report.v1' as any,
          metadata: { coverage: { expectedCount: -1 } },
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('releases the receipt when core is down or rejects, so the producer can redeliver', async () => {
    const { svc, core, nonces } = build();
    core.forwardMailSecurityEvent.mockRejectedValueOnce(
      new ShieldCoreUnreachableError('down'),
    );
    await expect(svc.ingest(envelope())).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(nonces.size).toBe(0);

    core.forwardMailSecurityEvent.mockRejectedValueOnce(
      new MailEventRejectedError(403, 'UNKNOWN_TENANT_BINDING'),
    );
    await expect(svc.ingest(envelope())).rejects.toThrow(ForbiddenException);
    expect(nonces.size).toBe(0);

    const ok = await svc.ingest(envelope());
    expect(ok.accepted).toBe(true);
  });
});
