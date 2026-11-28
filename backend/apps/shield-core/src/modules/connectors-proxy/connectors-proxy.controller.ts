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
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
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

  /**
   * Webhook signing secret. Status never contains the secret; reveal returns
   * it once; rotate issues a new one. Both of the latter mutate a credential,
   * so they need write access on tenant resources, not just membership.
   */
  @Get('connectors/:id/webhook-secret')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getWebhookSecretStatus(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getWebhookSecretStatus(tenantId, id);
  }

  @Post('connectors/:id/webhook-secret/reveal')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async revealWebhookSecret(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.revealWebhookSecret(tenantId, id);
  }

  @Post('connectors/:id/webhook-secret/rotate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async rotateWebhookSecret(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { immediate?: boolean },
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.rotateWebhookSecret(tenantId, id, {
      immediate: body?.immediate === true,
    });
  }

  /** What a connector has received: totals and its latest deliveries. */
  @Get('connectors/:id/activity')
  async getConnectorActivity(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const n = Number(limit);
    const bounded =
      limit !== undefined && Number.isFinite(n) && n >= 1
        ? Math.min(Math.floor(n), 50)
        : undefined;
    return this.shieldIngestClient.getConnectorActivity(tenantId, id, bounded);
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

  @Post('connectors/:id/activate')
  async activateConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('idempotency-key') headerIdempotencyKey: string | undefined,
    @Headers('x-idempotency-key') xIdempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.activateConnector(
      tenantId,
      id,
      headerIdempotencyKey || xIdempotencyKey,
    );
  }

  @Post('connectors/:id/disable')
  async disableConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.disableConnector(tenantId, id);
  }

  @Post('connectors/:id/heartbeat')
  async recordConnectorHeartbeat(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body?: Record<string, unknown>,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.heartbeatConnector(tenantId, id, body);
  }

  @Post('dlq/auto-retry')
  async triggerDlqAutoRetry(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.triggerDlqAutoRetry(tenantId, limit);
  }

  @Get('dlq/metrics')
  async getDlqMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.getDlqMetrics(tenantId);
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
    const bounded =
      Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : undefined;
    return this.shieldIngestClient.listEvents(
      tenantId,
      bounded ? { limit: String(bounded) } : undefined,
    );
  }

  /**
   * How many events arrived, for the dashboard's "Total Events". The window is whole
   * hours between 1 and 2160 (90 days); anything else falls back to 24 hours.
   */
  @Get('dashboard/events')
  async getEventMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('hours') hours?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const n = Number(hours);
    const bounded =
      hours !== undefined && Number.isFinite(n) && n >= 1
        ? Math.min(Math.floor(n), 24 * 90)
        : undefined;
    return this.shieldIngestClient.getEventMetrics(tenantId, bounded);
  }

  @Get('control-evaluations')
  async listControlEvaluations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldIngestClient.listControlEvaluations(tenantId);
  }
}
