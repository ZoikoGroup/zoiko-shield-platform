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
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  ActivateProfessionalServiceDto,
  CreateProfessionalServiceEngagementDto,
  DecideProfessionalServiceAcceptanceDto,
  DecideProfessionalServiceProfileDto,
  LogProfessionalServiceActivityDto,
  ProfessionalServiceService,
  RequestProfessionalServiceOverageDto,
  SubmitProfessionalServiceDeliverableDto,
} from './professional-service.service';

function boundary(headerTenantId: string, user: AuthenticatedUser) {
  return {
    tenantId: requireTenantId(headerTenantId),
    environmentId: requireEnvironmentId(user.environmentId),
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_READ)
@Controller('api/v1/professional-services/engagements')
export class ProfessionalServiceController {
  constructor(private readonly engagements: ProfessionalServiceService) {}

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('serviceType') serviceType?: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.engagements.list(
        scope.tenantId,
        scope.environmentId,
        serviceType,
      ),
    };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.engagements.get(id, scope.tenantId, scope.environmentId),
    };
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfessionalServiceEngagementDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.engagements.create(
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch(':id/profile-decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideProfile(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideProfessionalServiceProfileDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.engagements.decideProfile(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async activate(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ActivateProfessionalServiceDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.engagements.activate(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/activities')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_MANAGE)
  async logActivity(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LogProfessionalServiceActivityDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.engagements.logActivity(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/overage-approvals')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestOverage(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestProfessionalServiceOverageDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.engagements.requestOverage(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/deliverables')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_MANAGE)
  async submitDeliverable(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitProfessionalServiceDeliverableDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.engagements.submitDeliverable(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/acceptance-decisions')
  @RequirePermissions(PERMISSION_CODES.TENANT_PROFESSIONAL_SERVICE_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideAcceptance(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideProfessionalServiceAcceptanceDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.engagements.decideAcceptance(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }
}
