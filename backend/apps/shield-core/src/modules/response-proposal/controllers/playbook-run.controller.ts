import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { PERMISSION_CODES } from '../../authorization/constants';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { requireTenantId } from '../../../tenant-context';
import { PlaybookRunService } from '../services/playbook-run.service';

/** W18 — Playbook run view. Read-only: see PlaybookRunService for why. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/playbooks')
export class PlaybookRunController {
  constructor(private readonly playbookRunService: PlaybookRunService) {}

  @Get('runs')
  async list(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    return this.playbookRunService.listForTenant(tenantId);
  }

  @Get('runs/:runId')
  async getById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('runId') runId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    return this.playbookRunService.getById(tenantId, runId);
  }
}
