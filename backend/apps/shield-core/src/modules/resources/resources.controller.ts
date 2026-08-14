import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import {
  CreateResourceDefinitionDto,
  ProtectedResourceDefinitionService,
} from './protected-resource-definition.service';
import {
  RecordObservationDto,
  ResourceObservationService,
} from './resource-observation.service';
import { requireTenantId } from '../../tenant-context';

/** Admin-curated: humans define and approve resource identity/dedup rules. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(
  PERMISSION_CODES.PLATFORM_RESOURCE_DEFINITION_MANAGE,
)
@Controller('api/v1/resources/definitions')
export class ResourceDefinitionController {
  constructor(
    private readonly definitionService: ProtectedResourceDefinitionService,
  ) {}

  @Post()
  async create(@Body() dto: CreateResourceDefinitionDto) {
    const definition = await this.definitionService.createDefinition(dto);
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

/**
 * Observations are written by the connector ingestion pipeline
 * (shield-ingest / shield-ai), not an interactive user session — guarded
 * with the same workload-identity InternalAuthGuard already used for other
 * service-to-service endpoints in this app.
 */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/resources/observations')
export class ResourceObservationController {
  constructor(
    private readonly observationService: ResourceObservationService,
  ) {}

  @Post()
  async record(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: RecordObservationDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const result = await this.observationService.recordObservation({
      ...dto,
      tenantId,
    });
    return { statusCode: HttpStatus.CREATED, data: result };
  }

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const observations = await this.observationService.listByTenant(tenantId);
    return { statusCode: HttpStatus.OK, data: observations };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const observation = await this.observationService.getObservationById(
      requireTenantId(headerTenantId),
      id,
    );
    return { statusCode: HttpStatus.OK, data: observation };
  }

  @Patch(':id/coverage-state')
  async updateCoverageState(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
    @Body('targetState') targetState: string,
    @Body('exclusionReason') exclusionReason?: string,
  ) {
    const observation = await this.observationService.updateCoverageState(
      requireTenantId(headerTenantId),
      id,
      targetState,
      exclusionReason,
    );
    return { statusCode: HttpStatus.OK, data: observation };
  }
}
