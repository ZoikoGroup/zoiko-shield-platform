import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

export type SovereignJurisdiction =
  | 'EU_SOVEREIGN'
  | 'UK_SOVEREIGN'
  | 'US_GOVCLOUD'
  | 'APAC_SOVEREIGN'
  | 'GLOBAL_COMMERCIAL';

export interface DataResidencyPolicy {
  jurisdiction: SovereignJurisdiction;
  permittedRegions: string[];
  crossBorderTransferAllowed: boolean;
  mandatoryKmsKeyRegion: string;
}

export interface TelemetryRoutingAssessment {
  tenantId: string;
  sourceRegion: string;
  targetStorageRegion: string;
  dataType: 'RAW_TELEMETRY' | 'EVIDENCE_BLOB' | 'AUDIT_PACKAGE' | 'AI_PROMPT';
  jurisdiction: SovereignJurisdiction;
}

export interface SovereigntyComplianceDecision {
  assessmentId: string;
  tenantId: string;
  jurisdiction: SovereignJurisdiction;
  isRoutingPermitted: boolean;
  status: 'COMPLIANT' | 'CROSS_BORDER_LEAKAGE_PREVENTED';
  reason: string;
  auditAttestationDigest: string;
  evaluatedAt: string;
}

@Injectable()
export class DataSovereigntyGuardService {
  private readonly logger = new Logger(DataSovereigntyGuardService.name);

  private readonly POLICIES: Record<SovereignJurisdiction, DataResidencyPolicy> = {
    EU_SOVEREIGN: {
      jurisdiction: 'EU_SOVEREIGN',
      permittedRegions: ['europe-west1', 'europe-west3', 'europe-west4', 'europe-north1', 'eu-central-1', 'eu-west-1'],
      crossBorderTransferAllowed: false,
      mandatoryKmsKeyRegion: 'europe-west3',
    },
    UK_SOVEREIGN: {
      jurisdiction: 'UK_SOVEREIGN',
      permittedRegions: ['europe-west2', 'eu-west-2'],
      crossBorderTransferAllowed: false,
      mandatoryKmsKeyRegion: 'europe-west2',
    },
    US_GOVCLOUD: {
      jurisdiction: 'US_GOVCLOUD',
      permittedRegions: ['us-gov-east-1', 'us-gov-west-1', 'us-east-1', 'us-central1'],
      crossBorderTransferAllowed: false,
      mandatoryKmsKeyRegion: 'us-gov-east-1',
    },
    APAC_SOVEREIGN: {
      jurisdiction: 'APAC_SOVEREIGN',
      permittedRegions: ['asia-southeast1', 'asia-northeast1', 'ap-southeast-1'],
      crossBorderTransferAllowed: false,
      mandatoryKmsKeyRegion: 'asia-southeast1',
    },
    GLOBAL_COMMERCIAL: {
      jurisdiction: 'GLOBAL_COMMERCIAL',
      permittedRegions: ['*'],
      crossBorderTransferAllowed: true,
      mandatoryKmsKeyRegion: 'global',
    },
  };

  /**
   * Asserts whether a telemetry or evidence payload can be stored/processed in the target region.
   */
  assertSovereignRouting(
    input: TelemetryRoutingAssessment,
  ): SovereigntyComplianceDecision {
    const policy = this.POLICIES[input.jurisdiction] || this.POLICIES.GLOBAL_COMMERCIAL;
    const isTargetPermitted =
      policy.permittedRegions.includes('*') || policy.permittedRegions.includes(input.targetStorageRegion);

    const assessmentId = `sovereignty-${crypto.randomUUID()}`;

    if (!isTargetPermitted) {
      const reason = `Cross-border data transfer prohibited under ${input.jurisdiction}. Target region '${input.targetStorageRegion}' is not in permitted sovereign perimeter: [${policy.permittedRegions.join(', ')}]`;
      this.logger.warn(`🚨 [DATA FENCE BLOCK] Tenant ${input.tenantId} attempted unapproved routing to ${input.targetStorageRegion}`);

      throw new ForbiddenException(reason);
    }

    const reason = `Compliant data residency routing verified within sovereign perimeter [${input.jurisdiction}] in region '${input.targetStorageRegion}'`;

    const auditAttestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ input, isTargetPermitted, reason }))
      .digest('hex');

    return {
      assessmentId,
      tenantId: input.tenantId,
      jurisdiction: input.jurisdiction,
      isRoutingPermitted: true,
      status: 'COMPLIANT',
      reason,
      auditAttestationDigest,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
