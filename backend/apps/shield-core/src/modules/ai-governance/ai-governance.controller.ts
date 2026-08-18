import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsPositive, IsString } from 'class-validator';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { AiUsageService, RecordAiUsageDto } from './ai-usage.service';
import { AiBudgetService, SetBudgetDto } from './ai-budget.service';
import { requireTenantId } from '../../tenant-context';

export class MarkBillableDto {
  @IsString()
  meterKey!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

/** AI usage is recorded by the AI orchestration pipeline (shield-ai), not an interactive session. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/usage')
export class AiUsageController {
  constructor(private readonly usageService: AiUsageService) {}

  @Post()
  async record(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: RecordAiUsageDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const usage = await this.usageService.recordUsage({ ...dto, tenantId });
    return { statusCode: HttpStatus.CREATED, data: usage };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const usage = await this.usageService.getUsageById(
      requireTenantId(headerTenantId),
      id,
    );
    return { statusCode: HttpStatus.OK, data: usage };
  }

  @Patch(':id/mark-billable')
  async markBillable(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
    @Body() dto: MarkBillableDto,
  ) {
    const usage = await this.usageService.markBillable(
      requireTenantId(headerTenantId),
      id,
      dto.meterKey,
      dto.quantity,
    );
    return { statusCode: HttpStatus.OK, data: usage };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/ai/budgets')
export class AiBudgetController {
  constructor(private readonly budgetService: AiBudgetService) {}

  @Post()
  async setBudget(@Body() dto: SetBudgetDto) {
    const budget = await this.budgetService.setBudget(dto);
    return { statusCode: HttpStatus.CREATED, data: budget };
  }

  @Get('over-budget')
  async isOverBudget(@Query('tenantId') tenantId: string) {
    const overBudget = await this.budgetService.isOverBudget(tenantId);
    return { statusCode: HttpStatus.OK, data: { tenantId, overBudget } };
  }
}
