import { Body, Controller, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { ActivateWorkOrderDto, IncidentWorkOrderService, LogHoursDto } from './incident-work-order.service';

export class RequestOverageDto {
  @IsString()
  requestedBy!: string;

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/ir/work-orders')
export class IncidentWorkOrderController {
  constructor(private readonly workOrderService: IncidentWorkOrderService) {}

  @Post()
  async activate(@Body() dto: ActivateWorkOrderDto) {
    const workOrder = await this.workOrderService.activate(dto);
    return { statusCode: HttpStatus.CREATED, data: workOrder };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const workOrder = await this.workOrderService.getWorkOrderById(id);
    return { statusCode: HttpStatus.OK, data: workOrder };
  }

  @Post(':id/hours')
  async logHours(@Param('id') id: string, @Body() dto: LogHoursDto) {
    const workOrder = await this.workOrderService.logHours(id, dto);
    return { statusCode: HttpStatus.OK, data: workOrder };
  }

  @Post(':id/overage-approval')
  async requestOverageApproval(@Param('id') id: string, @Body() dto: RequestOverageDto) {
    const approval = await this.workOrderService.requestOverageApproval(id, dto.requestedBy, dto.reason);
    return { statusCode: HttpStatus.CREATED, data: approval };
  }

  @Patch(':id/close')
  async close(@Param('id') id: string) {
    const workOrder = await this.workOrderService.close(id);
    return { statusCode: HttpStatus.OK, data: workOrder };
  }
}
