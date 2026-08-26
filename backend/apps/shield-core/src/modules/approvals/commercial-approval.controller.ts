import {
  ConflictException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsDefined, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  CommercialApprovalService,
  RequestApprovalDto,
} from './commercial-approval.service';
import { HumanAuthorityAttestationDto } from '../human-authority/human-authority.dto';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/approvals')
export class CommercialApprovalController {
  constructor(private readonly approvalService: CommercialApprovalService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestApproval(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: RequestApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const approval = await this.approvalService.requestApproval({
      ...dto,
      tenantId,
      requestedBy: user.id,
    });
    return { statusCode: HttpStatus.CREATED, data: approval };
  }

  @Get(':id')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
  async getApproval(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
  ) {
    const approval = await this.approvalService.getApprovalByIdForTenant(
      id,
      requireTenantId(headerTenantId),
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Patch(':id/decision')
  @UseGuards(HumanAuthorityGuard)
  @RequireHumanAuthority(
    'COMMERCIAL_CHANGE_AUTHORIZATION',
    'CommercialApproval',
    'id',
  )
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decide(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.approvalService.getApprovalByIdForTenant(
      id,
      requireTenantId(headerTenantId),
    );
    if (
      existing.change_type === 'NON_STANDARD_DISCOUNT' &&
      existing.object_type === 'QuoteDiscountReview'
    ) {
      throw new ConflictException(
        'Use the quote discount-decision endpoint so required approval authority is enforced',
      );
    }
    const approval = await this.approvalService.decideApproval(
      id,
      user.id,
      dto.decision,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }
}
