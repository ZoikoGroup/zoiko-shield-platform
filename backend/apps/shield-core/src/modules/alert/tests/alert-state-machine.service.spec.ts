import { BadRequestException } from '@nestjs/common';
import { AlertStateMachineService } from '../state-machine/alert-state-machine.service';

describe('AlertStateMachineService', () => {
  const machine = new AlertStateMachineService();

  it('allows NEW -> ACKNOWLEDGED -> TRIAGED -> ESCALATED_TO_CASE -> CLOSED', () => {
    expect(() => machine.assertValidTransition('NEW', 'ACKNOWLEDGED')).not.toThrow();
    expect(() => machine.assertValidTransition('ACKNOWLEDGED', 'TRIAGED')).not.toThrow();
    expect(() => machine.assertValidTransition('TRIAGED', 'ESCALATED_TO_CASE')).not.toThrow();
    expect(() => machine.assertValidTransition('ESCALATED_TO_CASE', 'CLOSED')).not.toThrow();
  });

  it('rejects skipping states (NEW -> TRIAGED directly)', () => {
    expect(() => machine.assertValidTransition('NEW', 'TRIAGED')).toThrow(BadRequestException);
  });

  it('rejects any transition out of CLOSED (terminal state)', () => {
    expect(() => machine.assertValidTransition('CLOSED', 'NEW')).toThrow(BadRequestException);
  });

  it('rejects an unknown source status', () => {
    expect(() => machine.assertValidTransition('NOT_A_STATUS', 'CLOSED')).toThrow(BadRequestException);
  });

  it('rejects an unknown target status', () => {
    expect(() => machine.assertValidTransition('NEW', 'NOT_A_STATUS')).toThrow(BadRequestException);
  });
});
