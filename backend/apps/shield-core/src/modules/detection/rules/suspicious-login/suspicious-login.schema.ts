export const SUSPICIOUS_LOGIN_KEY = 'SUSPICIOUS_LOGIN_NEW_LOCATION';

export interface SuspiciousLoginConfiguration {
  /** Identity types treated as privileged for this rule; MVP has no directory-role signal, so this can never be positively confirmed today (spec §21: only use factors actually available). */
  privilegedIdentityTypes: string[];
}

export const DEFAULT_SUSPICIOUS_LOGIN_CONFIG: SuspiciousLoginConfiguration = {
  privilegedIdentityTypes: ['MANAGED_IDENTITY', 'SERVICE_ACCOUNT'],
};

export const SUSPICIOUS_LOGIN_REQUIRED_EVENT_TYPES = ['AUTHENTICATION'];
export const SUSPICIOUS_LOGIN_REQUIRED_FIELDS = ['outcome', 'occurred_at'];
export const SUSPICIOUS_LOGIN_REQUIRED_CONTEXT = ['identity'];
