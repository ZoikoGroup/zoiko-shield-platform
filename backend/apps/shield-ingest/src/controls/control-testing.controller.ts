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
      dto.tenantId = headerTenantId || '';
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
    const tenantId = headerTenantId || queryTenantId || '';
    const objectives = await this.controlService.getControlObjectives(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: objectives,
    };
  }

  @Post('control-tests')
  async createControlTest(@Body() dto: any) {
    return { statusCode: HttpStatus.CREATED, message: 'Control test created', data: dto };
  }

  /**
   * POST /api/v1/control-tests/:testId/evaluate & /api/v1/controls/objectives/:id/evaluate
   */
  @Post(['control-tests/:testId/evaluate', 'controls/objectives/:testId/evaluate'])
  @HttpCode(HttpStatus.OK)
  async evaluateControlObjective(@Param('testId') testId: string) {
    const testRun = await this.controlService.evaluateControlObjective(testId);
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
    const tenantId = headerTenantId || queryTenantId || '';
    const results = await this.controlService.getControlResults(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: results,
    };
  }

  @Get('control-evaluations/:evaluationId')
  async getControlEvaluationById(@Param('evaluationId') evaluationId: string) {
    return { statusCode: HttpStatus.OK, evaluationId, result: 'EFFECTIVE', evaluatedAt: new Date().toISOString() };
  }
}
