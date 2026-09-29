import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../../authorization/constants';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireEnvironmentId, requireTenantId } from '../../../tenant-context';
import {
  DoraComplianceEvaluatorService,
  DoraTelemetrySnapshot,
} from './dora-compliance-evaluator.service';
import {
  Nis2ComplianceEvaluatorService,
  Nis2TelemetrySnapshot,
} from './nis2-compliance-evaluator.service';

export class EvaluateDoraPostureDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  multiCloudRecoveryRtoMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  multiCloudRecoveryRpoMinutes?: number;

  @IsOptional()
  @IsNumber()
  boundaryDefenseMfaRate?: number;

  @IsOptional()
  @IsNumber()
  ocsfDetectionPipelineLatencyMs?: number;

  @IsOptional()
  @IsBoolean()
  automatedContainmentTested?: boolean;

  @IsOptional()
  @IsNumber()
  rollbackReceiptVerificationPassRate?: number;

  @IsOptional()
  @IsNumber()
  tlptLastExerciseDaysAgo?: number;

  @IsOptional()
  @IsNumber()
  thirdPartyHhiIndex?: number;

  @IsOptional()
  @IsBoolean()
  tier1ProviderFallbackConfigured?: boolean;

  @IsOptional()
  @IsNumber()
  unreportedIncidentAgeHours?: number;
}

export class EvaluateNis2PostureDto {
  @IsOptional()
  @IsString()
  @IsIn(['ESSENTIAL_ENTITY', 'IMPORTANT_ENTITY'])
  entityType?: 'ESSENTIAL_ENTITY' | 'IMPORTANT_ENTITY';

  @IsOptional()
  @IsBoolean()
  incidentHandlingProcessDocumented?: boolean;

  @IsOptional()
  @IsNumber()
  businessContinuityTestedDaysAgo?: number;

  @IsOptional()
  @IsNumber()
  sbomAttestationCoverageRate?: number;

  @IsOptional()
  @IsBoolean()
  vulnerabilityDisclosurePolicyActive?: boolean;

  @IsOptional()
  @IsBoolean()
  effectivenessAuditPassed?: boolean;

  @IsOptional()
  @IsBoolean()
  pqcAndKmsEncryptionEnforced?: boolean;

  @IsOptional()
  @IsNumber()
  mfaEnforcementRate?: number;

  @IsOptional()
  @IsNumber()
  unreportedIncidentAgeHours?: number;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/compliance')
export class SectorComplianceController {
  constructor(
    private readonly doraEvaluator: DoraComplianceEvaluatorService,
    private readonly nis2Evaluator: Nis2ComplianceEvaluatorService,
  ) {}

  /**
   * POST /api/v1/compliance/dora/evaluate
   * Evaluate DORA EU 2022/2554 financial operational resilience posture.
   */
  @Post('dora/evaluate')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  evaluateDora(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EvaluateDoraPostureDto,
  ) {
    const tenantId = requireTenantId(headerTenantId || user.tenantId);
    const environmentId = requireEnvironmentId(
      user.environmentId || 'env-prod-01',
    );

    const report = this.doraEvaluator.evaluateDoraPosture(
      tenantId,
      environmentId,
      dto as DoraTelemetrySnapshot,
    );

    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * POST /api/v1/compliance/nis2/evaluate
   * Evaluate NIS2 EU 2022/2555 critical entity cybersecurity risk-management posture.
   */
  @Post('nis2/evaluate')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  evaluateNis2(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EvaluateNis2PostureDto,
  ) {
    const tenantId = requireTenantId(headerTenantId || user.tenantId);
    const environmentId = requireEnvironmentId(
      user.environmentId || 'env-prod-01',
    );

    const report = this.nis2Evaluator.evaluateNis2Posture(
      tenantId,
      environmentId,
      dto as Nis2TelemetrySnapshot,
    );

    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * GET /api/v1/compliance/sector-summary
   * Retrieve active tenant sector framework readiness summary (DORA + NIS2).
   */
  @Get('sector-summary')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getSectorSummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId || user.tenantId);
    const environmentId = requireEnvironmentId(
      user.environmentId || 'env-prod-01',
    );

    const dora = this.doraEvaluator.evaluateDoraPosture(
      tenantId,
      environmentId,
    );
    const nis2 = this.nis2Evaluator.evaluateNis2Posture(
      tenantId,
      environmentId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        tenantId,
        environmentId,
        frameworks: {
          DORA: {
            score: dora.overallComplianceScore,
            status:
              dora.overallComplianceScore && dora.overallComplianceScore >= 80
                ? 'COMPLIANT'
                : 'REVIEW_REQUIRED',
            totalArticles: dora.totalArticlesEvaluated,
            compliantCount: dora.compliantCount,
            gapCount: dora.gapCount,
            merkleRoot: dora.merkleEvidenceRoot,
          },
          NIS2: {
            score: nis2.overallComplianceScore,
            status:
              nis2.overallComplianceScore && nis2.overallComplianceScore >= 80
                ? 'COMPLIANT'
                : 'REVIEW_REQUIRED',
            totalControls: nis2.totalControlsEvaluated,
            compliantCount: nis2.compliantCount,
            gapCount: nis2.gapCount,
            merkleRoot: nis2.merkleEvidenceRoot,
          },
        },
        assessedAt: new Date().toISOString(),
      },
    };
  }
}
