import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  ConnectorCatalogService,
  CreateConnectorDto,
} from './connector-catalog.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1')
export class ConnectorCatalogController {
  constructor(private readonly connectorCatalogService: ConnectorCatalogService) {}

  /**
   * GET /api/v1/connector-types
   * Returns list of supported tool & connector types (Step 5 spec)
   */
  @Get('connector-types')
  getConnectorTypes() {
    return {
      statusCode: HttpStatus.OK,
      data: this.connectorCatalogService.getConnectorTypes(),
    };
  }

  /**
   * POST /api/v1/connectors
   * Creates a new security tool connector instance
   */
  @Post('connectors')
  @HttpCode(HttpStatus.CREATED)
  async createConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateConnectorDto,
  ) {
    const tenantId = headerTenantId || dto.tenantId;
    const result = await this.connectorCatalogService.createConnector({
      ...dto,
      tenantId,
    });
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Connector created successfully',
      data: result,
    };
  }

  /**
   * GET /api/v1/connectors
   * List all connectors for a tenant
   */
  @Get('connectors')
  async getConnectors(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const result = await this.connectorCatalogService.getConnectors(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * GET /api/v1/connectors/:connectorId
   * Get single connector details
   */
  @Get('connectors/:connectorId')
  async getConnectorById(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.getConnectorById(tenantId, connectorId);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  @Patch('connectors/:connectorId')
  async updateConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
    @Body() dto: { name?: string; sourceRegion?: string },
  ) {
    return { statusCode: HttpStatus.OK, data: await this.connectorCatalogService.updateConnector(tenantId, connectorId, dto) };
  }

  @Delete('connectors/:connectorId')
  async deleteConnector(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    return { statusCode: HttpStatus.OK, data: await this.connectorCatalogService.retireConnector(tenantId, connectorId) };
  }

  @Post('connectors/:connectorId/test')
  async testConnector(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    return { statusCode: HttpStatus.OK, data: await this.connectorCatalogService.testConnector(tenantId, connectorId) };
  }

  /**
   * POST /api/v1/connectors/:connectorId/activate
   * Activate a connector
   */
  @Post('connectors/:connectorId/activate')
  async activateConnector(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.activateConnector(tenantId, connectorId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Connector activated',
      data: result,
    };
  }

  /**
   * POST /api/v1/connectors/:connectorId/disable
   * Disable a connector
   */
  @Post('connectors/:connectorId/disable')
  async disableConnector(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.disableConnector(tenantId, connectorId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Connector disabled',
      data: result,
    };
  }

  @Post('connectors/:connectorId/sync')
  async syncConnector(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    return { statusCode: HttpStatus.OK, data: await this.connectorCatalogService.syncConnector(tenantId, connectorId) };
  }

  @Get('connectors/:connectorId/health')
  async getConnectorHealth(@Headers('x-tenant-id') tenantId: string, @Param('connectorId') connectorId: string) {
    return { statusCode: HttpStatus.OK, data: await this.connectorCatalogService.getConnectorHealth(tenantId, connectorId) };
  }
}
