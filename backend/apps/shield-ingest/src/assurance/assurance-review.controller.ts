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
  AssuranceReviewService,
  CreateAssuranceReviewDto,
  CreateVCISOReflectionDto,
} from './assurance-review.service';

@Controller('api/v1/assurance')
export class AssuranceReviewController {
  constructor(private readonly assuranceService: AssuranceReviewService) {}

  /**
   * POST /api/v1/assurance/reviews
   * Generate an assurance review
   */
  @Post('reviews')
  async createAssuranceReview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateAssuranceReviewDto,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = headerTenantId || 'default-tenant';
    }
    const review = await this.assuranceService.createAssuranceReview(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Assurance review generated successfully',
      data: review,
    };
  }

  /**
   * GET /api/v1/assurance/reviews
   * List assurance reviews for tenant
   */
  @Get('reviews')
  async getAssuranceReviews(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const reviews = await this.assuranceService.getAssuranceReviews(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: reviews,
    };
  }

  /**
   * GET /api/v1/assurance/posture
   * Get real-time executive compliance posture summary
   */
  @Get('posture')
  async getAssurancePostureSummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const summary = await this.assuranceService.getAssurancePostureSummary(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * POST /api/v1/assurance/reflections
   * Create a vCISO strategic advisory reflection
   */
  @Post('reflections')
  async createVCISOReflection(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateVCISOReflectionDto,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = headerTenantId || 'default-tenant';
    }
    const reflection = await this.assuranceService.createVCISOReflection(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'vCISO strategic reflection recorded successfully',
      data: reflection,
    };
  }

  /**
   * GET /api/v1/assurance/reflections
   * Query vCISO strategic reflections
   */
  @Get('reflections')
  async getVCISOReflections(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('assuranceReviewId') reviewId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const reflections = await this.assuranceService.getVCISOReflections(tenantId, reviewId);
    return {
      statusCode: HttpStatus.OK,
      data: reflections,
    };
  }
}
