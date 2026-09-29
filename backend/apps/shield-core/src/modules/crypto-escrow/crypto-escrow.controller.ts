import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  KmsHealthRebalancerService,
  KmsProviderType,
} from './kms-health-rebalancer.service';
import { SplitKmsEscrowService } from './split-kms-escrow.service';

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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/crypto-escrow')
export class CryptoEscrowController {
  constructor(
    private readonly kmsHealthService: KmsHealthRebalancerService,
    private readonly splitEscrowService: SplitKmsEscrowService,
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
   * Trigger controlled KMS provider failover (requires step-up MFA).
   */
  @Post('kms-health/failover')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  triggerFailover(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerKmsFailoverDto,
  ) {
    const failoverEvent = this.kmsHealthService.triggerFailover(
      dto.failedProvider as KmsProviderType,
      `Manual operator trigger by ${user.email ?? user.id}: ${dto.reason}`,
    );

    return {
      statusCode: HttpStatus.OK,
      data: failoverEvent,
    };
  }
}

