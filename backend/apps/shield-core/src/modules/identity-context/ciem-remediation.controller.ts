import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { IsArray, IsString, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  CiemLeastPrivilegeService,
  type CloudProviderType,
} from './ciem-least-privilege.service';

export class AnalyzeCiemRoleDto {
  @IsString()
  @IsIn(['AWS_IAM', 'GCP_IAM', 'AZURE_RBAC'])
  provider!: 'AWS_IAM' | 'GCP_IAM' | 'AZURE_RBAC';

  @IsString()
  roleArnOrId!: string;

  @IsArray()
  assignedPermissions!: string[];

  @IsArray()
  last90DaysUsedPermissions!: string[];
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/identity-context/ciem')
export class CiemRemediationController {
  constructor(private readonly ciemService: CiemLeastPrivilegeService) {}

  /**
   * POST /api/v1/identity-context/ciem/analyze
   * Analyze cloud IAM role for excess permissions and generate least-privilege Terraform diff.
   */
  @Post('analyze')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  analyzeRole(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: AnalyzeCiemRoleDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const result = this.ciemService.analyzeRoleEntitlements({
      tenantId,
      provider: dto.provider as CloudProviderType,
      roleArnOrId: dto.roleArnOrId,
      assignedPermissions: dto.assignedPermissions,
      last90DaysUsedPermissions: dto.last90DaysUsedPermissions,
    });

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }
}
