import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DATA_REGIONS, OnboardTenantDto } from './dto/onboard-tenant.dto';

@Injectable()
export class OnboardingReadinessService {
  assertReady(dto: OnboardTenantDto): void {
    const residencyRegion = dto.dataResidencyRegion ?? dto.homeRegion;
    const configuredRegions = new Set(
      (process.env.SUPPORTED_DATA_REGIONS ?? DATA_REGIONS.join(','))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );

    if (!configuredRegions.has(dto.homeRegion) || !configuredRegions.has(residencyRegion)) {
      throw new BadRequestException('The selected home or residency region is not supported');
    }
    if (dto.homeRegion !== residencyRegion) {
      throw new BadRequestException('Cross-region tenant provisioning is not enabled; home and residency regions must match');
    }

    const retentionPolicies = new Set(
      (process.env.RETENTION_POLICY_REFS ?? 'default,standard-365d,security-365d,legal-7y')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!retentionPolicies.has(dto.retentionPolicyRef)) {
      throw new BadRequestException(`Unknown retention policy '${dto.retentionPolicyRef}'`);
    }

    if (process.env.NODE_ENV === 'production') {
      const regionKey = `KMS_KEY_${residencyRegion.replace(/-/g, '_').toUpperCase()}`;
      if (!process.env[regionKey]) {
        throw new ServiceUnavailableException(`Regional encryption key '${regionKey}' is not configured`);
      }
      if (!process.env.EVIDENCE_S3_BUCKET || !process.env.S3_ENDPOINT) {
        throw new ServiceUnavailableException('Regional evidence storage is not configured');
      }
    }
  }
}
