import {
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

export class AcceptFindingDto {
  rationale!: string;
  authority!: string;
  expiresAt!: string;
  reviewAt?: string;
  compensatingControls?: string[];
  riskRef?: string;
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
  ) {
    const data = await this.findingService.list(
      requireTenantId(tenantId),
      { status, severity, assetId },
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
