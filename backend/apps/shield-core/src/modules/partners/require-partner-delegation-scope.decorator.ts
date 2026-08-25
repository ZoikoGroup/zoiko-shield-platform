import { SetMetadata } from '@nestjs/common';
import type { DelegationScope } from './partner-delegation.service';

export const PARTNER_DELEGATION_SCOPE_KEY = 'partnerDelegationScope';

export const RequirePartnerDelegationScope = (scope: DelegationScope) =>
  SetMetadata(PARTNER_DELEGATION_SCOPE_KEY, scope);
