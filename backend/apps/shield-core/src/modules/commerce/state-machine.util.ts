import { ConflictException } from '@nestjs/common';

/**
 * ZS-COM-BILL-001 Part 20: no commercial object may move between statuses
 * outside its declared transition map. Illegal transitions must fail with
 * 409 INVALID_STATE_TRANSITION rather than silently writing an arbitrary
 * string status.
 */
export function assertTransition(
  transitions: Record<string, string[]>,
  currentStatus: string,
  targetStatus: string,
  objectLabel: string,
): void {
  const allowed = transitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new ConflictException({
      statusCode: 409,
      error: 'INVALID_STATE_TRANSITION',
      message: `Illegal ${objectLabel} transition from '${currentStatus}' to '${targetStatus}'`,
    });
  }
}
