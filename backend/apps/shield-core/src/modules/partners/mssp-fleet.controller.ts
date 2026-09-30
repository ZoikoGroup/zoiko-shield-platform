import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import { MsspFleetPostureService } from './mssp-fleet-posture.service';
import { TwoPartyJitSupportService } from './two-party-jit-support.service';

export class InitiateTwoPartyJitDto {
  @IsString()
  targetTenantId!: string;

  @IsString()
  incidentReference!: string;

  @IsString()
  justification!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'READ_ONLY_SECURITY_TELEMETRY',
    'READ_ONLY_AUDIT_LOGS',
    'READ_ONLY_INCIDENT_CONTEXT',
  ])
  allowedScope?:
    | 'READ_ONLY_SECURITY_TELEMETRY'
    | 'READ_ONLY_AUDIT_LOGS'
    | 'READ_ONLY_INCIDENT_CONTEXT';

  @IsOptional()
  @IsNumber()
  @Min(5)
  durationMinutes?: number;
}

export class ApproveCustomerJitDto {
  @IsString()
  sessionId!: string;

  @IsString()
  signatureProof!: string;
}

export class AuthorizePlatformLeadJitDto {
  @IsString()
  sessionId!: string;

  @IsString()
  signatureProof!: string;
}

export class RevokeJitDto {
  @IsString()
  sessionId!: string;

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/partners/fleet')
export class MsspFleetController {
  constructor(
    private readonly fleetService: MsspFleetPostureService,
    private readonly jitService: TwoPartyJitSupportService,
  ) {}

  /**
   * GET /api/v1/partners/fleet/summary
   * Retrieve multi-tenant security and compliance posture overview for authorized MSSP partner.
   */
  @Get('summary')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getFleetSummary(@Headers('x-tenant-id') tenantIdHeader: string) {
    const partnerId = requireTenantId(tenantIdHeader);
    const summary = this.fleetService.getFleetPostureSummary(partnerId);

    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * GET /api/v1/partners/fleet/isolation-audit
   * Verify zero-leakage cross-tenant isolation boundaries across delegated fleet.
   */
  @Get('isolation-audit')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  verifyIsolation(@Headers('x-tenant-id') tenantIdHeader: string) {
    const partnerId = requireTenantId(tenantIdHeader);
    const audit = this.fleetService.verifyCrossTenantIsolation(partnerId);

    return {
      statusCode: HttpStatus.OK,
      data: audit,
    };
  }

  /**
   * POST /api/v1/partners/fleet/jit/request
   * Step 1: Initiate two-party JIT support request for a customer tenant.
   */
  @Post('jit/request')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  initiateJit(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: InitiateTwoPartyJitDto,
  ) {
    const engineerId = requireTenantId(tenantIdHeader);
    const session = this.jitService.initiateSupportRequest(
      dto.targetTenantId,
      engineerId,
      dto.incidentReference,
      dto.justification,
      dto.allowedScope,
      dto.durationMinutes,
    );

    return {
      statusCode: HttpStatus.CREATED,
      data: session,
    };
  }

  /**
   * POST /api/v1/partners/fleet/jit/approve-customer
   * Step 2: Customer tenant administrator signs off on emergency support access.
   */
  @Post('jit/approve-customer')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  approveCustomerJit(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: ApproveCustomerJitDto,
  ) {
    const customerAdminId = requireTenantId(tenantIdHeader);
    const session = this.jitService.approveByCustomerAdmin(
      dto.sessionId,
      customerAdminId,
      dto.signatureProof,
    );

    return {
      statusCode: HttpStatus.OK,
      data: session,
    };
  }

  /**
   * POST /api/v1/partners/fleet/jit/authorize-lead
   * Step 3: Platform Lead signs off and issues ephemeral read-only access token.
   */
  @Post('jit/authorize-lead')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  authorizePlatformLeadJit(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: AuthorizePlatformLeadJitDto,
  ) {
    const platformLeadId = requireTenantId(tenantIdHeader);
    const session = this.jitService.authorizeByPlatformLead(
      dto.sessionId,
      platformLeadId,
      dto.signatureProof,
    );

    return {
      statusCode: HttpStatus.OK,
      data: session,
    };
  }

  /**
   * POST /api/v1/partners/fleet/jit/revoke
   * Revoke an active support session immediately.
   */
  @Post('jit/revoke')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  revokeJit(
    @Headers('x-tenant-id') _tenantIdHeader: string,
    @Body() dto: RevokeJitDto,
  ) {
    const session = this.jitService.revokeSession(dto.sessionId, dto.reason);

    return {
      statusCode: HttpStatus.OK,
      data: session,
    };
  }
}
