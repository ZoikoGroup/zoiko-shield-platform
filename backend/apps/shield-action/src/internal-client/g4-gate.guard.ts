import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * G4 Sovereign/OT/Critical-Infrastructure capabilities (Combined Engineering
 * Specification §36/§38, "Workstream Handoff and G0-G4 Approval Gates")
 * require Board-delegated authorization and contracted/funded demand before
 * they may be reachable, even by another internal service - the spec rules
 * out speculative build, and the Master Build Plan lists sovereign/OT
 * deployment as out of scope for the current ERB-01 baseline. No such
 * ratification is recorded (see ADR-20). Fail closed until it is.
 */
@Injectable()
export class G4GateGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException(
      'This endpoint is part of the G4 Sovereign/OT/Critical-Infrastructure ' +
        'release gate, which has not been formally ratified by Board-delegated ' +
        'authority (Master Build Plan scope note; Combined Engineering ' +
        'Specification §36/§38, Rule G4-01; ADR-20). It stays disabled until ' +
        'G4 ratification is recorded.',
    );
  }
}
