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
  ServiceReadinessState,
} from './service-readiness.service';

export class SetOverrideDto {
  state!: ServiceReadinessState;
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
      dbConnected: dbConnected !== undefined ? dbConnected === 'true' : undefined,
      kmsConnected: kmsConnected !== undefined ? kmsConnected === 'true' : undefined,
    });
  }

  @Get(':serviceId')
  @RequirePlatformPermissions('observability:read')
  public getServiceReadiness(
    @Param('serviceId') serviceId: string,
  ) {
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
  public clearServiceOverride(
    @Param('serviceId') serviceId: string,
  ) {
    this.readinessService.clearServiceOverride(serviceId);
    return this.readinessService.getServiceReadiness(serviceId);
  }
}
