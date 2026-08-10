import { Injectable, BadRequestException } from '@nestjs/common';

export type ControlImplementationStatus =
  | 'PLANNED'
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'NOT_IMPLEMENTED'
  | 'NOT_APPLICABLE'
  | 'RETIRED';

const ALLOWED_TRANSITIONS: Record<ControlImplementationStatus, ControlImplementationStatus[]> = {
  PLANNED: ['IMPLEMENTED', 'PARTIAL', 'NOT_IMPLEMENTED', 'NOT_APPLICABLE', 'RETIRED'],
  IMPLEMENTED: ['PARTIAL', 'NOT_IMPLEMENTED', 'RETIRED'],
  PARTIAL: ['IMPLEMENTED', 'NOT_IMPLEMENTED', 'RETIRED'],
  NOT_IMPLEMENTED: ['PLANNED', 'IMPLEMENTED', 'PARTIAL', 'RETIRED'],
  NOT_APPLICABLE: ['RETIRED'],
  RETIRED: [],
};

/** Same allow-list-transition-table shape as CaseStateMachineService/AlertStateMachineService. */
@Injectable()
export class ControlImplementationStateMachineService {
  assertValidTransition(from: string, to: string): void {
    const fromState = from as ControlImplementationStatus;
    const toState = to as ControlImplementationStatus;

    if (!ALLOWED_TRANSITIONS[fromState]) {
      throw new BadRequestException(`Unknown control implementation status '${from}'`);
    }
    if (!Object.keys(ALLOWED_TRANSITIONS).includes(toState)) {
      throw new BadRequestException(`Unknown target control implementation status '${to}'`);
    }
    if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
      throw new BadRequestException(`Invalid control implementation transition '${from}' -> '${to}'`);
    }
  }
}
