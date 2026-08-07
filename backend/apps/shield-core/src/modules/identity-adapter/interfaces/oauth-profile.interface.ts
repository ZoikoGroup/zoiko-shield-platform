export interface OAuthProfile {
  issuer: string;
  providerUserId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  claimProfile?: Record<string, unknown>;
}
