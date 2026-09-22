import { BadRequestException } from '@nestjs/common';
import { AlertStateMachineService } from './alert-state-machine.service';

describe('AlertStateMachineService.pathTo', () => {
  const machine = new AlertStateMachineService();

  it('routes a new alert to escalation through acknowledge and triage', () => {
    expect(machine.pathTo('NEW', 'ESCALATED_TO_CASE')).toEqual([
      'ACKNOWLEDGED',
      'TRIAGED',
      'ESCALATED_TO_CASE',
    ]);
  });

  it('returns only the remaining hops for an alert already part-way through', () => {
    expect(machine.pathTo('TRIAGED', 'ESCALATED_TO_CASE')).toEqual([
      'ESCALATED_TO_CASE',
    ]);
  });

  it('returns no hops when the alert is already in the target state', () => {
    expect(machine.pathTo('ESCALATED_TO_CASE', 'ESCALATED_TO_CASE')).toEqual(
      [],
    );
  });

  it('refuses to invent a route out of a terminal state', () => {
    // CLOSED has no outgoing transitions, so there is no honest way to
    // escalate a closed alert — better a clear failure than a silent write.
    expect(() => machine.pathTo('CLOSED', 'ESCALATED_TO_CASE')).toThrow(
      BadRequestException,
    );
  });

  it('rejects statuses that are not in the state machine at all', () => {
    // 'PROMOTED_TO_CASE' is the status shield-ingest used to write directly.
    expect(() => machine.pathTo('PROMOTED_TO_CASE', 'CLOSED')).toThrow(
      BadRequestException,
    );
  });
});
