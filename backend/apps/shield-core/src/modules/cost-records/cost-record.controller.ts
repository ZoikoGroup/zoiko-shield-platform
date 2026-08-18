import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { CostRecordService, RecordCostDto } from './cost-record.service';

/** Internal economics — written by cost-tracking jobs, read by Finance/margin tooling, never customer-facing. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/internal/cost-records')
export class CostRecordController {
  constructor(private readonly costRecordService: CostRecordService) {}

  @Post()
  async record(@Body() dto: RecordCostDto) {
    const cost = await this.costRecordService.recordCost(dto);
    return { statusCode: HttpStatus.CREATED, data: cost };
  }

  @Get()
  async listByTenant(@Query('tenantId') tenantId: string) {
    const costs = await this.costRecordService.getCostsByTenant(tenantId);
    return { statusCode: HttpStatus.OK, data: costs };
  }
}
