import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'zs:required-scopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
