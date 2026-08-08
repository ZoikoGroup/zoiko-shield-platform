import { ControlImplementationStateMachineService } from './control-implementation-state-machine.service';

describe('ControlImplementationStateMachineService', () => {
  const service = new ControlImplementationStateMachineService();

  it('allows PLANNED -> IMPLEMENTED', () => {
    expect(() => service.assertValidTransition('PLANNED', 'IMPLEMENTED')).not.toThrow();
  });

  it('allows PLANNED -> NOT_APPLICABLE', () => {
    expect(() => service.assertValidTransition('PLANNED', 'NOT_APPLICABLE')).not.toThrow();
  });

  it('rejects RETIRED -> IMPLEMENTED — RETIRED is terminal', () => {
    expect(() => service.assertValidTransition('RETIRED', 'IMPLEMENTED')).toThrow();
  });

  it('rejects an unknown source status', () => {
    expect(() => service.assertValidTransition('BOGUS', 'IMPLEMENTED')).toThrow();
  });

  it('rejects an unknown target status', () => {
    expect(() => service.assertValidTransition('PLANNED', 'BOGUS')).toThrow();
  });
});
