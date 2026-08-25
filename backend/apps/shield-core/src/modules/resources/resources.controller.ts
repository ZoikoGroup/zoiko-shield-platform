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
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
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
  CreateResourceDefinitionDto,
  ProtectedResourceDefinitionService,
} from './protected-resource-definition.service';
import {
  AcceptResourceCoverageDto,
  CancelEnrollmentNoticeDto,
  CreateCoveragePolicyDto,
  DecideCoveragePolicyDto,
  DeliverEnrollmentNoticeDto,
  ExcludeResourceDto,
  ProcessAutoEnrollmentDto,
  ResourceCoverageService,
} from './resource-coverage.service';
import {
  CreateResourceCountPreviewDto,
  ResourceCountingService,
} from './resource-counting.service';
import {
  RecordObservationDto,
  ResourceObservationService,
} from './resource-observation.service';

/** Platform-controlled resource taxonomy and counting safeguards. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(
  PERMISSION_CODES.PLATFORM_RESOURCE_DEFINITION_MANAGE,
)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/resources/definitions')
export class ResourceDefinitionController {
  constructor(
    private readonly definitionService: ProtectedResourceDefinitionService,
  ) {}

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
    @Body() dto: CreateResourceDefinitionDto,
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

/** Connector ingestion can discover and re-observe; it cannot accept scope. */
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
}

/** Notification/worker callbacks use workload identity, never customer JWTs. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/resources/auto-enrollment')
export class ResourceAutoEnrollmentController {
  constructor(private readonly coverage: ResourceCoverageService) {}

  @Get('notices/pending')
  async pending(@Headers('x-tenant-id') headerTenantId: string) {
    const notices = await this.coverage.listPendingNoticeDeliveries(
      requireTenantId(headerTenantId),
    );
    return { statusCode: HttpStatus.OK, data: notices };
  }

  @Patch('notices/:id/delivered')
  async delivered(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
    @Body() dto: DeliverEnrollmentNoticeDto,
  ) {
    const notice = await this.coverage.markNoticeDelivered(
      requireTenantId(headerTenantId),
      id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: notice };
  }

  @Post('process')
  async process(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: ProcessAutoEnrollmentDto,
  ) {
    const results = await this.coverage.processAutoEnrollments(
      dto.asOf ? new Date(dto.asOf) : new Date(),
      requireTenantId(headerTenantId),
    );
    return { statusCode: HttpStatus.OK, data: results };
  }
}

/** Customer-visible review, policy authority, notices and count previews. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/resources')
export class TenantResourceCoverageController {
  constructor(
    private readonly observations: ResourceObservationService,
    private readonly coverage: ResourceCoverageService,
    private readonly counting: ResourceCountingService,
  ) {}

  private boundary(headerTenantId: string, user: AuthenticatedUser) {
    return {
      tenantId: requireTenantId(headerTenantId),
      environmentId: requireEnvironmentId(user.environmentId),
    };
  }

  @Get('observations')
  async listObservations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const observations = await this.observations.listByTenant(
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: observations };
  }

  @Get('observations/:id')
  async getObservation(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const observation = await this.observations.getObservationById(
      boundary.tenantId,
      boundary.environmentId,
      id,
    );
    return { statusCode: HttpStatus.OK, data: observation };
  }

  @Get('observations/:id/decisions')
  async decisionHistory(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const history = await this.coverage.getDecisionHistory(
      boundary.tenantId,
      boundary.environmentId,
      id,
    );
    return { statusCode: HttpStatus.OK, data: history };
  }

  @Post('observations/:id/accept')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async accept(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AcceptResourceCoverageDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const observation = await this.coverage.acceptResource(
      boundary.tenantId,
      boundary.environmentId,
      id,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: observation };
  }

  @Post('observations/:id/exclude')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async exclude(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExcludeResourceDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const observation = await this.coverage.excludeResource(
      boundary.tenantId,
      boundary.environmentId,
      id,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: observation };
  }

  @Get('coverage-policies')
  async listPolicies(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const policies = await this.coverage.listPolicies(
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: policies };
  }

  @Get('coverage-policies/:id')
  async getPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const policy = await this.coverage.getPolicyForTenant(
      id,
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: policy };
  }

  @Post('coverage-policies')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoveragePolicyDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const policy = await this.coverage.createPolicy(
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: policy };
  }

  @Patch('coverage-policies/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decidePolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideCoveragePolicyDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const policy = await this.coverage.decidePolicy(
      id,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: policy };
  }

  @Get('auto-enrollment/notices')
  async listNotices(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const notices = await this.coverage.listNotices(
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: notices };
  }

  @Post('auto-enrollment/notices/:id/cancel')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async cancelNotice(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelEnrollmentNoticeDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const notice = await this.coverage.cancelNotice(
      boundary.tenantId,
      boundary.environmentId,
      id,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: notice };
  }

  @Get('count-previews')
  async listPreviews(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const previews = await this.counting.listPreviews(
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: previews };
  }

  @Get('count-previews/:id')
  async getPreview(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const preview = await this.counting.getPreview(
      id,
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: preview };
  }

  @Post('count-previews')
  async createPreview(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResourceCountPreviewDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const preview = await this.counting.createPreview(
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: preview };
  }

  @Patch('count-previews/:id/finalize')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async finalizePreview(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const preview = await this.counting.finalizePreview(
      id,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: preview };
  }
}
