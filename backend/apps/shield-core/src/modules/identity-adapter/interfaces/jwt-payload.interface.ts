import type { Assurance } from '../session.entity';

export interface JwtPayload {
  sub: string;
  sid: string;
  email: string;
  assurance: Assurance;
}

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  email: string;
  fullName?: string;
  emailVerified: boolean;
  assurance: Assurance;
}
