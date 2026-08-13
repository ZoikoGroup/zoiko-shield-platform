import {
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';

/** No approved fallback exists this pass — thrown instead of silently switching provider/region/model (spec §18). */
export class AiUnavailableException extends ServiceUnavailableException {
  constructor(reason: string) {
    super({ code: 'AI_UNAVAILABLE', reason });
  }
}

export class PolicyDeniedException extends ForbiddenException {
  constructor(reason: string) {
    super({ code: 'POLICY_DENIED', reason });
  }
}
