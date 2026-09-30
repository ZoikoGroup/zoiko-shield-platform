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
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  KmsHealthRebalancerService,
  type KmsProviderType,
} from './kms-health-rebalancer.service';
import { SplitKmsEscrowService } from './split-kms-escrow.service';
import {
  CustomerByokKmsProxyService,
  type ByokProviderType,
} from './customer-byok-kms-proxy.service';
import {
  ConfidentialComputingAttestationService,
  type AttestationPlatformType,
} from './confidential-computing-attestation.service';
import { MpcThresholdKeyRecoveryService } from './mpc-threshold-key-recovery.service';

export class RecordKmsProbeDto {
  @IsString()
  @IsIn(['GCP_CLOUD_KMS', 'AWS_KMS', 'AZURE_KEYVAULT'])
  provider!: 'GCP_CLOUD_KMS' | 'AWS_KMS' | 'AZURE_KEYVAULT';

  @IsNumber()
  @Min(0)
  latencyMs!: number;

  @IsOptional()
  success?: boolean;
}

export class TriggerKmsFailoverDto {
  @IsString()
  @IsIn(['GCP_CLOUD_KMS', 'AWS_KMS', 'AZURE_KEYVAULT'])
  failedProvider!: 'GCP_CLOUD_KMS' | 'AWS_KMS' | 'AZURE_KEYVAULT';

  @IsString()
  reason!: string;
}

export class ConfigureByokKeyDto {
  @IsString()
  @IsIn(['GCP_CLOUD_KMS', 'AWS_KMS', 'AZURE_KEYVAULT', 'HASHICORP_VAULT_KMIP'])
  provider!:
    'GCP_CLOUD_KMS' | 'AWS_KMS' | 'AZURE_KEYVAULT' | 'HASHICORP_VAULT_KMIP';

  @IsString()
  keyUri!: string;

  @IsString()
  keyAlias!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  rotationIntervalDays?: number;
}

export class VerifyHardwareAttestationDto {
  @IsString()
  @IsIn(['AMD_SEV_SNP', 'INTEL_TDX', 'ARM_CCA', 'VIRTUAL_TPM_2_0'])
  platformType!: 'AMD_SEV_SNP' | 'INTEL_TDX' | 'ARM_CCA' | 'VIRTUAL_TPM_2_0';

  @IsString()
  quoteOrReportHex!: string;

  @IsOptional()
  @IsString()
  expectedMeasurementDigest?: string;

  @IsString()
  nonce!: string;

  @IsString()
  hostIdentifier!: string;
}

export class MpcSplitKeyDto {
  @IsString()
  keyAlias!: string;

  @IsOptional()
  @IsString()
  secretBytesHex?: string;

  @IsOptional()
  @IsNumber()
  @Min(2)
  threshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  totalShares?: number;

  @IsOptional()
  @IsArray()
  custodianIds?: string[];
}

export class MpcShareSubmissionDto {
  @IsNumber()
  shareIndex!: number;

  @IsString()
  shareDataHex!: string;

  @IsString()
  custodianId!: string;
}

export class MpcRecoverKeyDto {
  @IsString()
  splitId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MpcShareSubmissionDto)
  submittedShares!: MpcShareSubmissionDto[];
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/crypto-escrow')
export class CryptoEscrowController {
  constructor(
    private readonly kmsHealthService: KmsHealthRebalancerService,
    private readonly splitEscrowService: SplitKmsEscrowService,
    private readonly byokProxyService: CustomerByokKmsProxyService,
    private readonly attestationService: ConfidentialComputingAttestationService,
    private readonly mpcRecoveryService: MpcThresholdKeyRecoveryService,
  ) {}

  /**
   * GET /api/v1/crypto-escrow/kms-health
   * Retrieve active Cloud KMS primary provider, routing weights, and health status.
   */
  @Get('kms-health')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getKmsHealth() {
    const primary = this.kmsHealthService.getPrimaryProvider();
    const weights = this.kmsHealthService.getRoutingWeights();
    const gcpHealth = this.kmsHealthService.getProviderHealth('GCP_CLOUD_KMS');
    const awsHealth = this.kmsHealthService.getProviderHealth('AWS_KMS');

    return {
      statusCode: HttpStatus.OK,
      data: {
        primaryProvider: primary,
        routingWeights: weights,
        providers: {
          GCP_CLOUD_KMS: gcpHealth,
          AWS_KMS: awsHealth,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * POST /api/v1/crypto-escrow/kms-health/probe
   * Record a synthetic KMS heartbeat probe result.
   */
  @Post('kms-health/probe')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  recordProbe(@Body() dto: RecordKmsProbeDto) {
    const updatedHealth = this.kmsHealthService.recordProbe(
      dto.provider as KmsProviderType,
      dto.success !== false,
      dto.latencyMs,
    );

    return {
      statusCode: HttpStatus.OK,
      data: updatedHealth,
    };
  }

  /**
   * POST /api/v1/crypto-escrow/kms-health/failover
   * Trigger manual or automated failover from a degraded KMS provider.
   */
  @Post('kms-health/failover')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  triggerFailover(@Body() dto: TriggerKmsFailoverDto) {
    const result = this.kmsHealthService.triggerFailover(
      dto.failedProvider as KmsProviderType,
      dto.reason,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  // --------------------------------------------------------------------------
  // Phase 2.1: BYOK / HYOK KMS Proxy (Topology T4)
  // --------------------------------------------------------------------------

  /**
   * POST /api/v1/crypto-escrow/byok/configure
   * Configure Customer Managed Key (BYOK/HYOK) Cloud KMS proxy.
   */
  @Post('byok/configure')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async configureByok(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: ConfigureByokKeyDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const config = await this.byokProxyService.configureByokKey(
      tenantId,
      dto.provider,
      dto.keyUri,
      dto.keyAlias,
      dto.rotationIntervalDays,
    );

    return {
      statusCode: HttpStatus.OK,
      data: config,
    };
  }

  /**
   * GET /api/v1/crypto-escrow/byok/status
   * Get active BYOK / HYOK key custody configuration.
   */
  @Get('byok/status')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getByokStatus(@Headers('x-tenant-id') tenantIdHeader: string) {
    const tenantId = requireTenantId(tenantIdHeader);
    const config = await this.byokProxyService.getByokConfiguration(tenantId);

    return {
      statusCode: HttpStatus.OK,
      data: config,
    };
  }

  /**
   * POST /api/v1/crypto-escrow/byok/probe
   * Test latency and signature delegation with customer external KMS proxy.
   */
  @Post('byok/probe')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async probeByok(@Headers('x-tenant-id') tenantIdHeader: string) {
    const tenantId = requireTenantId(tenantIdHeader);
    const probe = await this.byokProxyService.probeCustomerKey(tenantId);

    return {
      statusCode: HttpStatus.OK,
      data: probe,
    };
  }

  // --------------------------------------------------------------------------
  // Phase 2.2: Confidential Computing Hardware Attestation
  // --------------------------------------------------------------------------

  /**
   * POST /api/v1/crypto-escrow/attestation/verify
   * Verify hardware quote and measured launch digest.
   */
  @Post('attestation/verify')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async verifyHardwareAttestation(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: VerifyHardwareAttestationDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const report = await this.attestationService.verifyAttestation({
      tenantId,
      platformType: dto.platformType,
      quoteOrReportHex: dto.quoteOrReportHex,
      expectedMeasurementDigest: dto.expectedMeasurementDigest || '',
      nonce: dto.nonce,
      hostIdentifier: dto.hostIdentifier,
    });

    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * GET /api/v1/crypto-escrow/attestation/posture
   * Get tenant confidential computing platform posture.
   */
  @Get('attestation/posture')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getAttestationPosture(@Headers('x-tenant-id') tenantIdHeader: string) {
    const tenantId = requireTenantId(tenantIdHeader);
    const posture =
      await this.attestationService.getTenantAttestationPosture(tenantId);

    return {
      statusCode: HttpStatus.OK,
      data: posture,
    };
  }

  // --------------------------------------------------------------------------
  // Phase 2.3: MPC Threshold Key Recovery
  // --------------------------------------------------------------------------

  /**
   * POST /api/v1/crypto-escrow/mpc/split
   * Split sovereign tenant recovery key into (k, n) MPC custodian shares.
   */
  @Post('mpc/split')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async splitMpcKey(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: MpcSplitKeyDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const split = await this.mpcRecoveryService.splitKey(
      tenantId,
      dto.keyAlias,
      dto.secretBytesHex || '',
      dto.threshold ?? 3,
      dto.totalShares ?? 5,
      dto.custodianIds,
    );

    return {
      statusCode: HttpStatus.OK,
      data: split,
    };
  }

  /**
   * POST /api/v1/crypto-escrow/mpc/recover
   * Reconstruct master key from threshold quorum of custodian shares.
   */
  @Post('mpc/recover')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async recoverMpcKey(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: MpcRecoverKeyDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const recovery = await this.mpcRecoveryService.recoverKey(
      tenantId,
      dto.splitId,
      dto.submittedShares,
    );

    return {
      statusCode: HttpStatus.OK,
      data: recovery,
    };
  }
}
