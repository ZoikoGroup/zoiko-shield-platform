import { AuditPackageStateMachineService } from './audit-package-state-machine.service';

describe('AuditPackageStateMachineService', () => {
  const service = new AuditPackageStateMachineService();

  it('rejects DRAFT -> FROZEN directly — must pass through validation/review/approval', () => {
    expect(() => service.assertValidTransition('DRAFT', 'FROZEN')).toThrow();
  });

  it('allows the full happy path step by step', () => {
    expect(() =>
      service.assertValidTransition('DRAFT', 'BUILDING'),
    ).not.toThrow();
    expect(() =>
      service.assertValidTransition('BUILDING', 'VALIDATING'),
    ).not.toThrow();
    expect(() =>
      service.assertValidTransition('VALIDATING', 'READY_FOR_REVIEW'),
    ).not.toThrow();
    expect(() =>
      service.assertValidTransition('READY_FOR_REVIEW', 'APPROVED'),
    ).not.toThrow();
    expect(() =>
      service.assertValidTransition('APPROVED', 'FROZEN'),
    ).not.toThrow();
  });

  it('allows APPROVED -> REAPPROVAL_REQUIRED when the manifest hash drifts after approval', () => {
    expect(() =>
      service.assertValidTransition('APPROVED', 'REAPPROVAL_REQUIRED'),
    ).not.toThrow();
  });

  it('rejects any transition out of FROZEN except SUPERSEDED', () => {
    expect(() => service.assertValidTransition('FROZEN', 'DRAFT')).toThrow();
    expect(() =>
      service.assertValidTransition('FROZEN', 'SUPERSEDED'),
    ).not.toThrow();
  });

  it('rejects any transition out of SUPERSEDED — terminal', () => {
    expect(() =>
      service.assertValidTransition('SUPERSEDED', 'DRAFT'),
    ).toThrow();
  });
});
