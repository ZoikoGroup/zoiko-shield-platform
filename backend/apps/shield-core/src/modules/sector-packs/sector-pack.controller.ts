import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateSectorPackDto,
  DecideSectorPackDto,
  SectorPackService,
  SetMarketAvailabilityDto,
  SubmitSectorPackDto,
} from './sector-pack.service';

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/sector-packs')
export class PlatformSectorPackController {
  constructor(private readonly packService: SectorPackService) {}

  @Get()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async list() {
    return {
      statusCode: HttpStatus.OK,
      data: await this.packService.listPacks(),
    };
  }

  @Post()
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSectorPackDto,
  ) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.packService.createPack(dto, user.id),
    };
  }

  @Post(':id/submission')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitSectorPackDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.packService.submitRelease(id, user.id, dto.reason),
    };
  }

  @Patch(':id/decision')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_APPROVE,
  )
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideSectorPackDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.packService.decideRelease(id, user.id, dto),
    };
  }

  @Post(':id/availability')
  @RequirePlatformPermissions(
    PERMISSION_CODES.PLATFORM_ASSURANCE_CONTENT_MANAGE,
  )
  async setAvailability(
    @Param('id') id: string,
    @Body() dto: SetMarketAvailabilityDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.packService.setMarketAvailability(id, dto),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/sector-packs')
export class SectorPackAvailabilityController {
  constructor(private readonly packService: SectorPackService) {}

  @Get('availability')
  async checkAvailability(
    @Query('packKey') packKey: string,
    @Query('region') region: string,
  ) {
    const available = await this.packService.isAvailable(packKey, region);
    return { statusCode: HttpStatus.OK, data: { packKey, region, available } };
  }
}
