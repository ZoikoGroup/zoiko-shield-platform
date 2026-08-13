import { Injectable, BadRequestException } from '@nestjs/common';

export type CaseStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'INVESTIGATING'
  | 'CONTAINMENT_PENDING'
  | 'CONTAINED'
  | 'REMEDIATING'
  | 'MONITORING'
  | 'RESOLVED'
  | 'CLOSED';

export type CaseDisposition =
  | 'DUPLICATE'
  | 'FALSE_POSITIVE'
  | 'ACCEPTED_RISK'
  | 'CUSTOMER_ACTION_REQUIRED'
  | 'THIRD_PARTY_DEPENDENCY'
  | 'LEGAL_HOLD';

const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ['TRIAGED', 'CLOSED'],
  TRIAGED: ['INVESTIGATING', 'CLOSED'],
  INVESTIGATING: ['CONTAINMENT_PENDING', 'RESOLVED', 'CLOSED'],
  CONTAINMENT_PENDING: ['CONTAINED', 'CLOSED'],
  CONTAINED: ['REMEDIATING', 'CLOSED'],
  REMEDIATING: ['MONITORING', 'CLOSED'],
  MONITORING: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

/** Spec §11 — explicit state-machine service, no arbitrary transitions. Early closure (e.g. false positive found during triage) is allowed from any pre-CLOSED state directly to CLOSED, carrying a disposition. */
@Injectable()
export class CaseStateMachineService {
  assertValidTransition(from: string, to: string): void {
    const fromState = from as CaseStatus;
    const toState = to as CaseStatus;

    if (!ALLOWED_TRANSITIONS[fromState]) {
      throw new BadRequestException(`Unknown case status '${from}'`);
    }
    if (!Object.keys(ALLOWED_TRANSITIONS).includes(toState)) {
      throw new BadRequestException(`Unknown target case status '${to}'`);
    }
    if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
      throw new BadRequestException(
        `Invalid case transition '${from}' -> '${to}'`,
      );
    }
  }
}
