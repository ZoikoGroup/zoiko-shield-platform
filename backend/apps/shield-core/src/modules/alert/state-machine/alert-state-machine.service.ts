import { Injectable, BadRequestException } from '@nestjs/common';

export type AlertStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'TRIAGED'
  | 'FALSE_POSITIVE'
  | 'DUPLICATE'
  | 'SUPPRESSED'
  | 'ESCALATED_TO_CASE'
  | 'CLOSED';

const ALLOWED_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  NEW: ['ACKNOWLEDGED', 'SUPPRESSED', 'FALSE_POSITIVE', 'DUPLICATE'],
  ACKNOWLEDGED: ['TRIAGED', 'SUPPRESSED', 'FALSE_POSITIVE', 'DUPLICATE'],
  TRIAGED: ['ESCALATED_TO_CASE', 'FALSE_POSITIVE', 'DUPLICATE', 'CLOSED'],
  ESCALATED_TO_CASE: ['CLOSED'],
  FALSE_POSITIVE: ['CLOSED'],
  DUPLICATE: ['CLOSED'],
  SUPPRESSED: ['CLOSED'],
  CLOSED: [],
};

/**
 * Explicit allow-list state machine (spec §3) — mirrors the ConnectorState
 * handling precedent: transitions are validated here, never left to open
 * string writes at the call site.
 */
@Injectable()
export class AlertStateMachineService {
  assertValidTransition(from: string, to: string): void {
    const fromState = from as AlertStatus;
    const toState = to as AlertStatus;

    if (!ALLOWED_TRANSITIONS[fromState]) {
      throw new BadRequestException(`Unknown alert status '${from}'`);
    }
    if (!Object.keys(ALLOWED_TRANSITIONS).includes(toState)) {
      throw new BadRequestException(`Unknown target alert status '${to}'`);
    }
    if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
      throw new BadRequestException(`Invalid alert transition '${from}' -> '${to}'`);
    }
  }
}
