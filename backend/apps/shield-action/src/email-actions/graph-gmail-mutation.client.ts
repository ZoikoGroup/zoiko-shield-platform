import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  EMAIL_PROVIDER_CREDENTIAL_RESOLVER,
  EmailProviderMutationNotConfiguredError,
  type EmailMutationAction,
  type EmailMutationProvider,
  type EmailProviderCredentialResolver,
  type EmailProviderDryRunPlan,
  type EmailProviderMutationPort,
  type EmailProviderMutationRequest,
  type EmailProviderTargetOutcome,
  type EmailProviderWriteCredential,
} from './email-provider-mutation.port';

export interface StoredProviderCredentialEntry {
  accessToken?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  refreshToken?: string;
  quarantineFolderId?: string;
  defaultMailbox?: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
  quarantineFolderId?: string;
  defaultMailbox?: string;
}

interface CachedIdempotencyEntry {
  outcome: EmailProviderTargetOutcome;
  expiresAtMs: number;
}

export type FetchFn = typeof fetch;

export const EMAIL_MUTATION_FETCH_FN = Symbol('EMAIL_MUTATION_FETCH_FN');

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_ADMIN_BASE_URL = 'https://admin.googleapis.com/admin/directory/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 5_000;
const MAX_TRANSIENT_429_RETRY_DELAY_MS = 2_000;

/**
 * Resolves per-tenant Phase 2 email write credentials from environment
 * configuration (or OAuth2 client-credentials / refresh-token exchange).
 *
 * Lookup order (most specific first):
 * 1. `EMAIL_WRITE_CREDENTIALS_JSON` keyed by `"<tenantId>:<provider>"`
 * 2. `EMAIL_WRITE_CREDENTIALS_JSON` keyed by `"<provider>"`
 * 3. Direct provider env vars (`MS_GRAPH_WRITE_ACCESS_TOKEN` /
 *    `MS_GRAPH_WRITE_TENANT_ID`+`CLIENT_ID`+`CLIENT_SECRET`, or
 *    `GMAIL_WRITE_ACCESS_TOKEN` / `GOOGLE_WRITE_CLIENT_ID`+`CLIENT_SECRET`+`REFRESH_TOKEN`).
 *
 * Returns `null` when nothing is configured so the mutation client fails closed
 * with `NOT_EXECUTED`.
 */
@Injectable()
export class EnvEmailProviderCredentialResolver implements EmailProviderCredentialResolver {
  private readonly logger = new Logger(EnvEmailProviderCredentialResolver.name);
  private readonly tokenCache = new Map<string, CachedAccessToken>();
  private readonly fetchFn: FetchFn;

  constructor(
    @Optional()
    @Inject(EMAIL_MUTATION_FETCH_FN)
    fetchFn?: FetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async resolve(
    tenantId: string,
    provider: EmailMutationProvider,
  ): Promise<EmailProviderWriteCredential | null> {
    const cacheKey = `${tenantId}:${provider}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now() + 30_000) {
      return {
        accessToken: cached.accessToken,
        quarantineFolderId: cached.quarantineFolderId,
        defaultMailbox: cached.defaultMailbox,
      };
    }

    const entry = this.readConfiguredEntry(tenantId, provider);
    if (!entry) {
      return null;
    }

    if (entry.accessToken?.trim()) {
      return {
        accessToken: entry.accessToken.trim(),
        quarantineFolderId: entry.quarantineFolderId,
        defaultMailbox: entry.defaultMailbox,
      };
    }

    if (entry.tokenUrl && entry.clientId && entry.clientSecret) {
      const exchanged = await this.exchangeOAuthToken(entry);
      this.tokenCache.set(cacheKey, {
        accessToken: exchanged.accessToken,
        expiresAtMs: Date.now() + exchanged.expiresInSeconds * 1000,
        quarantineFolderId: entry.quarantineFolderId,
        defaultMailbox: entry.defaultMailbox,
      });
      return {
        accessToken: exchanged.accessToken,
        quarantineFolderId: entry.quarantineFolderId,
        defaultMailbox: entry.defaultMailbox,
      };
    }

    return null;
  }

  clearCache(): void {
    this.tokenCache.clear();
  }

  private readConfiguredEntry(
    tenantId: string,
    provider: EmailMutationProvider,
  ): StoredProviderCredentialEntry | null {
    const rawJson = process.env.EMAIL_WRITE_CREDENTIALS_JSON?.trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as Record<
          string,
          StoredProviderCredentialEntry
        >;
        const scoped = parsed[`${tenantId}:${provider}`] ?? parsed[provider];
        if (scoped) return scoped;
      } catch (err) {
        this.logger.error(
          `Invalid EMAIL_WRITE_CREDENTIALS_JSON configuration: ${(err as Error).message}`,
        );
        return null;
      }
    }

    if (provider === 'MICROSOFT_365') {
      if (process.env.MS_GRAPH_WRITE_ACCESS_TOKEN?.trim()) {
        return {
          accessToken: process.env.MS_GRAPH_WRITE_ACCESS_TOKEN.trim(),
          quarantineFolderId:
            process.env.MS_GRAPH_QUARANTINE_FOLDER_ID?.trim() || undefined,
          defaultMailbox:
            process.env.MS_GRAPH_DEFAULT_MAILBOX?.trim() || undefined,
        };
      }
      const azTenant = process.env.MS_GRAPH_WRITE_TENANT_ID?.trim();
      const clientId = process.env.MS_GRAPH_WRITE_CLIENT_ID?.trim();
      const clientSecret = process.env.MS_GRAPH_WRITE_CLIENT_SECRET?.trim();
      if (azTenant && clientId && clientSecret) {
        return {
          tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(azTenant)}/oauth2/v2.0/token`,
          clientId,
          clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          quarantineFolderId:
            process.env.MS_GRAPH_QUARANTINE_FOLDER_ID?.trim() || undefined,
          defaultMailbox:
            process.env.MS_GRAPH_DEFAULT_MAILBOX?.trim() || undefined,
        };
      }
    }

    if (provider === 'GOOGLE_WORKSPACE') {
      if (process.env.GMAIL_WRITE_ACCESS_TOKEN?.trim()) {
        return {
          accessToken: process.env.GMAIL_WRITE_ACCESS_TOKEN.trim(),
          defaultMailbox:
            process.env.GMAIL_DEFAULT_MAILBOX?.trim() || undefined,
        };
      }
      const clientId = process.env.GOOGLE_WRITE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_WRITE_CLIENT_SECRET?.trim();
      const refreshToken = process.env.GOOGLE_WRITE_REFRESH_TOKEN?.trim();
      if (clientId && clientSecret && refreshToken) {
        return {
          tokenUrl: 'https://oauth2.googleapis.com/token',
          clientId,
          clientSecret,
          refreshToken,
          defaultMailbox:
            process.env.GMAIL_DEFAULT_MAILBOX?.trim() || undefined,
        };
      }
    }

    return null;
  }

  private async exchangeOAuthToken(
    entry: StoredProviderCredentialEntry,
  ): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const body = new URLSearchParams();
    body.set('client_id', entry.clientId!);
    body.set('client_secret', entry.clientSecret!);
    if (entry.refreshToken) {
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', entry.refreshToken);
    } else {
      body.set('grant_type', 'client_credentials');
      if (entry.scope) body.set('scope', entry.scope);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(entry.tokenUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `OAuth token exchange failed (HTTP ${response.status})`,
        );
      }

      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) {
        throw new Error('OAuth token response omitted access_token');
      }
      return {
        accessToken: data.access_token,
        expiresInSeconds:
          typeof data.expires_in === 'number' && data.expires_in > 60
            ? data.expires_in
            : 300,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

interface ParsedTarget {
  mailboxUser: string;
  resourceId?: string;
}

interface BuiltProviderCall {
  method: 'POST' | 'DELETE' | 'PATCH';
  endpoint: string;
  body?: Record<string, unknown>;
  mailboxUser: string;
}

/**
 * Production Microsoft Graph & Google Workspace/Gmail post-delivery mutation
 * client implementing {@link EmailProviderMutationPort}.
 *
 * Guarantees:
 * - Dry-run mode (`request.dryRun` or `EMAIL_MUTATION_DRY_RUN=true`) validates
 *   target formatting and builds the exact Graph/Gmail request plan without
 *   issuing mutating HTTP calls or reporting `VERIFIED`.
 * - Idempotency keyed on `(tenantId, proposalId, provider, requestedAction, targetRef)`
 *   (or explicit `request.idempotencyKey`) deduplicates retries and concurrent
 *   dispatches for verified outcomes.
 * - Strict receipt integrity (T28): `VERIFIED` is only returned when the
 *   provider responds 2xx AND supplies a provider receipt/request identifier.
 * - Fail-closed error classification:
 *   - missing tenant write credential -> `EmailProviderMutationNotConfiguredError` (`NOT_EXECUTED`)
 *   - 400/401/403/404/422/429 (after bounded retry) -> `FAILED`
 *   - 5xx / timeout / network error -> `UNKNOWN` (reconciliation required)
 */
@Injectable()
export class GraphGmailMutationClient implements EmailProviderMutationPort {
  private readonly logger = new Logger(GraphGmailMutationClient.name);
  private readonly idempotencyStore = new Map<string, CachedIdempotencyEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<EmailProviderTargetOutcome>
  >();
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly idempotencyTtlMs: number;

  constructor(
    @Inject(EMAIL_PROVIDER_CREDENTIAL_RESOLVER)
    private readonly credentialResolver: EmailProviderCredentialResolver,
    @Optional()
    @Inject(EMAIL_MUTATION_FETCH_FN)
    fetchFn?: FetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = Number(
      process.env.EMAIL_MUTATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    );
    this.idempotencyTtlMs = Number(
      process.env.EMAIL_MUTATION_IDEMPOTENCY_TTL_MS ||
        DEFAULT_IDEMPOTENCY_TTL_MS,
    );
  }

  private computeIdempotencyKey(request: EmailProviderMutationRequest): string {
    if (request.idempotencyKey?.trim()) {
      return createHash('sha256')
        .update(`${request.tenantId}:${request.idempotencyKey.trim()}`)
        .digest('hex');
    }
    return createHash('sha256')
      .update(
        [
          request.tenantId,
          request.proposalId,
          request.provider,
          request.requestedAction,
          request.targetRef,
        ].join('|'),
      )
      .digest('hex');
  }

  private parseTargetRef(
    targetRef: string,
    action: EmailMutationAction,
    defaultMailbox?: string,
  ): ParsedTarget | null {
    const trimmed = targetRef.trim();
    if (!trimmed || /\s/.test(trimmed)) {
      return null;
    }

    if (trimmed.includes('::')) {
      const idx = trimmed.indexOf('::');
      const mailboxUser = trimmed.slice(0, idx).trim();
      const resourceId = trimmed.slice(idx + 2).trim();
      if (!mailboxUser) return null;
      if (action !== 'REVOKE_MAILBOX_SESSIONS' && !resourceId) return null;
      return { mailboxUser, resourceId: resourceId || undefined };
    }

    if (action === 'REVOKE_MAILBOX_SESSIONS') {
      return { mailboxUser: trimmed };
    }

    if (defaultMailbox?.trim()) {
      return { mailboxUser: defaultMailbox.trim(), resourceId: trimmed };
    }

    return null;
  }

  private buildProviderCall(
    provider: EmailMutationProvider,
    action: EmailMutationAction,
    target: ParsedTarget,
    quarantineFolderId?: string,
  ): BuiltProviderCall {
    const encodedMailbox = encodeURIComponent(target.mailboxUser);

    if (provider === 'MICROSOFT_365') {
      switch (action) {
        case 'QUARANTINE_MESSAGE':
          return {
            method: 'POST',
            endpoint: `${GRAPH_BASE_URL}/users/${encodedMailbox}/messages/${encodeURIComponent(target.resourceId!)}/move`,
            body: { destinationId: quarantineFolderId || 'junkemail' },
            mailboxUser: target.mailboxUser,
          };
        case 'PULL_BACK_MESSAGE':
          return {
            method: 'POST',
            endpoint: `${GRAPH_BASE_URL}/users/${encodedMailbox}/messages/${encodeURIComponent(target.resourceId!)}/move`,
            body: { destinationId: 'recoverableitemsdeletions' },
            mailboxUser: target.mailboxUser,
          };
        case 'REMOVE_FORWARDING_RULE':
          return {
            method: 'DELETE',
            endpoint: `${GRAPH_BASE_URL}/users/${encodedMailbox}/mailFolders/inbox/messageRules/${encodeURIComponent(target.resourceId!)}`,
            mailboxUser: target.mailboxUser,
          };
        case 'REVOKE_MAILBOX_SESSIONS':
          return {
            method: 'POST',
            endpoint: `${GRAPH_BASE_URL}/users/${encodedMailbox}/revokeSignInSessions`,
            mailboxUser: target.mailboxUser,
          };
      }
    }

    // GOOGLE_WORKSPACE
    switch (action) {
      case 'QUARANTINE_MESSAGE':
        return {
          method: 'POST',
          endpoint: `${GMAIL_BASE_URL}/users/${encodedMailbox}/messages/${encodeURIComponent(target.resourceId!)}/modify`,
          body: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
          mailboxUser: target.mailboxUser,
        };
      case 'PULL_BACK_MESSAGE':
        return {
          method: 'POST',
          endpoint: `${GMAIL_BASE_URL}/users/${encodedMailbox}/messages/${encodeURIComponent(target.resourceId!)}/trash`,
          mailboxUser: target.mailboxUser,
        };
      case 'REMOVE_FORWARDING_RULE': {
        const resourceId = target.resourceId!;
        const isForwardingAddress =
          resourceId.startsWith('forwarding:') || resourceId.includes('@');
        const cleanId = resourceId.replace(/^forwarding:/, '');
        return {
          method: 'DELETE',
          endpoint: isForwardingAddress
            ? `${GMAIL_BASE_URL}/users/${encodedMailbox}/settings/forwardingAddresses/${encodeURIComponent(cleanId)}`
            : `${GMAIL_BASE_URL}/users/${encodedMailbox}/settings/filters/${encodeURIComponent(cleanId)}`,
          mailboxUser: target.mailboxUser,
        };
      }
      case 'REVOKE_MAILBOX_SESSIONS':
        return {
          method: 'POST',
          endpoint: `${GOOGLE_ADMIN_BASE_URL}/users/${encodedMailbox}/signOut`,
          mailboxUser: target.mailboxUser,
        };
    }
  }

  async mutate(
    request: EmailProviderMutationRequest,
  ): Promise<EmailProviderTargetOutcome> {
    const isDryRun =
      request.dryRun === true || process.env.EMAIL_MUTATION_DRY_RUN === 'true';

    if (isDryRun) {
      const target = this.parseTargetRef(
        request.targetRef,
        request.requestedAction,
        request.provider === 'MICROSOFT_365'
          ? process.env.MS_GRAPH_DEFAULT_MAILBOX
          : process.env.GMAIL_DEFAULT_MAILBOX,
      );
      if (!target) {
        return {
          targetRef: request.targetRef,
          status: 'FAILED',
          error:
            "INVALID_TARGET_REF: expected '<mailbox>::<resourceId>' (or '<mailbox>' for REVOKE_MAILBOX_SESSIONS)",
        };
      }
      const call = this.buildProviderCall(
        request.provider,
        request.requestedAction,
        target,
        process.env.MS_GRAPH_QUARANTINE_FOLDER_ID,
      );
      const dryRunPlan: EmailProviderDryRunPlan = {
        method: call.method,
        endpoint: call.endpoint,
        action: request.requestedAction,
        mailboxUser: call.mailboxUser,
      };
      return {
        targetRef: request.targetRef,
        status: 'DRY_RUN',
        dryRunPlan,
      };
    }

    const idemKey = this.computeIdempotencyKey(request);
    const cached = this.getCachedOutcome(idemKey);
    if (cached) {
      return { ...cached, idempotentReplay: true };
    }

    const existingPromise = this.inFlight.get(idemKey);
    if (existingPromise) {
      const outcome = await existingPromise;
      return { ...outcome, idempotentReplay: true };
    }

    const credential = await this.credentialResolver.resolve(
      request.tenantId,
      request.provider,
    );
    if (!credential) {
      throw new EmailProviderMutationNotConfiguredError(
        `EMAIL_PROVIDER_MUTATION_NOT_CONFIGURED: no write credential configured for tenant=${request.tenantId} provider=${request.provider}`,
      );
    }

    const target = this.parseTargetRef(
      request.targetRef,
      request.requestedAction,
      credential.defaultMailbox,
    );
    if (!target) {
      return {
        targetRef: request.targetRef,
        status: 'FAILED',
        error:
          "INVALID_TARGET_REF: expected '<mailbox>::<resourceId>' (or '<mailbox>' for REVOKE_MAILBOX_SESSIONS)",
      };
    }

    const call = this.buildProviderCall(
      request.provider,
      request.requestedAction,
      target,
      credential.quarantineFolderId,
    );

    const task = this.dispatchWithRetry(request, call, credential, idemKey);
    this.inFlight.set(idemKey, task);
    try {
      const outcome = await task;
      if (outcome.status === 'VERIFIED' && outcome.providerReceiptId) {
        this.putCachedOutcome(idemKey, outcome);
      }
      return outcome;
    } finally {
      this.inFlight.delete(idemKey);
    }
  }

  private async dispatchWithRetry(
    request: EmailProviderMutationRequest,
    call: BuiltProviderCall,
    credential: EmailProviderWriteCredential,
    idemKey: string,
  ): Promise<EmailProviderTargetOutcome> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${credential.accessToken}`,
          Accept: 'application/json',
          'Idempotency-Key': idemKey.slice(0, 64),
        };
        if (request.provider === 'MICROSOFT_365') {
          headers['client-request-id'] = idemKey.slice(0, 36);
        }
        if (call.body) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await this.fetchFn(call.endpoint, {
          method: call.method,
          headers,
          body: call.body ? JSON.stringify(call.body) : undefined,
          signal: controller.signal,
        });

        if (response.status === 429) {
          const retryAfterSeconds = this.parseRetryAfter(
            response.headers.get('retry-after'),
          );
          if (
            attempt < maxAttempts &&
            retryAfterSeconds * 1000 <= MAX_TRANSIENT_429_RETRY_DELAY_MS
          ) {
            await this.sleep(retryAfterSeconds * 1000);
            continue;
          }
          return {
            targetRef: request.targetRef,
            status: 'FAILED',
            httpStatus: 429,
            retryAfterSeconds,
            error: `PROVIDER_RATE_LIMITED: HTTP 429 (retry after ${retryAfterSeconds}s)`,
          };
        }

        if (response.status === 401 || response.status === 403) {
          return {
            targetRef: request.targetRef,
            status: 'FAILED',
            httpStatus: response.status,
            error: `PROVIDER_AUTH_DENIED: ${request.provider} returned HTTP ${response.status}`,
          };
        }

        if (response.status >= 400 && response.status < 500) {
          const detail = await this.safeReadErrorSnippet(response);
          return {
            targetRef: request.targetRef,
            status: 'FAILED',
            httpStatus: response.status,
            error: `PROVIDER_REJECTED (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
          };
        }

        if (response.status >= 500) {
          const detail = await this.safeReadErrorSnippet(response);
          return {
            targetRef: request.targetRef,
            status: 'UNKNOWN',
            httpStatus: response.status,
            error: `PROVIDER_SERVER_ERROR (HTTP ${response.status}); reconcile mailbox state before retrying${detail ? `: ${detail}` : ''}`,
          };
        }

        const receiptId = await this.extractProviderReceiptId(
          response,
          request.provider,
        );
        if (!receiptId) {
          return {
            targetRef: request.targetRef,
            status: 'UNKNOWN',
            httpStatus: response.status,
            error:
              'PROVIDER_RECEIPT_MISSING: provider returned 2xx without a receipt or request identifier (T28)',
          };
        }

        return {
          targetRef: request.targetRef,
          status: 'VERIFIED',
          providerReceiptId: receiptId,
          httpStatus: response.status,
        };
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || /abort/i.test(err.message));
        this.logger.warn(
          `Provider mutation ${request.provider}/${request.requestedAction} for tenant=${request.tenantId} errored: ${(err as Error).message}`,
        );
        return {
          targetRef: request.targetRef,
          status: 'UNKNOWN',
          error: isAbort
            ? `PROVIDER_TIMEOUT: request timed out after ${this.timeoutMs}ms; reconcile mailbox state`
            : `PROVIDER_TRANSPORT_ERROR: ${(err as Error).message}`,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      targetRef: request.targetRef,
      status: 'UNKNOWN',
      error: 'PROVIDER_EXHAUSTED_RETRIES',
    };
  }

  private async extractProviderReceiptId(
    response: Response,
    provider: EmailMutationProvider,
  ): Promise<string | null> {
    let payload: Record<string, unknown> | null = null;
    if (response.status !== 204) {
      const text = await response.text().catch(() => '');
      if (text.trim()) {
        try {
          payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }
    }

    if (provider === 'MICROSOFT_365') {
      const bodyId =
        this.nonEmptyString(payload?.id) ||
        this.nonEmptyString(payload?.requestId);
      const headerId =
        this.nonEmptyString(response.headers.get('request-id')) ||
        this.nonEmptyString(response.headers.get('x-ms-ags-diagnostic'));
      if (bodyId) return `m365:${bodyId}`;
      if (headerId) return `m365-req:${headerId}`;
      return null;
    }

    // GOOGLE_WORKSPACE
    const bodyId =
      this.nonEmptyString(payload?.id) ||
      this.nonEmptyString(payload?.historyId) ||
      this.nonEmptyString(payload?.threadId);
    const headerId =
      this.nonEmptyString(response.headers.get('x-request-id')) ||
      this.nonEmptyString(response.headers.get('etag')) ||
      this.nonEmptyString(response.headers.get('x-guploader-uploadid'));
    if (bodyId) return `gws:${bodyId}`;
    if (headerId) return `gws-req:${headerId}`;
    return null;
  }

  private nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private parseRetryAfter(raw: string | null): number {
    if (!raw) return 5;
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0) return Math.min(num, 300);
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) {
      return Math.max(
        0,
        Math.min(Math.ceil((dateMs - Date.now()) / 1000), 300),
      );
    }
    return 5;
  }

  private async safeReadErrorSnippet(response: Response): Promise<string> {
    const raw = await response.text().catch(() => '');
    return raw.replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  private getCachedOutcome(key: string): EmailProviderTargetOutcome | null {
    const entry = this.idempotencyStore.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= Date.now()) {
      this.idempotencyStore.delete(key);
      return null;
    }
    return entry.outcome;
  }

  private putCachedOutcome(
    key: string,
    outcome: EmailProviderTargetOutcome,
  ): void {
    if (this.idempotencyStore.size >= MAX_IDEMPOTENCY_ENTRIES) {
      const oldestKey = this.idempotencyStore.keys().next().value;
      if (oldestKey) this.idempotencyStore.delete(oldestKey);
    }
    this.idempotencyStore.set(key, {
      outcome,
      expiresAtMs: Date.now() + this.idempotencyTtlMs,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
