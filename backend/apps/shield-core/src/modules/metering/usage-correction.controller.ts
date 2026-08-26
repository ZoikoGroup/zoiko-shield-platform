import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';
import {
  PostUsageCorrectionDto,
  SubmitUsageDisputeDto,
  UsageCorrectionService,
} from './usage-correction.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/usage-corrections')
export class UsageCorrectionController {
  constructor(
    private readonly usageCorrectionService: UsageCorrectionService,
  ) {}

  /**
   * GET /api/v1/commercial/usage-corrections/disputes
   * List usage disputes and posted corrections.
   */
  @Get('disputes')
  async listDisputes(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.usageCorrectionService.listDisputes(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * POST /api/v1/commercial/usage-corrections/disputes
   * Submit a new meter usage dispute.
   */
  @Post('disputes')
  async submitDispute(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: SubmitUsageDisputeDto,
    @Headers('x-actor-id') actorId = 'customer-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.usageCorrectionService.submitDispute(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Usage dispute submitted successfully',
      data,
    };
  }

  /**
   * POST /api/v1/commercial/usage-corrections/apply
   * Post an append-only usage correction (reversal, replacement, adjustment).
   */
  @Post('apply')
  async postCorrection(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: PostUsageCorrectionDto,
    @Headers('x-actor-id') actorId = 'finance-admin',
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const data = await this.usageCorrectionService.postCorrection(
      tenantId,
      dto,
      actorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Usage correction posted successfully',
      data,
    };
  }
}
