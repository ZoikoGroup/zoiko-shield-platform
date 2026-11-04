import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT_KEY = 'public-assistant:endpoint';

/**
 * All controllers in this service are anonymous by design. The decorator makes
 * that explicit so the public surface can be audited and so a future guard can
 * fail closed on any handler that forgets it.
 */
export const PublicEndpoint = () => SetMetadata(PUBLIC_ENDPOINT_KEY, 'PUBLIC');
