import type { Session as SessionRow } from '@prisma/client';

export type Assurance =
  | 'PASSWORD'
  | 'PASSWORD_MFA'
  | 'FEDERATED'
  | 'FEDERATED_MFA'
  | 'PASSKEY'
  | 'RECOVERY';

export type SessionState = 'ACTIVE' | 'RESTRICTED';

export interface SessionBinding {
  tenantId: string;
  membershipId: string;
  environmentId: string | null;
  region: string;
  authenticationMethod: 'PASSWORD' | 'OIDC' | 'SAML' | 'PASSKEY';
  issuer?: string | null;
  policyVersion: string;
  riskState?: string;
  state?: SessionState;
}

/**
 * Row of identity.sessions, persisted through Prisma. `familyId` is set once
 * at issuance and carried across rotations of the same login; it lets a
 * detected-reuse event revoke every token descended from it.
 */
export type Session = Omit<SessionRow, 'assurance' | 'state'> & {
  assurance: Assurance;
  state: SessionState;
};
