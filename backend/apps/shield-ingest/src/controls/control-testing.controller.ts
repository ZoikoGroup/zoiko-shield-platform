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
import {
  ControlTestingService,
  CreateControlObjectiveDto,
} from './control-testing.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1')
export class ControlTestingController {
  constructor(private readonly controlService: ControlTestingService) {}

  /**
   * POST /api/v1/controls & /api/v1/controls/objectives
   */
  @Post(['controls', 'controls/objectives'])
  async createControlObjective(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateControlObjectiveDto,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = requireTenantId(headerTenantId);
    }
    const objective = await this.controlService.createControlObjective(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Control objective created successfully',
      data: objective,
    };
  }

  /**
   * GET /api/v1/controls & /api/v1/controls/objectives
   */
  @Get(['controls', 'controls/objectives'])
  async getControlObjectives(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const objectives = await this.controlService.getControlObjectives(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: objectives,
    };
  }

  /**
   * POST /api/v1/control-tests/:testId/evaluate & /api/v1/controls/objectives/:id/evaluate
   */
  @Post([
    'control-tests/:testId/evaluate',
    'controls/objectives/:testId/evaluate',
  ])
  @HttpCode(HttpStatus.OK)
  async evaluateControlObjective(
    @Headers('x-tenant-id') tenantId: string,
    @Param('testId') testId: string,
  ) {
    const testRun = await this.controlService.evaluateControlObjective(
      tenantId,
      testId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: `Control test evaluated with result: ${testRun.result}`,
      data: testRun,
    };
  }

  /**
   * GET /api/v1/control-evaluations & /api/v1/controls/results
   */
  @Get(['control-evaluations', 'controls/results'])
  async getControlResults(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const results = await this.controlService.getControlResults(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: results,
    };
  }

  @Get('control-evaluations/:evaluationId')
  async getControlEvaluationById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    const evaluation = await this.controlService.getControlResult(
      tenantId,
      evaluationId,
    );
    return { statusCode: HttpStatus.OK, data: evaluation };
  }
}
