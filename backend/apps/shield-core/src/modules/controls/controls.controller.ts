import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ControlObjectiveService } from './objectives/control-objective.service';
import { ControlImplementationService } from './implementations/control-implementation.service';
import { ControlScopeService } from './scopes/control-scope.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class ControlsController {
  constructor(
    private readonly controlObjectiveService: ControlObjectiveService,
    private readonly controlImplementationService: ControlImplementationService,
    private readonly controlScopeService: ControlScopeService,
  ) {}

  @Get('controls')
  async listControls() {
    return this.controlObjectiveService.list();
  }

  @Get('controls/:controlId')
  async getControl(@Param('controlId') controlId: string) {
    return this.controlObjectiveService.getById(controlId);
  }

  @Get('control-implementations')
  async listImplementations(@Headers('x-tenant-id') tenantId: string) {
    return this.controlImplementationService.list(requireTenantId(tenantId));
  }

  @Post('control-implementations')
  async createImplementation(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { controlObjectiveId: string; environmentId?: string; title: string; description: string; ownerId: string; implementationType: string },
  ) {
    return this.controlImplementationService.create({
      tenantId: requireTenantId(tenantId),
      requestedBy: user.id,
      controlObjectiveId: body.controlObjectiveId,
      environmentId: body.environmentId,
      title: body.title,
      description: body.description,
      ownerId: body.ownerId,
      implementationType: body.implementationType,
    });
  }

  @Patch('control-implementations/:id')
  async updateImplementation(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status: string; notApplicableRationale?: string },
  ) {
    return this.controlImplementationService.transition({
      tenantId: requireTenantId(tenantId),
      actorId: user.id,
      controlImplementationId: id,
      toStatus: body.status,
      notApplicableRationale: body.notApplicableRationale,
    });
  }

  @Post('control-implementations/:id/scopes')
  async addScope(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() body: { legalEntityId?: string; environmentId?: string; businessUnitId?: string; assetScope?: string; identityScope?: string; expiresAt?: string },
  ) {
    return this.controlScopeService.create({
      tenantId: requireTenantId(tenantId),
      controlImplementationId: id,
      legalEntityId: body.legalEntityId,
      environmentId: body.environmentId,
      businessUnitId: body.businessUnitId,
      assetScope: body.assetScope,
      identityScope: body.identityScope,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }
}
