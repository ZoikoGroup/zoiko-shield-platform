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
} from '@nestjs/common';
import {
  ConnectorCatalogService,
  CreateConnectorDto,
} from './connector-catalog.service';

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
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
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
  async getConnectorById(@Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.getConnectorById(connectorId);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * POST /api/v1/connectors/:connectorId/activate
   * Activate a connector
   */
  @Post('connectors/:connectorId/activate')
  async activateConnector(@Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.activateConnector(connectorId);
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
  async disableConnector(@Param('connectorId') connectorId: string) {
    const result = await this.connectorCatalogService.disableConnector(connectorId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Connector disabled',
      data: result,
    };
  }
}
