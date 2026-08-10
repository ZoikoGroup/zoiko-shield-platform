import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import {
  DetectionEngineService,
  CreateDetectionRuleDto,
  UpdateDetectionRuleDto,
} from './detection-engine.service';

export class TestRuleRequestDto {
  sampleEvent!: Record<string, any>;
}

export class ReplayDetectionsRequestDto {
  tenantId?: string;
  ruleId?: string;
}

@Controller('api/v1/detections')
export class DetectionEngineController {
  constructor(private readonly detectionService: DetectionEngineService) {}

  /**
   * POST /api/v1/detections
   * Create a new detection rule
   */
  @Post()
  async createRule(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateDetectionRuleDto,
  ) {
    const tenantId = headerTenantId || dto.tenantId;
    const rule = await this.detectionService.createRule({
      ...dto,
      tenantId,
    });
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Detection rule created successfully',
      data: rule,
    };
  }

  /**
   * GET /api/v1/detections
   * Query detection rules for tenant
   */
  @Get()
  async getRules(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || undefined;
    const rules = await this.detectionService.getRules(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: rules,
    };
  }

  /**
   * GET /api/v1/detections/:detectionId
   * Get single detection rule details
   */
  @Get(':detectionId')
  async getRuleById(@Param('detectionId') detectionId: string) {
    const rule = await this.detectionService.getRuleById(detectionId);
    return {
      statusCode: HttpStatus.OK,
      data: rule,
    };
  }

  /**
   * PATCH /api/v1/detections/:detectionId
   * Update detection rule properties
   */
  @Patch(':detectionId')
  async updateRule(
    @Param('detectionId') detectionId: string,
    @Body() dto: UpdateDetectionRuleDto,
  ) {
    const rule = await this.detectionService.updateRule(detectionId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detection rule updated',
      data: rule,
    };
  }

  /**
   * POST /api/v1/detections/:detectionId/test
   * Test detection rule against sample event payload
   */
  @Post(':detectionId/test')
  async testRule(
    @Param('detectionId') detectionId: string,
    @Body() dto: TestRuleRequestDto,
  ) {
    const result = await this.detectionService.testRule(
      detectionId,
      dto.sampleEvent,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * POST /api/v1/detections/:detectionId/activate
   * Activate detection rule
   */
  @Post(':detectionId/activate')
  async activateRule(@Param('detectionId') detectionId: string) {
    const rule = await this.detectionService.activateRule(detectionId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detection rule activated',
      data: rule,
    };
  }

  /**
   * POST /api/v1/detections/:detectionId/disable
   * Disable detection rule
   */
  @Post(':detectionId/disable')
  async disableRule(@Param('detectionId') detectionId: string) {
    const rule = await this.detectionService.disableRule(detectionId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detection rule disabled',
      data: rule,
    };
  }

  /**
   * POST /api/v1/detections/:detectionId/replay
   * Replay detection rule over historical normalized events
   */
  @Post(':detectionId/replay')
  async replayRule(
    @Param('detectionId') detectionId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() body: ReplayDetectionsRequestDto,
  ) {
    const tenantId = headerTenantId || body.tenantId || 'default-tenant';
    const result = await this.detectionService.replayDetections(
      tenantId,
      detectionId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Detection replay completed',
      data: result,
    };
  }
}
