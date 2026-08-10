import { Injectable } from '@nestjs/common';

/**
 * SIMULATION-only "dispatch" — no providers/ subfolder populated yet, since
 * no live execution path exists this milestone. Builds the observed-state
 * description a real dispatcher would populate from a provider response;
 * here it is derived entirely locally, never a live provider call.
 */
@Injectable()
export class DispatcherService {
  dispatchSimulated(params: { actionType: string; targetType: string; targetId: string; authorityLevel: string }) {
    return {
      target: { targetType: params.targetType, targetId: params.targetId },
      expectedAction: params.actionType,
      blastRadius: 'SIMULATION_ONLY — no live provider call was made',
      authorityLevel: params.authorityLevel,
    };
  }
}
