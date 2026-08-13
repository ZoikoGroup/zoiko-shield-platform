import { Body, Controller, Get, Headers, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { CreateSlaDefinitionDto, SlaDefinitionService } from './sla-definition.service';
import { RecordMeasurementDto, SlaMeasurementService } from './sla-measurement.service';
import { ProposeCreditDto, ServiceCreditService } from './service-credit.service';
import { requireTenantId } from '../../tenant-context';

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
  async record(@Headers('x-tenant-id') headerTenantId: string, @Body() dto: RecordMeasurementDto) {
    const measurement = await this.measurementService.recordMeasurement(requireTenantId(headerTenantId), dto);
    return { statusCode: HttpStatus.CREATED, data: measurement };
  }

  @Get(':id')
  async get(@Headers('x-tenant-id') headerTenantId: string, @Param('id') id: string) {
    const measurement = await this.measurementService.getMeasurementById(requireTenantId(headerTenantId), id);
    return { statusCode: HttpStatus.OK, data: measurement };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/sla/credits')
export class ServiceCreditController {
  constructor(private readonly creditService: ServiceCreditService) {}

  @Post()
  async propose(@Headers('x-tenant-id') headerTenantId: string, @Body() dto: ProposeCreditDto) {
    const credit = await this.creditService.proposeCredit(requireTenantId(headerTenantId), dto);
    return { statusCode: HttpStatus.CREATED, data: credit };
  }

  @Get(':id')
  async get(@Headers('x-tenant-id') headerTenantId: string, @Param('id') id: string) {
    const credit = await this.creditService.getCreditById(requireTenantId(headerTenantId), id);
    return { statusCode: HttpStatus.OK, data: credit };
  }

  @Patch(':id/decision')
  async decide(@Headers('x-tenant-id') headerTenantId: string, @Param('id') id: string, @Body() dto: DecideCreditDto) {
    const credit = await this.creditService.decideCredit(requireTenantId(headerTenantId), id, dto.approverId, dto.decision, dto.reason);
    return { statusCode: HttpStatus.OK, data: credit };
  }

  @Patch(':id/post')
  async post(@Headers('x-tenant-id') headerTenantId: string, @Param('id') id: string, @Body() dto: PostCreditDto) {
    const credit = await this.creditService.postCredit(requireTenantId(headerTenantId), id, dto.invoiceId);
    return { statusCode: HttpStatus.OK, data: credit };
  }
}
