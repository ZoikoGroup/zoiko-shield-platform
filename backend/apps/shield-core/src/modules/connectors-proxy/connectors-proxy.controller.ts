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
  constructor(private readonly shieldIngestClient: ShieldIngestClient) { }

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

}

