import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ControlObjectiveService } from './objectives/control-objective.service';
import { ControlImplementationService } from './implementations/control-implementation.service';
import { ControlScopeService } from './scopes/control-scope.service';

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
    return this.controlImplementationService.list(tenantId ?? 'default-tenant');
  }

  @Post('control-implementations')
  async createImplementation(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body()
    body: { controlObjectiveId: string; environmentId?: string; title: string; description: string; ownerId: string; implementationType: string },
  ) {
    return this.controlImplementationService.create({
      tenantId: tenantId ?? 'default-tenant',
      requestedBy: actorId ?? 'unknown-actor',
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
    @Headers('x-actor-id') actorId: string,
    @Param('id') id: string,
    @Body() body: { status: string; notApplicableRationale?: string },
  ) {
    return this.controlImplementationService.transition({
      tenantId: tenantId ?? 'default-tenant',
      actorId: actorId ?? 'unknown-actor',
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
      tenantId: tenantId ?? 'default-tenant',
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
