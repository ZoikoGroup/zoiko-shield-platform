import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import {
  BackupIntegrityService,
  type DataStoreId,
} from './backup-integrity.service';
import { RestoreDrillService } from './restore-drill.service';
import { IsIn, IsOptional } from 'class-validator';

const DATA_STORE_KEYS: Record<DataStoreId, true> = {
  shield_core_db: true,
  merkle_ledger: true,
  timeseries_telemetry: true,
  audit_vault: true,
};

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class TriggerRestoreDrillDto {
  @IsOptional()
  @IsIn(Object.keys(DATA_STORE_KEYS))
  storeId?: DataStoreId;
}

@Controller('api/v1/observability/backup')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class BackupObservabilityController {
  constructor(
    private readonly backupIntegrityService: BackupIntegrityService,
    private readonly restoreDrillService: RestoreDrillService,
  ) {}

  @Get('status')
  @RequirePlatformPermissions('observability:read')
  public getDisasterRecoveryStatus() {
    return this.backupIntegrityService.evaluateDisasterRecoveryPosture();
  }

  @Post('drill')
  @RequirePlatformPermissions('observability:admin')
  @HttpCode(HttpStatus.OK)
  public async triggerRestoreDrill(@Body() dto: TriggerRestoreDrillDto) {
    const targetStore: DataStoreId = dto.storeId ?? 'shield_core_db';
    return await this.restoreDrillService.executeRestoreDrill(targetStore);
  }
}
