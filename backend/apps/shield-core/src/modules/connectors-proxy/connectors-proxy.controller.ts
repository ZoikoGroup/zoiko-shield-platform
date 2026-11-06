import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { requireTenantId } from '../../tenant-context';

/**
 * User-Facing Connectors Proxy Controller in shield-core.
 * Bridges authenticated browser requests (JWT) to workload-token-protected shield-ingest.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class ConnectorsProxyController {
  constructor(private readonly shieldIngestClient: ShieldIngestClient) {}

  @Get('connector-types')
  async getConnectorTypes() {
    return this.shieldIngestClient.getConnectorTypes();
  }

  @Get('connectors')
  async listConnectors(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listConnectors(tenantId);
  }

  @Post('connectors')
  @HttpCode(HttpStatus.CREATED)
  async createConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.createConnector(tenantId, dto);
  }

  @Get('connectors/:id')
  async getConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getConnector(tenantId, id);
  }

  @Patch('connectors/:id')
  async updateConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.updateConnector(tenantId, id, dto);
  }

  @Delete('connectors/:id')
  async deleteConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.deleteConnector(tenantId, id);
  }

  @Post('connectors/:id/test')
  async testConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.testConnector(tenantId, id);
  }

  @Post('connectors/:id/sync')
  async syncConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.syncConnector(tenantId, id);
  }

  @Get('connectors/:id/health')
  async getConnectorHealth(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getConnectorHealth(tenantId, id);
  }

  /**
   * Normalized events and control evaluations live in shield-ingest, which
   * accepts only workload tokens. The browser reaches them through here.
   */
  @Get('events')
  async listEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const n = Number(limit);
    const bounded = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : undefined;
    return this.shieldIngestClient.listEvents(
      tenantId,
      bounded ? { limit: String(bounded) } : undefined,
    );
  }

  @Get('events/:eventId')
  async getEventById(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getEventById(tenantId, eventId);
  }

  @Get('dlq/metrics')
  async getDlqMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getDlqMetrics(tenantId);
  }

  @Get('quarantine')
  async listQuarantinedEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listQuarantinedEvents(
      tenantId,
      limit ? { limit } : undefined,
    );
  }

  @Post('quarantine/:eventId/reprocess')
  async reprocessQuarantinedEvent(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.reprocessQuarantinedEvent(tenantId, eventId);
  }

  @Post('dlq/auto-retry')
  async triggerDlqAutoRetry(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.triggerDlqAutoRetry(
      tenantId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('control-evaluations')
  async listControlEvaluations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listControlEvaluations(tenantId);
  }

  // Note: GET/POST api/v1/controls is NOT proxied here — it already exists
  // natively in core's ControlsController (global control catalog), and
  // ingest's ControlTestingController defines a different, tenant-scoped
  // "control objective" concept under the same path name. Proxying it would
  // silently shadow or collide with core's route. control-tests/:id/evaluate
  // does not collide and exposes the read side already proxied above.
  @Post('control-tests/:controlId/evaluate')
  async evaluateControl(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('controlId') controlId: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.evaluateControl(tenantId, controlId, dto);
  }

  @Get('assurance/posture')
  async getAssurancePosture(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getAssurancePosture(tenantId);
  }

  @Get('assurance/reviews')
  async listAssuranceReviews(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listAssuranceReviews(tenantId);
  }

  @Post('assurance/reviews')
  @HttpCode(HttpStatus.CREATED)
  async createAssuranceReview(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.createAssuranceReview(tenantId, dto);
  }

  @Get('assurance/reflections')
  async listAssuranceReflections(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('assuranceReviewId') assuranceReviewId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listAssuranceReflections(
      tenantId,
      assuranceReviewId,
    );
  }

  @Post('assurance/reflections')
  @HttpCode(HttpStatus.CREATED)
  async createAssuranceReflection(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.createAssuranceReflection(tenantId, dto);
  }

  @Post('sla/claims/evaluate')
  async evaluateSlaClaim(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.evaluateSlaClaim(tenantId, dto);
  }

  @Get('sla/claims/evaluations')
  async listSlaClaimEvaluations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('claimKey') claimKey?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listSlaClaimEvaluations(tenantId, claimKey);
  }

  @Get('sla/performance')
  async getSlaPerformance(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getSlaPerformance(tenantId);
  }

  @Get('metering/usage')
  async getMeteringUsage(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getMeteringUsage(tenantId);
  }

  @Get('metering/resources')
  async getMeteringResources(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getMeteringResources(tenantId);
  }
}
