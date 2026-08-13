import { BadRequestException } from '@nestjs/common';

/** Resolve the one canonical tenant identifier accepted by a workload call. */
export function requireTenantId(
  ...candidates: Array<string | null | undefined>
): string {
  const tenantIds = [
    ...new Set(
      candidates
        .filter((candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0,
        )
        .map((candidate) => candidate.trim()),
    ),
  ];

  if (tenantIds.length === 0 || tenantIds.includes('default-tenant')) {
    throw new BadRequestException('The x-tenant-id header is required for this operation');
  }
  if (tenantIds.length > 1) {
    throw new BadRequestException('Conflicting tenant identifiers were supplied');
  }
  return tenantIds[0];
}

export function requireEnvironmentId(
  ...candidates: Array<string | null | undefined>
): string {
  const environmentIds = [
    ...new Set(
      candidates
        .filter((candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0,
        )
        .map((candidate) => candidate.trim()),
    ),
  ];
  if (environmentIds.length === 0 || environmentIds.includes('default-env')) {
    throw new BadRequestException('A canonical environment identifier is required');
  }
  if (environmentIds.length > 1) {
    throw new BadRequestException('Conflicting environment identifiers were supplied');
  }
  return environmentIds[0];
}

export function requireRegion(...candidates: Array<string | null | undefined>): string {
  const regions = [
    ...new Set(
      candidates
        .filter((candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0,
        )
        .map((candidate) => candidate.trim()),
    ),
  ];
  if (regions.length === 0 || regions.includes('unspecified')) {
    throw new BadRequestException('A canonical data-residency region is required');
  }
  if (regions.length > 1) {
    throw new BadRequestException('Conflicting data-residency regions were supplied');
  }
  return regions[0];
}
