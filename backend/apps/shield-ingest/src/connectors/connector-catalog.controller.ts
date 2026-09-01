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
  Optional,
} from '@nestjs/common';
import {
  ConnectorCatalogService,
  CreateConnectorDto,
} from './connector-catalog.service';
import { requireTenantId } from '../security/tenant-context';
import { IdempotencyService } from '../../../shield-core/src/modules/idempotency/idempotency.service';
import { ConnectorHealthService } from './services/health.service';
import { DLQReplayWorker } from '../ingestion/dlq-replay.worker';
import { DlqReplayQuarantineService } from '../dlq/dlq-replay-quarantine.service';

@Controller('api/v1')
export class ConnectorCatalogController {
  constructor(
    private readonly connectorCatalogService: ConnectorCatalogService,
    @Optional() private readonly idempotencyService?: IdempotencyService,
    @Optional() private readonly connectorHealthService?: ConnectorHealthService,
    @Optional() private readonly dlqWorker?: DLQReplayWorker,
    @Optional() private readonly dlqService?: DlqReplayQuarantineService,
  ) {}

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
   * Creates a new security tool connector instance with optional Idempotency-Key support (P1 & INT-01)
   */
  @Post('connectors')
  @HttpCode(HttpStatus.CREATED)
  async createConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('idempotency-key') headerIdempotencyKey: string | undefined,
    @Headers('x-idempotency-key') xIdempotencyKey: string | undefined,
    @Body() dto: CreateConnectorDto,
  ) {
    const tenantId = headerTenantId || dto.tenantId;
    const idempotencyKey = headerIdempotencyKey || xIdempotencyKey;

    if (idempotencyKey && this.idempotencyService) {
      const res = await this.idempotencyService.run(
        {
          key: idempotencyKey,
          operation: 'connectors.create',
          tenantId,
          requestPayload: dto,
        },
        async () => {
          const result = await this.connectorCatalogService.createConnector({
            ...dto,
            tenantId,
          });
          return {
            statusCode: HttpStatus.CREATED,
            body: {
              statusCode: HttpStatus.CREATED,
              message: 'Connector created successfully',
              data: result,
            },
          };
        },
      );
      return res.body;
    }

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
  async getConnectorById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    const result = await this.connectorCatalogService.getConnectorById(
      tenantId,
      connectorId,
    );
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
    return {
      statusCode: HttpStatus.OK,
      data: await this.connectorCatalogService.updateConnector(
        tenantId,
        connectorId,
        dto,
      ),
    };
  }

  @Delete('connectors/:connectorId')
  async deleteConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.connectorCatalogService.retireConnector(
        tenantId,
        connectorId,
      ),
    };
  }

  @Post('connectors/:connectorId/test')
  async testConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.connectorCatalogService.testConnector(
        tenantId,
        connectorId,
      ),
    };
  }

  /**
   * POST /api/v1/connectors/:connectorId/activate
   * Activate a connector with optional Idempotency-Key support (P1 & INT-01)
   */
  @Post('connectors/:connectorId/activate')
  async activateConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('idempotency-key') headerIdempotencyKey: string | undefined,
    @Headers('x-idempotency-key') xIdempotencyKey: string | undefined,
    @Param('connectorId') connectorId: string,
  ) {
    const idempotencyKey = headerIdempotencyKey || xIdempotencyKey;

    if (idempotencyKey && this.idempotencyService) {
      const res = await this.idempotencyService.run(
        {
          key: idempotencyKey,
          operation: `connectors.activate:${connectorId}`,
          tenantId,
          requestPayload: { connectorId },
        },
        async () => {
          const result = await this.connectorCatalogService.activateConnector(
            tenantId,
            connectorId,
          );
          return {
            statusCode: HttpStatus.OK,
            body: {
              statusCode: HttpStatus.OK,
              message: 'Connector activated',
              data: result,
            },
          };
        },
      );
      return res.body;
    }

    const result = await this.connectorCatalogService.activateConnector(
      tenantId,
      connectorId,
    );
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
  async disableConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    const result = await this.connectorCatalogService.disableConnector(
      tenantId,
      connectorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Connector disabled',
      data: result,
    };
  }

  /**
   * POST /api/v1/connectors/:connectorId/heartbeat
   * Register active connector heartbeat (OPS-INV-13 Specification)
   */
  @Post('connectors/:connectorId/heartbeat')
  async recordConnectorHeartbeat(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectorId') connectorId: string,
    @Body() body?: { lagMs?: number; errorRate?: number; eventsProcessed?: number; statusMessage?: string },
  ) {
    const tenantId = requireTenantId(headerTenantId);
    if (!this.connectorHealthService) {
      return { statusCode: HttpStatus.OK, message: 'Heartbeat acknowledged' };
    }
    const status = await this.connectorHealthService.recordHeartbeat(
      connectorId,
      tenantId,
      body,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Connector heartbeat recorded successfully',
      data: status,
    };
  }

  /**
   * POST /api/v1/dlq/auto-retry
   * Trigger automated DLQ auto-retry sweep for a tenant (OPS-INV-13 Specification)
   */
  @Post('dlq/auto-retry')
  async triggerDlqAutoRetry(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('limit') limitQuery?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const limit = limitQuery ? parseInt(limitQuery, 10) : 50;

    if (!this.dlqWorker) {
      return { statusCode: HttpStatus.OK, message: 'DLQ worker not configured' };
    }

    const result = await this.dlqWorker.replayQuarantineBatch(tenantId, limit);
    return {
      statusCode: HttpStatus.OK,
      message: 'Automated DLQ retry sweep executed',
      data: result,
    };
  }

  /**
   * GET /api/v1/dlq/metrics
   * Query DLQ quarantine metrics
   */
  @Get('dlq/metrics')
  async getDlqMetrics() {
    const metrics = this.dlqService
      ? this.dlqService.getMetrics()
      : { totalQuarantined: 0, activeQuarantined: 0, replayedSuccess: 0, replayedFailed: 0 };
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }

  @Post('connectors/:connectorId/sync')
  async syncConnector(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.connectorCatalogService.syncConnector(
        tenantId,
        connectorId,
      ),
    };
  }

  @Get('connectors/:connectorId/health')
  async getConnectorHealth(
    @Headers('x-tenant-id') tenantId: string,
    @Param('connectorId') connectorId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.connectorCatalogService.getConnectorHealth(
        tenantId,
        connectorId,
      ),
    };
  }
}
