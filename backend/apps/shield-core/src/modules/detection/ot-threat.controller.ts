import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { G4GateGuard } from '../authorization/guards/g4-gate.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  OtThreatDetectorService,
  type OtProtocolType,
} from './ot-threat-detector.service';

export class AnalyzeOtEventDto {
  @IsString()
  eventId!: string;

  @IsString()
  timestamp!: string;

  @IsString()
  sourceIp!: string;

  @IsString()
  destinationIp!: string;

  @IsNumber()
  destinationPort!: number;

  @IsString()
  @IsIn(['MODBUS_TCP', 'DNP3', 'OPC_UA'])
  protocol!: 'MODBUS_TCP' | 'DNP3' | 'OPC_UA';

  @IsOptional()
  @IsString()
  unitIdOrStation?: string;

  @IsOptional()
  functionCode?: number | string;

  @IsOptional()
  @IsString()
  serviceOrMethod?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsString()
  payloadHex!: string;

  @IsOptional()
  @IsString()
  deviceCategory?: string;
}

// Every route on this controller is part of the unratified G4 proposal
// (ADR-20): OT protocol threat detection. G4GateGuard fails closed.
@UseGuards(JwtAuthGuard, PermissionsGuard, G4GateGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/detection/ot')
export class OtThreatController {
  constructor(private readonly otThreatService: OtThreatDetectorService) {}

  /**
   * GET /api/v1/detection/ot/rules
   * Get catalog of industrial OT protocol threat and anomaly detection rules.
   */
  @Get('rules')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getRules() {
    return {
      statusCode: HttpStatus.OK,
      data: this.otThreatService.getRulesCatalog(),
    };
  }

  /**
   * POST /api/v1/detection/ot/analyze
   * Analyze an OT network event for protocol anomalies and unauthorized actuator mutations.
   */
  @Post('analyze')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async analyzeEvent(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: AnalyzeOtEventDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const finding = await this.otThreatService.analyzeOtEvent({
      ...dto,
      tenantId,
      protocol: dto.protocol as OtProtocolType,
    });

    return {
      statusCode: HttpStatus.OK,
      data: {
        threatDetected: finding !== null,
        finding,
      },
    };
  }
}
