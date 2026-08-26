import { SetMetadata } from '@nestjs/common';

export const HUMAN_AUTHORITY_KEY = 'humanAuthorityRequirement';

export const HUMAN_AUTHORITY_ACTIONS = [
  'REFUND_AUTHORIZATION',
  'COMMERCIAL_CHANGE_AUTHORIZATION',
  'CONTRACT_CHANGE_AUTHORIZATION',
  'RESPONSE_AUTHORITY_ELEVATION',
  'HIGH_IMPACT_RESPONSE_AUTHORIZATION',
  'COMPLIANCE_CONCLUSION',
  'LEGAL_COMPLIANCE_CONCLUSION',
] as const;

export type HumanAuthorityAction = (typeof HUMAN_AUTHORITY_ACTIONS)[number];

export interface HumanAuthorityRequirement {
  actionClass: HumanAuthorityAction;
  resourceType: string;
  resourceParam?: string;
}

export const RequireHumanAuthority = (
  actionClass: HumanAuthorityAction,
  resourceType: string,
  resourceParam?: string,
) =>
  SetMetadata(HUMAN_AUTHORITY_KEY, {
    actionClass,
    resourceType,
    resourceParam,
  } satisfies HumanAuthorityRequirement);
