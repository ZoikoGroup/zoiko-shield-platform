import { SetMetadata } from '@nestjs/common';

export const PLATFORM_PERMISSIONS_KEY = 'requiredPlatformPermissions';
export const RequirePlatformPermissions = (...permissions: string[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);
