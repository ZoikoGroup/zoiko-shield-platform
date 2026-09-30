import { ForbiddenException } from '@nestjs/common';
import { G4GateGuard } from './g4-gate.guard';

describe('G4GateGuard', () => {
  it('fails closed: every call is forbidden until G4 is ratified (ADR-20)', () => {
    const guard = new G4GateGuard();

    expect(() => guard.canActivate()).toThrow(ForbiddenException);
    expect(() => guard.canActivate()).toThrow(/G4 Sovereign\/OT/);
    expect(() => guard.canActivate()).toThrow(/ADR-20/);
  });
});
