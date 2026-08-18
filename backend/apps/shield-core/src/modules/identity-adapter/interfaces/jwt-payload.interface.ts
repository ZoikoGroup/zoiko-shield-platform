import type { Assurance } from '../session.entity';
import type { SessionState } from '../session.entity';

export interface JwtPayload {
  sub: string;
  sid: string;
  email: string;
  assurance: Assurance;
  tid: string;
  mid: string;
  eid: string | null;
  region: string;
  policyVersion: string;
  riskState: string;
  sessionState: SessionState;
}

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  email: string;
  fullName?: string;
  emailVerified: boolean;
  assurance: Assurance;
  tenantId: string;
  membershipId: string;
  environmentId: string | null;
  region: string;
  policyVersion: string;
  riskState: string;
  sessionState: SessionState;
}
