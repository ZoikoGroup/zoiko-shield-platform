import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ControlTestingService, CreateControlObjectiveDto } from './control-testing.service';

@Controller('api/v1/controls')
export class ControlTestingController {
  constructor(private readonly controlService: ControlTestingService) {}

  /**
   * POST /api/v1/controls/objectives
   * Create or seed control objective
   */
  @Post('objectives')
  async createControlObjective(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateControlObjectiveDto,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = headerTenantId || 'default-tenant';
    }
    const objective = await this.controlService.createControlObjective(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Control objective created successfully',
      data: objective,
    };
  }

  /**
   * GET /api/v1/controls/objectives
   * List control objectives for tenant
   */
  @Get('objectives')
  async getControlObjectives(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const objectives = await this.controlService.getControlObjectives(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: objectives,
    };
  }

  /**
   * POST /api/v1/controls/objectives/:id/evaluate
   * Run automated control test evaluation
   */
  @Post('objectives/:id/evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluateControlObjective(@Param('id') id: string) {
    const testRun = await this.controlService.evaluateControlObjective(id);
    return {
      statusCode: HttpStatus.OK,
      message: `Control test evaluated with result: ${testRun.result}`,
      data: testRun,
    };
  }

  /**
   * GET /api/v1/controls/results
   * Query continuous control test execution results
   */
  @Get('results')
  async getControlResults(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const results = await this.controlService.getControlResults(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: results,
    };
  }
}
