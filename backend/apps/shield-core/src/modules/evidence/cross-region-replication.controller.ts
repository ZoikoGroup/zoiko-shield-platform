import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CrossRegionLedgerReplicatorService } from './cross-region-ledger-replicator.service';

export class ExecuteDrFailoverDrillDto {
  @IsOptional()
  @IsString()
  primaryRegion?: string;

  @IsOptional()
  @IsString()
  standbyRegion?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/evidence/cross-region')
export class CrossRegionReplicationController {
  constructor(
    private readonly replicatorService: CrossRegionLedgerReplicatorService,
  ) {}

  /**
   * GET /api/v1/evidence/cross-region/status
   * Retrieve active cross-region ledger replication stream and RPO sync state.
   */
  @Get('status')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getReplicationStatus(@Query('streamId') streamId?: string) {
    const status = this.replicatorService.getReplicationStatus(
      streamId || 'stream-eu-west1-eu-west4',
    );

    return {
      statusCode: HttpStatus.OK,
      data: status,
    };
  }

  /**
   * POST /api/v1/evidence/cross-region/failover-drill
   * Trigger an automated zero-RPO cross-region failover rehearsal drill.
   */
  @Post('failover-drill')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  executeFailoverDrill(@Body() dto: ExecuteDrFailoverDrillDto) {
    const receipt = this.replicatorService.executeFailoverDrill(
      dto.primaryRegion || 'europe-west1',
      dto.standbyRegion || 'europe-west4',
    );

    return {
      statusCode: HttpStatus.OK,
      data: receipt,
    };
  }
}
