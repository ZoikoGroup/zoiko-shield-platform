import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FindingService } from './finding.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class AcceptFindingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  rationale!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  authority!: string;

  // Required: an acceptance with no end date is indistinguishable from
  // having forgotten (see accept() below).
  @IsISO8601()
  expiresAt!: string;

  @IsOptional()
  @IsISO8601()
  reviewAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  compensatingControls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  riskRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  authorizationDecisionId?: string;
}

/** Exposure findings (W30, G2). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/findings')
export class FindingsController {
  constructor(private readonly findingService: FindingService) {}

  /**
   * Population summary. Declared before ':findingId' so Nest does not read
   * 'summary' as an id.
   */
  @Get('summary')
  async summary(@Headers('x-tenant-id') tenantId: string) {
    const data = await this.findingService.summary(requireTenantId(tenantId));
    return { statusCode: HttpStatus.OK, data };
  }

  @Get()
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('assetId') assetId?: string,
    @Query('limit') limit?: string,
    @Query('type') findingType?: string,
  ) {
    const validStatuses = [
      'OPEN',
      'ACCEPTED',
      'RESOLVED',
      'FALSE_POSITIVE',
      'REMEDIATING',
      'IN_PROGRESS',
    ];
    if (status && !validStatuses.includes(status.toUpperCase())) {
      throw new BadRequestException(`Invalid finding status '${status}'`);
    }
    const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    if (severity && !validSeverities.includes(severity.toUpperCase())) {
      throw new BadRequestException(`Invalid finding severity '${severity}'`);
    }
    const data = await this.findingService.list(
      requireTenantId(tenantId),
      { status, severity, assetId, findingType },
      limit ? Number(limit) : 100,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get(':findingId')
  async getById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('findingId') findingId: string,
  ) {
    const data = await this.findingService.getById(
      requireTenantId(tenantId),
      findingId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  /**
   * Accept a finding. The DTO requires an expiry because the schema does: an
   * acceptance with no end date is indistinguishable from having forgotten.
   */
  @Post(':findingId/accept')
  async accept(
    @Headers('x-tenant-id') tenantId: string,
    @Param('findingId') findingId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptFindingDto,
  ) {
    const data = await this.findingService.accept({
      tenantId: requireTenantId(tenantId),
      findingId,
      acceptedBy: user.id,
      rationale: dto.rationale,
      authority: dto.authority,
      expiresAt: new Date(dto.expiresAt),
      reviewAt: dto.reviewAt ? new Date(dto.reviewAt) : undefined,
      compensatingControls: dto.compensatingControls,
      riskRef: dto.riskRef,
      authorizationDecisionId: dto.authorizationDecisionId,
    });
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('acceptances/expire-lapsed')
  async expireLapsed(@Headers('x-tenant-id') tenantId: string) {
    const data = await this.findingService.expireLapsedAcceptances(
      requireTenantId(tenantId),
    );
    return { statusCode: HttpStatus.OK, data };
  }
}
