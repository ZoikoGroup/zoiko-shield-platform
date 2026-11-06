import {
  Controller,
  Get,
  Param,
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
  ServiceReadinessService,
  PlatformReadinessSnapshot,
  CoreServiceReadiness,
  type ServiceReadinessState,
} from './service-readiness.service';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Keyed by the ServiceReadinessState union so a new state there is a compile
// error here until it is added.
const READINESS_STATE_KEYS: Record<ServiceReadinessState, true> = {
  HEALTHY: true,
  AT_RISK: true,
  DEGRADED: true,
  PARTIAL_INCOMPLETE: true,
  STALE: true,
  UNKNOWN: true,
  UNAVAILABLE: true,
  UNAUTHORIZED: true,
  QUARANTINED: true,
  MAINTENANCE: true,
  RECOVERING: true,
  RECONCILIATION_REQUIRED: true,
  ERROR_BUDGET_EXHAUSTED: true,
  READINESS_CONDITIONAL: true,
  NOT_READY: true,
  WITHDRAWN: true,
};

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class SetOverrideDto {
  @IsIn(Object.keys(READINESS_STATE_KEYS))
  state!: ServiceReadinessState;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

@Controller('api/v1/observability/readiness')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class ServiceReadinessController {
  constructor(private readonly readinessService: ServiceReadinessService) {}

  @Get()
  @RequirePlatformPermissions('observability:read')
  public getPlatformReadiness(
    @Query('g1Ratified') g1Ratified?: string,
    @Query('dbConnected') dbConnected?: string,
    @Query('kmsConnected') kmsConnected?: string,
  ) {
    return this.readinessService.evaluatePlatformReadiness({
      g1Ratified: g1Ratified !== undefined ? g1Ratified === 'true' : undefined,
      dbConnected:
        dbConnected !== undefined ? dbConnected === 'true' : undefined,
      kmsConnected:
        kmsConnected !== undefined ? kmsConnected === 'true' : undefined,
    });
  }

  @Get(':serviceId')
  @RequirePlatformPermissions('observability:read')
  public getServiceReadiness(@Param('serviceId') serviceId: string) {
    return this.readinessService.getServiceReadiness(serviceId);
  }

  @Post(':serviceId/override')
  @RequirePlatformPermissions('observability:admin')
  @HttpCode(HttpStatus.OK)
  public setServiceOverride(
    @Param('serviceId') serviceId: string,
    @Body() dto: SetOverrideDto,
  ) {
    this.readinessService.setServiceOverride(serviceId, dto.state, dto.reason);
    return this.readinessService.getServiceReadiness(serviceId);
  }

  @Post(':serviceId/clear-override')
  @RequirePlatformPermissions('observability:admin')
  @HttpCode(HttpStatus.OK)
  public clearServiceOverride(@Param('serviceId') serviceId: string) {
    this.readinessService.clearServiceOverride(serviceId);
    return this.readinessService.getServiceReadiness(serviceId);
  }
}
