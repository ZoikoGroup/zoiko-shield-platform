export interface FederationAssertion {
  issuer: string;
  subject: string;
  email: string;
  fullName?: string;
  assurance: 'FEDERATED' | 'FEDERATED_MFA';
  claimProfile: Record<string, unknown>;
}
