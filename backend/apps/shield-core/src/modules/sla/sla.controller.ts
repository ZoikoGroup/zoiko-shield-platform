import { Body, Controller, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { CreateSlaDefinitionDto, SlaDefinitionService } from './sla-definition.service';
import { RecordMeasurementDto, SlaMeasurementService } from './sla-measurement.service';
import { ProposeCreditDto, ServiceCreditService } from './service-credit.service';

export class DecideCreditDto {
  @IsString()
  approverId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class PostCreditDto {
  @IsUUID()
  invoiceId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/sla/definitions')
export class SlaDefinitionController {
  constructor(private readonly definitionService: SlaDefinitionService) {}

  @Post()
  async create(@Body() dto: CreateSlaDefinitionDto) {
    const definition = await this.definitionService.createDefinition(dto);
    return { statusCode: HttpStatus.CREATED, data: definition };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    const definition = await this.definitionService.approveDefinition(id, approvedBy || 'system');
    return { statusCode: HttpStatus.OK, data: definition };
  }
}

/** Measurements come from the monitoring/telemetry pipeline, not an interactive session. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/sla/measurements')
export class SlaMeasurementController {
  constructor(private readonly measurementService: SlaMeasurementService) {}

  @Post()
  async record(@Body() dto: RecordMeasurementDto) {
    const measurement = await this.measurementService.recordMeasurement(dto);
    return { statusCode: HttpStatus.CREATED, data: measurement };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const measurement = await this.measurementService.getMeasurementById(id);
    return { statusCode: HttpStatus.OK, data: measurement };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/sla/credits')
export class ServiceCreditController {
  constructor(private readonly creditService: ServiceCreditService) {}

  @Post()
  async propose(@Body() dto: ProposeCreditDto) {
    const credit = await this.creditService.proposeCredit(dto);
    return { statusCode: HttpStatus.CREATED, data: credit };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const credit = await this.creditService.getCreditById(id);
    return { statusCode: HttpStatus.OK, data: credit };
  }

  @Patch(':id/decision')
  async decide(@Param('id') id: string, @Body() dto: DecideCreditDto) {
    const credit = await this.creditService.decideCredit(id, dto.approverId, dto.decision, dto.reason);
    return { statusCode: HttpStatus.OK, data: credit };
  }

  @Patch(':id/post')
  async post(@Param('id') id: string, @Body() dto: PostCreditDto) {
    const credit = await this.creditService.postCredit(id, dto.invoiceId);
    return { statusCode: HttpStatus.OK, data: credit };
  }
}
