import { Injectable, Logger } from '@nestjs/common';

/**
 * Reads a proposal's declared rollback_action_type — no live rollback
 * execution exists this pass (no live execution exists at all), this only
 * reports whether a rollback path is declared so operators know reversal
 * is possible ahead of any future live-execution milestone.
 */
@Injectable()
export class RollbackService {
  private readonly logger = new Logger(RollbackService.name);

  describeRollback(params: {
    reversible: boolean;
    rollbackActionType?: string | null;
  }): { available: boolean; rollbackActionType?: string } {
    if (!params.reversible || !params.rollbackActionType) {
      return { available: false };
    }
    return { available: true, rollbackActionType: params.rollbackActionType };
  }
}
