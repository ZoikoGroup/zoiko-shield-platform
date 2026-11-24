import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShieldCoreClient,
  MailEventRejectedError,
  type ForwardedMailSecurityEvent,
  type ForwardedMailSecurityEventResult,
} from '../internal-client/shield-core.client';
import {
  DEFAULT_ENVELOPE_MAX_EVENT_AGE_MS,
  ZOIKO_MAIL_INBOUND_EVENT_TYPES,
  validateSecurityEventEnvelopeV1,
  type SecurityEventEnvelopeV1,
} from '../../../../libs/contracts/src/security-event-envelope';

const INBOUND_TYPES = new Set<string>(ZOIKO_MAIL_INBOUND_EVENT_TYPES);
const DEFAULT_PRODUCERS = 'zoiko-mail-security';
/** Replay receipts outlive the freshness window so an old event cannot be replayed. */
const MIN_REPLAY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/**
 * Zoiko Mail -> ZoikoShield intake (ZS-ZM-ENG-003 §07, EW06; ZS-UX-EMTI-001
 * T03/I02). Order of checks: feature gate -> signature/registry/freshness/
 * payload-hash (before any tenant resolution) -> replay receipt by event_id ->
 * forward to shield-core, which resolves the opaque tenant binding.
 */
@Injectable()
export class ZoikoMailEventService {
  private readonly logger = new Logger(ZoikoMailEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coreClient: ShieldCoreClient,
  ) {}

  isEnabled(): boolean {
    return process.env.EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED === 'true';
  }

  async ingest(raw: unknown): Promise<ForwardedMailSecurityEventResult> {
    if (!this.isEnabled()) {
      throw new ForbiddenException(
        'ZOIKO_MAIL_INTEGRATION_DISABLED: Zoiko Mail event intake is not enabled (pending ADR-ZSSEC-01 / D05)',
      );
    }
    const secret = process.env.ZOIKO_MAIL_EVENT_HMAC_SECRET;
    if (!secret || secret.trim().length < 16) {
      // Fail closed: without a verification key no event can be trusted.
      throw new ServiceUnavailableException(
        'ZOIKO_MAIL_EVENT_SECRET_NOT_CONFIGURED: signature verification key is missing',
      );
    }
    const producers = new Set(
      (process.env.ZOIKO_MAIL_ALLOWED_PRODUCERS || DEFAULT_PRODUCERS)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    );
    const maxEventAgeMs = positiveInt(
      process.env.ZOIKO_MAIL_EVENT_MAX_AGE_MS,
      DEFAULT_ENVELOPE_MAX_EVENT_AGE_MS,
    );

    const result = validateSecurityEventEnvelopeV1(raw, {
      hmacSecret: secret,
      requireSignatureVerification: true,
      verifyPayloadHash: true,
      allowedProducers: producers,
      allowedEventTypes: INBOUND_TYPES,
      maxEventAgeMs,
    });
    if (!result.valid) {
      const body = { code: result.reasonCode, errors: result.errors };
      if (result.reasonCode === 'INVALID_ENVELOPE_SIGNATURE') {
        throw new UnauthorizedException(body);
      }
      if (result.reasonCode === 'UNTRUSTED_PRODUCER') {
        throw new ForbiddenException(body);
      }
      throw new BadRequestException(body);
    }
    const envelope = result.envelope;

    const forwarded = this.toForwardedEvent(envelope);

    const replayKey = `zoiko-mail:${envelope.producer}`;
    const nonceHash = createHash('sha256')
      .update(`${envelope.producer}:${envelope.event_id}`, 'utf8')
      .digest('hex');
    await this.prisma.webhookReplayNonce.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    try {
      await this.prisma.webhookReplayNonce.create({
        data: {
          connector_id: replayKey,
          nonce_hash: nonceHash,
          expires_at: new Date(
            Date.now() + Math.max(MIN_REPLAY_RETENTION_MS, maxEventAgeMs * 2),
          ),
        },
      });
    } catch {
      this.logger.warn(
        `Duplicate Zoiko Mail event ignored producer=${envelope.producer} event=${envelope.event_id}`,
      );
      return { accepted: false, duplicate: true, reason: 'REPLAYED_EVENT_ID' };
    }

    try {
      const res = await this.coreClient.forwardMailSecurityEvent(forwarded);
      if (!res?.accepted && !res?.duplicate) {
        // Not accepted: let a corrected redelivery through (at-least-once).
        await this.releaseReceipt(replayKey, nonceHash);
      }
      return res;
    } catch (err) {
      await this.releaseReceipt(replayKey, nonceHash);
      if (err instanceof MailEventRejectedError) {
        const body = { code: err.reasonCode };
        if (err.httpStatus === 403) throw new ForbiddenException(body);
        if (err.httpStatus === 404) throw new ForbiddenException(body);
        throw new BadRequestException(body);
      }
      throw new ServiceUnavailableException(
        'SHIELD_CORE_UNAVAILABLE: event not committed; producer must retry from its outbox',
      );
    }
  }

  private async releaseReceipt(connectorId: string, nonceHash: string) {
    try {
      await this.prisma.webhookReplayNonce.deleteMany({
        where: { connector_id: connectorId, nonce_hash: nonceHash },
      });
    } catch (err) {
      this.logger.error(
        `Failed to release replay receipt: ${(err as Error).message}`,
      );
    }
  }

  private toForwardedEvent(
    envelope: SecurityEventEnvelopeV1,
  ): ForwardedMailSecurityEvent {
    const forwarded: ForwardedMailSecurityEvent = {
      tenantBindingId: envelope.tenant_binding_id,
      eventId: envelope.event_id,
      eventType: envelope.event_type,
      producer: envelope.producer,
      sourceEventId: envelope.source_event_id,
      occurredAt: envelope.occurred_at,
      observedAt: envelope.observed_at,
      subjectRef: envelope.subject_ref,
      threatClass: envelope.threat_class,
      sourceVerdict: envelope.source_verdict,
      actionState: envelope.action_state,
      policyId: envelope.policy_id,
      policyVersion: envelope.policy_version,
      dataClass: envelope.data_class,
      residencyCode: envelope.residency_code,
      coverageState: envelope.coverage_state,
      evidenceRef: envelope.evidence_ref,
      payloadHash: envelope.payload_hash,
    };

    if (envelope.event_type === 'mail.security.coverage_report.v1') {
      const coverage = (
        envelope.metadata as Record<string, unknown> | undefined
      )?.coverage as Record<string, unknown> | undefined;
      const expected = Number(coverage?.expectedCount);
      const observed = Number(coverage?.observedCount);
      const windowStart = coverage?.windowStart;
      const windowEnd = coverage?.windowEnd;
      if (
        !coverage ||
        typeof windowStart !== 'string' ||
        typeof windowEnd !== 'string' ||
        !Number.isFinite(Date.parse(windowStart)) ||
        !Number.isFinite(Date.parse(windowEnd)) ||
        Date.parse(windowEnd) <= Date.parse(windowStart) ||
        !Number.isInteger(expected) ||
        !Number.isInteger(observed) ||
        expected < 0 ||
        observed < 0
      ) {
        throw new BadRequestException({
          code: 'INVALID_COVERAGE_REPORT',
          errors: [
            'coverage_report requires metadata.coverage {windowStart, windowEnd, expectedCount, observedCount}',
          ],
        });
      }
      const gaps = Array.isArray(coverage.gaps)
        ? (coverage.gaps as unknown[])
            .filter(
              (g): g is Record<string, unknown> => !!g && typeof g === 'object',
            )
            .map((g) => ({
              reason: String(g.reason ?? 'UNSPECIFIED'),
              detail: String(g.detail ?? ''),
            }))
        : [];
      forwarded.coverage = {
        windowStart,
        windowEnd,
        expectedCount: expected,
        observedCount: observed,
        gaps,
      };
    }
    return forwarded;
  }
}
