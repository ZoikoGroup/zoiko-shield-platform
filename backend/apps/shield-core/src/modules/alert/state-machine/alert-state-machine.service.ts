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
      throw new BadRequestException(
        `Invalid alert transition '${from}' -> '${to}'`,
      );
    }
  }

  /**
   * Shortest allow-listed route from one status to another, as the list of
   * intermediate states to walk through (excluding `from`, including `to`).
   *
   * Escalating an alert to a case is legitimate from NEW, but NEW cannot
   * reach ESCALATED_TO_CASE in one hop — the alert must be acknowledged and
   * triaged first. Rather than let case creation write the end state
   * directly and skip those records, the caller walks this path and persists
   * every hop, so the alert's history shows what actually happened.
   */
  pathTo(from: string, to: string): AlertStatus[] {
    const start = from as AlertStatus;
    const target = to as AlertStatus;
    if (!ALLOWED_TRANSITIONS[start]) {
      throw new BadRequestException(`Unknown alert status '${from}'`);
    }
    if (!ALLOWED_TRANSITIONS[target]) {
      throw new BadRequestException(`Unknown target alert status '${to}'`);
    }
    if (start === target) {
      return [];
    }

    const queue: AlertStatus[][] = [[start]];
    const seen = new Set<AlertStatus>([start]);
    while (queue.length > 0) {
      const route = queue.shift()!;
      for (const next of ALLOWED_TRANSITIONS[route[route.length - 1]]) {
        if (seen.has(next)) continue;
        const extended = [...route, next];
        if (next === target) {
          return extended.slice(1);
        }
        seen.add(next);
        queue.push(extended);
      }
    }

    throw new BadRequestException(
      `No allowed alert transition route from '${from}' to '${to}'`,
    );
  }
}
