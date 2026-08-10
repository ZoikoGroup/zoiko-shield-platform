import { BadRequestException } from '@nestjs/common';
import { CaseStateMachineService } from '../state-machine/case-state-machine.service';

describe('CaseStateMachineService', () => {
  const machine = new CaseStateMachineService();

  it('walks the full documented lifecycle NEW -> ... -> CLOSED', () => {
    const path: [string, string][] = [
      ['NEW', 'TRIAGED'],
      ['TRIAGED', 'INVESTIGATING'],
      ['INVESTIGATING', 'CONTAINMENT_PENDING'],
      ['CONTAINMENT_PENDING', 'CONTAINED'],
      ['CONTAINED', 'REMEDIATING'],
      ['REMEDIATING', 'MONITORING'],
      ['MONITORING', 'RESOLVED'],
      ['RESOLVED', 'CLOSED'],
    ];
    for (const [from, to] of path) {
      expect(() => machine.assertValidTransition(from, to)).not.toThrow();
    }
  });

  it('allows early closure from TRIAGED directly to CLOSED (e.g. false positive found during triage)', () => {
    expect(() => machine.assertValidTransition('TRIAGED', 'CLOSED')).not.toThrow();
  });

  it('rejects skipping ahead (NEW -> INVESTIGATING directly)', () => {
    expect(() => machine.assertValidTransition('NEW', 'INVESTIGATING')).toThrow(BadRequestException);
  });

  it('rejects any transition out of CLOSED', () => {
    expect(() => machine.assertValidTransition('CLOSED', 'MONITORING')).toThrow(BadRequestException);
  });
});
