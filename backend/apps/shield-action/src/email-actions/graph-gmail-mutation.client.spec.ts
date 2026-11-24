import {
  EmailProviderMutationNotConfiguredError,
  type EmailProviderCredentialResolver,
} from './email-provider-mutation.port';
import {
  EnvEmailProviderCredentialResolver,
  GraphGmailMutationClient,
} from './graph-gmail-mutation.client';
import { EmailActionAdapterService } from './email-action-adapter.service';
import { ActionAuthorityService } from '../policy/action-authority.service';
import { BlastRadiusEvaluatorService } from '../rate-control/blast-radius-evaluator.service';

function makeResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  const rawBody =
    body === undefined
      ? ''
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => rawBody,
    json: async () => (rawBody ? JSON.parse(rawBody) : {}),
  } as unknown as Response;
}

describe('GraphGmailMutationClient', () => {
  let fetchMock: jest.Mock;
  let credResolver: EmailProviderCredentialResolver;
  let client: GraphGmailMutationClient;

  beforeEach(() => {
    delete process.env.EMAIL_MUTATION_DRY_RUN;
    delete process.env.EMAIL_WRITE_CREDENTIALS_JSON;
    delete process.env.MS_GRAPH_WRITE_ACCESS_TOKEN;
    delete process.env.GMAIL_WRITE_ACCESS_TOKEN;

    fetchMock = jest.fn();
    credResolver = {
      resolve: jest.fn(async (_tenantId, provider) => ({
        accessToken:
          provider === 'MICROSOFT_365' ? 'm365-token-123' : 'gws-token-456',
      })),
    };
    client = new GraphGmailMutationClient(credResolver, fetchMock as any);
  });

  describe('Microsoft 365 Graph mutations', () => {
    it('executes QUARANTINE_MESSAGE via Graph /messages/{id}/move to junkemail', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(201, { id: 'AAMk-moved-01' }, { 'request-id': 'req-1' }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-1',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'alice@contoso.com::msg-100',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('m365:AAMk-moved-01');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://graph.microsoft.com/v1.0/users/alice%40contoso.com/messages/msg-100/move',
      );
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ destinationId: 'junkemail' });
      expect(init.headers.Authorization).toBe('Bearer m365-token-123');
    });

    it('executes PULL_BACK_MESSAGE via Graph /messages/{id}/move to recoverableitemsdeletions', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(201, { id: 'AAMk-purged-02' }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-2',
        provider: 'MICROSOFT_365',
        requestedAction: 'PULL_BACK_MESSAGE',
        targetRef: 'alice@contoso.com::msg-200',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('m365:AAMk-purged-02');
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        destinationId: 'recoverableitemsdeletions',
      });
    });

    it('executes REMOVE_FORWARDING_RULE via Graph DELETE /messageRules/{id} and uses request-id receipt on 204', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(204, undefined, { 'request-id': 'graph-del-99' }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-3',
        provider: 'MICROSOFT_365',
        requestedAction: 'REMOVE_FORWARDING_RULE',
        targetRef: 'alice@contoso.com::rule-77',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('m365-req:graph-del-99');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://graph.microsoft.com/v1.0/users/alice%40contoso.com/mailFolders/inbox/messageRules/rule-77',
      );
      expect(init.method).toBe('DELETE');
    });

    it('executes REVOKE_MAILBOX_SESSIONS via Graph POST /revokeSignInSessions with bare mailbox UPN', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(200, { value: true }, { 'request-id': 'graph-rev-42' }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-4',
        provider: 'MICROSOFT_365',
        requestedAction: 'REVOKE_MAILBOX_SESSIONS',
        targetRef: 'alice@contoso.com',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('m365-req:graph-rev-42');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://graph.microsoft.com/v1.0/users/alice%40contoso.com/revokeSignInSessions',
      );
      expect(init.method).toBe('POST');
    });
  });

  describe('Google Workspace / Gmail mutations', () => {
    it('executes QUARANTINE_MESSAGE via Gmail /messages/{id}/modify', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(200, { id: 'gmail-msg-1', labelIds: ['SPAM'] }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-g',
        proposalId: 'prop-g1',
        provider: 'GOOGLE_WORKSPACE',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'bob@acme.test::gmail-msg-1',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('gws:gmail-msg-1');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://gmail.googleapis.com/gmail/v1/users/bob%40acme.test/messages/gmail-msg-1/modify',
      );
      expect(JSON.parse(init.body)).toEqual({
        addLabelIds: ['SPAM'],
        removeLabelIds: ['INBOX'],
      });
    });

    it('executes PULL_BACK_MESSAGE via Gmail /messages/{id}/trash', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(200, { id: 'gmail-msg-2' }));

      const res = await client.mutate({
        tenantId: 'tenant-g',
        proposalId: 'prop-g2',
        provider: 'GOOGLE_WORKSPACE',
        requestedAction: 'PULL_BACK_MESSAGE',
        targetRef: 'bob@acme.test::gmail-msg-2',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('gws:gmail-msg-2');
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://gmail.googleapis.com/gmail/v1/users/bob%40acme.test/messages/gmail-msg-2/trash',
      );
    });

    it('executes REMOVE_FORWARDING_RULE for both filter IDs and forwarding addresses', async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeResponse(204, undefined, { 'x-request-id': 'g-filter-1' }),
        )
        .mockResolvedValueOnce(
          makeResponse(204, undefined, { 'x-request-id': 'g-fwd-2' }),
        );

      const r1 = await client.mutate({
        tenantId: 'tenant-g',
        proposalId: 'prop-g3',
        provider: 'GOOGLE_WORKSPACE',
        requestedAction: 'REMOVE_FORWARDING_RULE',
        targetRef: 'bob@acme.test::flt-555',
      });
      const r2 = await client.mutate({
        tenantId: 'tenant-g',
        proposalId: 'prop-g4',
        provider: 'GOOGLE_WORKSPACE',
        requestedAction: 'REMOVE_FORWARDING_RULE',
        targetRef: 'bob@acme.test::attacker@evil.test',
      });

      expect(r1.status).toBe('VERIFIED');
      expect(r1.providerReceiptId).toBe('gws-req:g-filter-1');
      expect(fetchMock.mock.calls[0][0]).toContain('/settings/filters/flt-555');

      expect(r2.status).toBe('VERIFIED');
      expect(r2.providerReceiptId).toBe('gws-req:g-fwd-2');
      expect(fetchMock.mock.calls[1][0]).toContain(
        '/settings/forwardingAddresses/attacker%40evil.test',
      );
    });

    it('executes REVOKE_MAILBOX_SESSIONS via Google Admin Directory /users/{id}/signOut', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(204, undefined, { 'x-request-id': 'g-signout-88' }),
      );

      const res = await client.mutate({
        tenantId: 'tenant-g',
        proposalId: 'prop-g5',
        provider: 'GOOGLE_WORKSPACE',
        requestedAction: 'REVOKE_MAILBOX_SESSIONS',
        targetRef: 'bob@acme.test',
      });

      expect(res.status).toBe('VERIFIED');
      expect(res.providerReceiptId).toBe('gws-req:g-signout-88');
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://admin.googleapis.com/admin/directory/v1/users/bob%40acme.test/signOut',
      );
    });
  });

  describe('Dry-run mode, idempotency, and error handling', () => {
    it('supports dry-run mode without invoking fetch or returning VERIFIED', async () => {
      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-dry',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'alice@contoso.com::msg-dry-1',
        dryRun: true,
      });

      expect(res.status).toBe('DRY_RUN');
      expect(res.providerReceiptId).toBeUndefined();
      expect(res.dryRunPlan?.method).toBe('POST');
      expect(res.dryRunPlan?.endpoint).toContain('/messages/msg-dry-1/move');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('replays verified results idempotently without re-calling provider', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(201, { id: 'm365-once-1' }));

      const req = {
        tenantId: 'tenant-a',
        proposalId: 'prop-idem',
        provider: 'MICROSOFT_365' as const,
        requestedAction: 'QUARANTINE_MESSAGE' as const,
        targetRef: 'alice@contoso.com::msg-idem',
      };

      const first = await client.mutate(req);
      const second = await client.mutate(req);

      expect(first.status).toBe('VERIFIED');
      expect(first.idempotentReplay).toBeUndefined();
      expect(second.status).toBe('VERIFIED');
      expect(second.idempotentReplay).toBe(true);
      expect(second.providerReceiptId).toBe(first.providerReceiptId);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails closed with EmailProviderMutationNotConfiguredError when no credential exists', async () => {
      (credResolver.resolve as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        client.mutate({
          tenantId: 'tenant-unconfigured',
          proposalId: 'prop-nocred',
          provider: 'MICROSOFT_365',
          requestedAction: 'QUARANTINE_MESSAGE',
          targetRef: 'alice@contoso.com::msg-1',
        }),
      ).rejects.toBeInstanceOf(EmailProviderMutationNotConfiguredError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects malformed target references with FAILED before hitting provider', async () => {
      const res = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'prop-badref',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'missing-mailbox-delimiter',
      });

      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('INVALID_TARGET_REF');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps 401/403 to FAILED, 5xx/network errors to UNKNOWN, and missing 2xx receipt to UNKNOWN (T28)', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(403, { error: 'Forbidden' }))
        .mockResolvedValueOnce(makeResponse(503, 'Service Unavailable'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(makeResponse(200, { ok: true })); // no receipt id or headers

      const r403 = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-403',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m1',
      });
      const r503 = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-503',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m2',
      });
      const rNet = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-net',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m3',
      });
      const rNoReceipt = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-noreceipt',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m4',
      });

      expect(r403.status).toBe('FAILED');
      expect(r403.httpStatus).toBe(403);
      expect(r503.status).toBe('UNKNOWN');
      expect(r503.httpStatus).toBe(503);
      expect(rNet.status).toBe('UNKNOWN');
      expect(rNet.error).toContain('PROVIDER_TRANSPORT_ERROR');
      expect(rNoReceipt.status).toBe('UNKNOWN');
      expect(rNoReceipt.error).toContain('PROVIDER_RECEIPT_MISSING');
    });

    it('retries brief HTTP 429 and returns FAILED with retryAfterSeconds when Retry-After exceeds cap', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(429, '', { 'retry-after': '0' }))
        .mockResolvedValueOnce(makeResponse(201, { id: 'after-429' }))
        .mockResolvedValueOnce(makeResponse(429, '', { 'retry-after': '30' }));

      const retried = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-429-ok',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m-retry',
      });
      expect(retried.status).toBe('VERIFIED');
      expect(retried.providerReceiptId).toBe('m365:after-429');

      const throttled = await client.mutate({
        tenantId: 'tenant-a',
        proposalId: 'p-429-fail',
        provider: 'MICROSOFT_365',
        requestedAction: 'QUARANTINE_MESSAGE',
        targetRef: 'a@b.com::m-throttled',
      });
      expect(throttled.status).toBe('FAILED');
      expect(throttled.httpStatus).toBe(429);
      expect(throttled.retryAfterSeconds).toBe(30);
    });
  });

  describe('EnvEmailProviderCredentialResolver & adapter integration', () => {
    it('resolves per-tenant credentials and supports OAuth2 token exchange', async () => {
      process.env.EMAIL_WRITE_CREDENTIALS_JSON = JSON.stringify({
        'tenant-1:MICROSOFT_365': {
          tokenUrl: 'https://login.microsoftonline.com/tid/oauth2/v2.0/token',
          clientId: 'cid',
          clientSecret: 'csec',
          scope: 'https://graph.microsoft.com/.default',
        },
      });
      fetchMock.mockResolvedValueOnce(
        makeResponse(200, { access_token: 'exchanged-tok', expires_in: 3600 }),
      );

      const resolver = new EnvEmailProviderCredentialResolver(fetchMock as any);
      const cred1 = await resolver.resolve('tenant-1', 'MICROSOFT_365');
      const cred2 = await resolver.resolve('tenant-1', 'MICROSOFT_365');
      const missing = await resolver.resolve('tenant-2', 'MICROSOFT_365');

      expect(cred1?.accessToken).toBe('exchanged-tok');
      expect(cred2?.accessToken).toBe('exchanged-tok');
      expect(fetchMock).toHaveBeenCalledTimes(1); // second call cached
      expect(missing).toBeNull();
    });

    it('adapter execute() performs real provider mutation and supports dryRun cleanly', async () => {
      process.env.ENABLE_EMAIL_PHASE2_ACTIONS = 'true';
      try {
        fetchMock.mockResolvedValueOnce(
          makeResponse(200, { id: 'gmail-live-receipt-1' }),
        );
        const adapter = new EmailActionAdapterService(
          { isFrozen: jest.fn(async () => ({ frozen: false })) } as any,
          new ActionAuthorityService(),
          new BlastRadiusEvaluatorService(),
          client,
        );

        const dryRes = await adapter.execute({
          proposalId: 'prop-int-1',
          tenantId: 'tenant-g',
          provider: 'GOOGLE_WORKSPACE',
          requestedAction: 'QUARANTINE_MESSAGE',
          targetRefs: ['bob@acme.test::m-live-1'],
          consentScope: 'gmail.modify',
          riskClass: 'R3',
          initiatedBy: 'analyst-1',
          approvedBy: 'lead-1',
          approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          hasDedicatedWriteCredential: true,
          dryRun: true,
        });
        expect(dryRes.status).toBe('DRY_RUN');
        expect(dryRes.executedAt).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();

        const liveRes = await adapter.execute({
          proposalId: 'prop-int-1',
          tenantId: 'tenant-g',
          provider: 'GOOGLE_WORKSPACE',
          requestedAction: 'QUARANTINE_MESSAGE',
          targetRefs: ['bob@acme.test::m-live-1'],
          consentScope: 'gmail.modify',
          riskClass: 'R3',
          initiatedBy: 'analyst-1',
          approvedBy: 'lead-1',
          approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          hasDedicatedWriteCredential: true,
        });
        expect(liveRes.status).toBe('VERIFIED');
        expect(liveRes.outcomes[0].providerReceiptId).toBe(
          'gws:gmail-live-receipt-1',
        );
      } finally {
        delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
      }
    });
  });
});
