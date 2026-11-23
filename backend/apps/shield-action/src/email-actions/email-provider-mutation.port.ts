export const EMAIL_PROVIDER_MUTATION_PORT = Symbol(
  'EMAIL_PROVIDER_MUTATION_PORT',
);

export interface EmailProviderMutationRequest {
  tenantId: string;
  proposalId: string;
  provider: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE';
  requestedAction:
    | 'QUARANTINE_MESSAGE'
    | 'PULL_BACK_MESSAGE'
    | 'REMOVE_FORWARDING_RULE'
    | 'REVOKE_MAILBOX_SESSIONS';
  targetRef: string;
}

/**
 * Result for ONE target as reported by the provider. `providerReceiptId` MUST be
 * an identifier returned by the provider API; it is never synthesised locally.
 */
export interface EmailProviderTargetOutcome {
  targetRef: string;
  status: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  providerReceiptId?: string;
  error?: string;
}

/**
 * The only seam through which a mailbox can be mutated. A real Microsoft Graph /
 * Gmail implementation is bound to this token once the write-credential and
 * connector-certification gates (ADR-22) are closed. Until then
 * {@link NotConfiguredEmailProviderMutationPort} is bound and execution reports
 * NOT_EXECUTED rather than inventing success.
 */
export interface EmailProviderMutationPort {
  mutate(
    request: EmailProviderMutationRequest,
  ): Promise<EmailProviderTargetOutcome>;
}

export class EmailProviderMutationNotConfiguredError extends Error {
  constructor() {
    super(
      'EMAIL_PROVIDER_MUTATION_NOT_CONFIGURED: no certified provider mutation client is bound; nothing was executed',
    );
  }
}

export class NotConfiguredEmailProviderMutationPort implements EmailProviderMutationPort {
  mutate(): Promise<EmailProviderTargetOutcome> {
    return Promise.reject(new EmailProviderMutationNotConfiguredError());
  }
}
