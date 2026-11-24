export const EMAIL_PROVIDER_MUTATION_PORT = Symbol(
  'EMAIL_PROVIDER_MUTATION_PORT',
);

export const EMAIL_PROVIDER_CREDENTIAL_RESOLVER = Symbol(
  'EMAIL_PROVIDER_CREDENTIAL_RESOLVER',
);

export type EmailMutationProvider = 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';

export type EmailMutationAction =
  | 'QUARANTINE_MESSAGE'
  | 'PULL_BACK_MESSAGE'
  | 'REMOVE_FORWARDING_RULE'
  | 'REVOKE_MAILBOX_SESSIONS';

export interface EmailProviderMutationRequest {
  tenantId: string;
  proposalId: string;
  provider: EmailMutationProvider;
  requestedAction: EmailMutationAction;
  targetRef: string;
  /** When true, validates target and constructs provider request without mutating mailboxes. */
  dryRun?: boolean;
  /** Caller-supplied idempotency key; defaults to a deterministic hash of tenant/proposal/action/target. */
  idempotencyKey?: string;
}

export interface EmailProviderDryRunPlan {
  method: 'POST' | 'DELETE' | 'PATCH';
  endpoint: string;
  action: EmailMutationAction;
  mailboxUser: string;
}

/**
 * Result for ONE target as reported by the provider. `providerReceiptId` MUST be
 * an identifier returned by the provider API; it is never synthesised locally.
 */
export interface EmailProviderTargetOutcome {
  targetRef: string;
  status: 'VERIFIED' | 'DRY_RUN' | 'FAILED' | 'UNKNOWN';
  providerReceiptId?: string;
  idempotentReplay?: boolean;
  httpStatus?: number;
  retryAfterSeconds?: number;
  dryRunPlan?: EmailProviderDryRunPlan;
  error?: string;
}

export interface EmailProviderWriteCredential {
  accessToken: string;
  quarantineFolderId?: string;
  defaultMailbox?: string;
}

export interface EmailProviderCredentialResolver {
  resolve(
    tenantId: string,
    provider: EmailMutationProvider,
  ): Promise<EmailProviderWriteCredential | null>;
}

/**
 * The only seam through which a mailbox can be mutated. Backed by
 * {@link GraphGmailMutationClient} in Shield Action; fails closed with
 * {@link EmailProviderMutationNotConfiguredError} when no tenant write
 * credential is configured so execution reports NOT_EXECUTED rather than
 * inventing success.
 */
export interface EmailProviderMutationPort {
  mutate(
    request: EmailProviderMutationRequest,
  ): Promise<EmailProviderTargetOutcome>;
}

export class EmailProviderMutationNotConfiguredError extends Error {
  constructor(
    message = 'EMAIL_PROVIDER_MUTATION_NOT_CONFIGURED: no certified provider mutation client is bound; nothing was executed',
  ) {
    super(message);
    this.name = 'EmailProviderMutationNotConfiguredError';
  }
}

export class NotConfiguredEmailProviderMutationPort implements EmailProviderMutationPort {
  mutate(): Promise<EmailProviderTargetOutcome> {
    return Promise.reject(new EmailProviderMutationNotConfiguredError());
  }
}
