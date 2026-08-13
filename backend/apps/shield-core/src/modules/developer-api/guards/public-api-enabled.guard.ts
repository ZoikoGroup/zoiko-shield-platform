import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Public developer API stays disabled behind this flag until the G2
 * release gate approves it (spec §25) — the architecture/foundation is
 * built now, but the public surface itself refuses every request while
 * the flag is off. Internal APIs used by shield-ai/shield-action/shield-anchor
 * are NOT governed by this flag.
 */
@Injectable()
export class PublicApiEnabledGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.PUBLIC_DEVELOPER_API_ENABLED !== 'true') {
      throw new ServiceUnavailableException(
        'Public developer API is not yet enabled (G2 release gate pending)',
      );
    }
    return true;
  }
}
