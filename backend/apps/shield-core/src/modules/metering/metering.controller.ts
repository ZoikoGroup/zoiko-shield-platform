import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import {
  CreateMeterDefinitionDto,
  MeterDefinitionService,
} from './meter-definition.service';
import { MeteringService, RecordMeterEventDto } from './metering.service';
import { requireTenantId } from '../../tenant-context';

/** Admin-curated: humans define and approve meters before any event can be classified against them. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_METER_DEFINITION_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/metering/definitions')
export class MeterDefinitionController {
  constructor(private readonly definitionService: MeterDefinitionService) {}

  @Get()
  async list() {
    const definitions = await this.definitionService.listDefinitions();
    return { statusCode: HttpStatus.OK, data: definitions };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const definition = await this.definitionService.getDefinition(id);
    return { statusCode: HttpStatus.OK, data: definition };
  }

  @Post()
  async create(
    @Body() dto: CreateMeterDefinitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const definition = await this.definitionService.createDefinition(
      dto,
      user.id,
    );
    return { statusCode: HttpStatus.CREATED, data: definition };
  }

  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const definition = await this.definitionService.approveDefinition(
      id,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: definition };
  }
}

/** Events are written by the telemetry ingestion pipeline, not an interactive user session. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/metering/events')
export class MeteringController {
  constructor(private readonly meteringService: MeteringService) {}

  @Post()
  async record(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: RecordMeterEventDto,
  ) {
    const result = await this.meteringService.recordEvent({
      ...dto,
      tenantId: requireTenantId(headerTenantId, dto.tenantId),
    });
    return { statusCode: HttpStatus.CREATED, data: result };
  }
}
