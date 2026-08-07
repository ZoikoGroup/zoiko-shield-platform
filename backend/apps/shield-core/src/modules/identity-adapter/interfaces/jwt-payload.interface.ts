export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  roles: string[];
}
