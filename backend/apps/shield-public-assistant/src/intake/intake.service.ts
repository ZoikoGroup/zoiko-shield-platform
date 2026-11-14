import { createCipheriv, createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssistantConfigService } from '../config/assistant-config.service';
import { hasSecret } from '../conversation/classifier';

export type Journey =
  'demo' | 'support' | 'quote' | 'trust' | 'tech' | 'onboarding' | 'privacy';

export const JOURNEYS: Journey[] = [
  'demo',
  'support',
  'quote',
  'trust',
  'tech',
  'onboarding',
  'privacy',
];

const REFERENCE_PREFIX: Record<Journey, string> = {
  demo: 'DEMO',
  support: 'SUPPORT',
  quote: 'QUOTE',
  trust: 'TRUST',
  tech: 'TECH',
  onboarding: 'ONBOARD',
  privacy: 'PRIVACY',
};

const FLAG_FOR_JOURNEY: Record<
  Journey,
  keyof ReturnType<AssistantConfigService['flags']>
> = {
  demo: 'assistant_lead_submit',
  support: 'assistant_support_submit',
  quote: 'assistant_lead_submit',
  trust: 'assistant_trust_gated',
  tech: 'assistant_lead_submit',
  onboarding: 'assistant_lead_submit',
  privacy: 'assistant_privacy_write',
};

const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface IdempotencyRecord {
  key: string;
  journey: Journey;
  fingerprint?: string;
  expiresAt: number;
  response?: Record<string, unknown>;
}

export interface Submission {
  id: string;
  kind: string;
  publicReference: string;
  status: 'ACCEPTED' | 'PENDING_CONFIRMATION' | 'FAILED';
  payloadEncrypted: string;
  payloadHash: string;
  market: string;
  locale: string;
  noticeVersion: string;
  statusTokenHash?: string;
  createdAt: number;
  retentionUntil: number;
  transcriptShared: boolean;
  marketingOptIn: boolean;
}

@Injectable()
export class IntakeService {
  private readonly keys = new Map<string, IdempotencyRecord>();
  private readonly submissions = new Map<string, Submission>();
  private readonly byReference = new Map<string, string>();
  private readonly outbox: Array<Record<string, unknown>> = [];
  private readonly marketingPreferences = new Map<
    string,
    Record<string, unknown>
  >();

  constructor(private readonly config: AssistantConfigService) {}

  createKey(journey: Journey) {
    const key = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + 30 * 60 * 1000;
    this.keys.set(key, { key, journey, expiresAt });
    return {
      idempotency_key: key,
      expires_at: new Date(expiresAt).toISOString(),
      notice_version: this.config.policyVersions().privacy_notice,
    };
  }

  submit(journey: Journey, body: Record<string, unknown>) {
    const flags = this.config.flags();
    if (flags.assistant_kill) {
      throw this.disabled(
        journey,
        'The assistant is in static mode and cannot take requests right now.',
      );
    }
    const flag = FLAG_FOR_JOURNEY[journey];
    if (!flags[flag]) {
      throw this.disabled(
        journey,
        journey === 'privacy'
          ? 'Privacy requests are handled through the published privacy route, not this chat.'
          : 'This request route is not open yet. Use the published route instead.',
      );
    }

    const idempotencyKey = String(body.idempotency_key ?? '');
    if (!idempotencyKey) {
      throw this.badRequest(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Start the request again from the beginning.',
        {
          idempotency_key: ['Required'],
        },
      );
    }
    const record = this.keys.get(idempotencyKey);
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      record.journey !== journey
    ) {
      throw this.badRequest(
        'IDEMPOTENCY_KEY_INVALID',
        'This request key has expired. Start the request again.',
        {
          idempotency_key: ['Expired or invalid'],
        },
      );
    }

    if (body.consent !== true) {
      throw this.badRequest(
        'CONSENT_REQUIRED',
        'Confirm that you agree to the notice before submitting.',
        {
          consent: ['Required'],
        },
      );
    }
    const noticeVersion = String(body.notice_version ?? '');
    const expectedNotice = this.config.policyVersions().privacy_notice;
    if (noticeVersion !== expectedNotice) {
      throw this.badRequest(
        'NOTICE_VERSION_MISMATCH',
        'The notice has changed. Reload the form and try again.',
        {
          notice_version: ['Out of date'],
        },
      );
    }

    const fields = this.validateFields(journey, body);
    const fingerprint = this.fingerprint(journey, fields);
    if (record.fingerprint && record.fingerprint !== fingerprint) {
      throw this.conflict();
    }
    if (!record.fingerprint) record.fingerprint = fingerprint;
    if (record.response) {
      return { ...record.response, replayed: true };
    }

    const id = `sub_${randomBytes(9).toString('base64url')}`;
    const reference = this.reference(journey);
    const statusToken = randomBytes(24).toString('base64url');
    const now = Date.now();
    const marketingOptIn = body.marketing_opt_in === true;

    const submission: Submission = {
      id,
      kind: journey.toUpperCase(),
      publicReference: reference,
      status: 'ACCEPTED',
      payloadEncrypted: this.encrypt(JSON.stringify(fields)),
      payloadHash: createHash('sha256')
        .update(JSON.stringify(fields))
        .digest('hex'),
      market: String(body.market ?? 'undecided'),
      locale: String(body.locale ?? 'en-US'),
      noticeVersion,
      statusTokenHash: createHash('sha256').update(statusToken).digest('hex'),
      createdAt: now,
      retentionUntil: now + 365 * 24 * 60 * 60 * 1000,
      transcriptShared: body.transcript_share === true,
      marketingOptIn,
    };
    this.submissions.set(id, submission);
    this.byReference.set(reference, id);

    if (marketingOptIn && fields.work_email) {
      // Segregated from the request: the request itself never depends on this.
      this.marketingPreferences.set(
        createHash('sha256').update(String(fields.work_email)).digest('hex'),
        {
          opted_in: true,
          notice_version: noticeVersion,
          purpose: 'marketing',
          source: `public-assistant:${journey}`,
          recorded_at: new Date(now).toISOString(),
        },
      );
    }

    const response = {
      status: 'ACCEPTED' as const,
      public_reference: reference,
      submission_id: id,
      accepted_at: new Date(now).toISOString(),
      status_token: statusToken,
      notice_version: noticeVersion,
      delivery: 'ACCEPTED_FOR_TEAM' as const,
      message:
        'Your request was accepted for the team. This is not a booking, a ticket, a price or a service-level commitment.',
    };

    record.response = response;
    this.outbox.push({
      topic: 'public_assistant.submission.accepted',
      submission_id: id,
      public_reference: reference,
      kind: submission.kind,
      market: submission.market,
      occurred_at: response.accepted_at,
    });
    this.evict();

    return response;
  }

  status(publicReference: string, statusToken: string) {
    const id = this.byReference.get(publicReference.trim().toUpperCase());
    if (!id) throw this.notFound();
    const submission = this.submissions.get(id);
    if (!submission?.statusTokenHash) throw this.notFound();
    const tokenHash = createHash('sha256').update(statusToken).digest('hex');
    if (tokenHash !== submission.statusTokenHash) throw this.notFound();
    return {
      public_reference: submission.publicReference,
      status: submission.status,
      kind: submission.kind,
      accepted_at: new Date(submission.createdAt).toISOString(),
      delivery: 'ACCEPTED_FOR_TEAM',
      message:
        'The request is durably accepted. Delivery state is tracked separately by the team.',
    };
  }

  summaryPreview(lines: string[]) {
    const safe = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((line) => this.redactLine(line));
    const summary = safe.join('\n').slice(0, 1200);
    const redactions = (summary.match(/\[REDACTED[^\]]*\]/g) ?? []).length;
    return {
      summary,
      redactions,
      note: 'This preview is redacted and is only shared if you opt in. It never includes the assistant’s internal prompts.',
    };
  }

  private validateFields(
    journey: Journey,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const required = (name: string, max?: number) => {
      const value = body[name];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw this.badRequest(
          'FIELD_REQUIRED',
          'Complete the required fields.',
          {
            [name]: ['Required'],
          },
        );
      }
      const trimmed = value.trim();
      if (max && [...trimmed].length > max) {
        throw this.badRequest(
          'FIELD_TOO_LONG',
          'One of the fields is too long.',
          {
            [name]: [`Must be ${max} characters or fewer`],
          },
        );
      }
      return trimmed;
    };
    const optional = (name: string, max?: number) => {
      const value = body[name];
      if (value === undefined || value === null || value === '')
        return undefined;
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (max && [...trimmed].length > max) {
        throw this.badRequest(
          'FIELD_TOO_LONG',
          'One of the fields is too long.',
          {
            [name]: [`Must be ${max} characters or fewer`],
          },
        );
      }
      return trimmed;
    };

    const workEmail = required('work_email', 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
      throw this.badRequest(
        'EMAIL_INVALID',
        'Enter a valid work email address.',
        {
          work_email: ['Enter a valid email address'],
        },
      );
    }
    const organization = required('organization', 160);
    const contactName = optional('contact_name', 120);
    const market = optional('market', 32) ?? 'undecided';
    const locale = optional('locale', 16) ?? 'en-US';

    const freeText: Record<string, string | undefined> = {};
    if (journey === 'support') {
      freeText.topic = required('topic', 120);
      freeText.description = required('description', 500);
    }
    if (journey === 'trust') {
      freeText.document_id = required('document_id', 120);
      freeText.purpose = required('purpose', 240);
    }
    if (journey === 'tech') {
      freeText.use_case = required('use_case', 500);
    }
    if (journey === 'demo' || journey === 'quote' || journey === 'tech') {
      freeText.notes = optional('notes', 500);
    }
    if (journey === 'privacy') {
      freeText.request_summary = optional('request_summary', 500);
    }

    for (const [name, value] of Object.entries(freeText)) {
      if (value && hasSecret(value)) {
        throw this.badRequest(
          'SECRET_DETECTED',
          'Remove passwords, keys, tokens or other secrets before submitting.',
          { [name]: ['Remove secrets from this field'] },
        );
      }
    }

    return {
      work_email: workEmail,
      contact_name: contactName,
      organization,
      market,
      locale,
      ...freeText,
      asset_band: optional('asset_band', 32),
      ingestion_band: optional('ingestion_band', 32),
      persona: optional('persona', 64),
      topic_ids: Array.isArray(body.topic_ids)
        ? body.topic_ids
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 20)
        : undefined,
      transcript_share: body.transcript_share === true,
      marketing_opt_in: body.marketing_opt_in === true,
    };
  }

  private fingerprint(
    journey: Journey,
    fields: Record<string, unknown>,
  ): string {
    const canonical = JSON.stringify(
      Object.keys(fields)
        .sort()
        .reduce<Record<string, unknown>>(
          (acc, key) => {
            acc[key] = fields[key];
            return acc;
          },
          { journey },
        ),
    );
    return createHash('sha256').update(canonical).digest('hex');
  }

  private reference(journey: Journey): string {
    const bytes = randomBytes(8);
    let value = '';
    for (const byte of bytes) value += BASE32[byte % BASE32.length];
    return `ZS-${REFERENCE_PREFIX[journey]}-${value}`;
  }

  private encrypt(plain: string): string {
    const configured = process.env.PUBLIC_ASSISTANT_PAYLOAD_KEY;
    if (process.env.NODE_ENV === 'production' && !configured) {
      throw this.disabled(
        'demo',
        'Request intake is not configured for encryption in this environment.',
      );
    }
    const key = configured
      ? createHash('sha256').update(configured).digest()
      : createHash('sha256')
          .update('dev-public-assistant-payload-key')
          .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private redactLine(line: string): string {
    let result = line.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_KEY]');
    result = result.replace(/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]');
    result = result.replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[REDACTED_KEY]',
    );
    result = result.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUMBER]');
    result = result.replace(
      /((?:password|passwd|pwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*)\S+/gi,
      '$1[REDACTED]',
    );
    result = result.replace(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      '[REDACTED_EMAIL]',
    );
    return result;
  }

  private evict() {
    const now = Date.now();
    for (const [key, record] of this.keys) {
      if (record.expiresAt <= now && !record.response) this.keys.delete(key);
    }
  }

  private badRequest(
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    return new BadRequestException({
      error_code: code,
      user_safe_message: message,
      ...(fieldErrors ? { field_errors: fieldErrors } : {}),
    });
  }

  private conflict() {
    return new ConflictException({
      error_code: 'IDEMPOTENCY_CONFLICT',
      user_safe_message:
        'This request key was already used with different details. Start a new request.',
    });
  }

  private notFound() {
    return new NotFoundException({
      error_code: 'SUBMISSION_NOT_FOUND',
      user_safe_message: 'That request could not be found.',
    });
  }

  private disabled(journey: Journey, message: string) {
    return new ForbiddenException({
      error_code: 'JOURNEY_DISABLED',
      user_safe_message: message,
      journey,
    });
  }
}
