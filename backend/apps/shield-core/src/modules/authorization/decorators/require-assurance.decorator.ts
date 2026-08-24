import { SetMetadata } from '@nestjs/common';
import type { Assurance } from '../../identity-adapter/session.entity';

export const REQUIRED_ASSURANCE_KEY = 'requiredAssurance';

/** Declares the session assurance levels accepted for a sensitive operation. */
export const RequireAssurance = (...assurance: Assurance[]) =>
  SetMetadata(REQUIRED_ASSURANCE_KEY, assurance);
