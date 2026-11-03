import { AiUnavailableException } from '../gateway/fallback/fallback.exceptions';

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Synthetic model output is dev/test only; production must fail closed instead. */
export function assertSyntheticOutputAllowed(source: string): void {
  if (isProductionRuntime()) {
    throw new AiUnavailableException(
      `${source}: synthetic model output is forbidden in production`,
    );
  }
}
