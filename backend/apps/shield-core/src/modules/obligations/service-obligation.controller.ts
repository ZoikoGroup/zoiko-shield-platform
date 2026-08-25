import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import {
  ServiceObligationService,
  CreateServiceObligationDto,
} from './service-obligation.service';

export class UpdateObligationStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  evidenceRef?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/obligations')
export class ServiceObligationController {
  constructor(private readonly obligationService: ServiceObligationService) {}

  /**
   * POST /api/v1/obligations
   * Create service obligation
   */
  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createObligation(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateServiceObligationDto,
  ) {
    const obligation = await this.obligationService.createObligation(
      dto,
      requireTenantId(headerTenantId),
      requireEnvironmentId(user.environmentId),
    );
    return {
      statusCode: HttpStatus.CREATED,
      data: obligation,
    };
  }

  /**
   * GET /api/v1/obligations
   * Get obligations by contract ID
   */
  @Get()
  async getObligations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('contractId') contractId: string,
  ) {
    const obligations = await this.obligationService.getObligationsByContract(
      contractId,
      requireTenantId(headerTenantId),
      requireEnvironmentId(user.environmentId),
    );
    return {
      statusCode: HttpStatus.OK,
      data: obligations,
    };
  }

  /**
   * PATCH /api/v1/obligations/:id/status
   * Update obligation status and link delivery evidence
   */
  @Patch(':id/status')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async updateStatus(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateObligationStatusDto,
  ) {
    const updated = await this.obligationService.updateStatus(
      id,
      dto.status,
      dto.evidenceRef,
      requireTenantId(headerTenantId),
      requireEnvironmentId(user.environmentId),
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Obligation status updated',
      data: updated,
    };
  }
}
