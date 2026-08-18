import { Injectable, BadRequestException } from '@nestjs/common';

export type AuditPackageStatus =
  | 'DRAFT'
  | 'BUILDING'
  | 'VALIDATING'
  | 'INCOMPLETE'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REAPPROVAL_REQUIRED'
  | 'FROZEN'
  | 'SUPERSEDED'
  | 'FAILED';

const ALLOWED_TRANSITIONS: Record<AuditPackageStatus, AuditPackageStatus[]> = {
  DRAFT: ['BUILDING', 'FAILED'],
  BUILDING: ['VALIDATING', 'FAILED'],
  VALIDATING: ['READY_FOR_REVIEW', 'INCOMPLETE', 'FAILED'],
  INCOMPLETE: ['BUILDING', 'FAILED'],
  READY_FOR_REVIEW: ['APPROVED', 'FAILED'],
  APPROVED: ['FROZEN', 'REAPPROVAL_REQUIRED', 'FAILED'],
  REAPPROVAL_REQUIRED: ['READY_FOR_REVIEW', 'APPROVED', 'FAILED'],
  FROZEN: ['SUPERSEDED'],
  SUPERSEDED: [],
  FAILED: ['DRAFT'],
};

/** DRAFT can never reach FROZEN without passing through VALIDATING/READY_FOR_REVIEW/APPROVED (spec §32). */
@Injectable()
export class AuditPackageStateMachineService {
  assertValidTransition(from: string, to: string): void {
    const fromState = from as AuditPackageStatus;
    const toState = to as AuditPackageStatus;

    if (!ALLOWED_TRANSITIONS[fromState]) {
      throw new BadRequestException(`Unknown audit package status '${from}'`);
    }
    if (!Object.keys(ALLOWED_TRANSITIONS).includes(toState)) {
      throw new BadRequestException(
        `Unknown target audit package status '${to}'`,
      );
    }
    if (!ALLOWED_TRANSITIONS[fromState].includes(toState)) {
      throw new BadRequestException(
        `Invalid audit package transition '${from}' -> '${to}'`,
      );
    }
  }
}
