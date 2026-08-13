import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import {
  CreateMeterDefinitionDto,
  MeterDefinitionService,
} from './meter-definition.service';
import { MeteringService, RecordMeterEventDto } from './metering.service';

/** Admin-curated: humans define and approve meters before any event can be classified against them. */
@UseGuards(JwtAuthGuard)
@Controller('api/v1/metering/definitions')
export class MeterDefinitionController {
  constructor(private readonly definitionService: MeterDefinitionService) {}

  @Post()
  async create(@Body() dto: CreateMeterDefinitionDto) {
    const definition = await this.definitionService.createDefinition(dto);
    return { statusCode: HttpStatus.CREATED, data: definition };
  }

  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    const definition = await this.definitionService.approveDefinition(
      id,
      approvedBy || 'system',
    );
    return { statusCode: HttpStatus.OK, data: definition };
  }
}

/** Events are written by the telemetry ingestion pipeline, not an interactive user session. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/metering/events')
export class MeteringController {
  constructor(private readonly meteringService: MeteringService) {}

  @Post()
  async record(@Body() dto: RecordMeterEventDto) {
    const result = await this.meteringService.recordEvent(dto);
    return { statusCode: HttpStatus.CREATED, data: result };
  }
}
