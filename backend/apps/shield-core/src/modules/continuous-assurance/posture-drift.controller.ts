import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PostureDriftDetectorService } from './posture-drift-detector.service';
import {
  ScanTenantPostureDto,
  RemediatePostureDriftDto,
} from './dto/posture-drift.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/assurance/posture-drift')
export class PostureDriftController {
  constructor(
    private readonly postureDriftService: PostureDriftDetectorService,
  ) {}

  /**
   * POST /api/v1/assurance/posture-drift/scan
   * Executes continuous cloud security posture scan on tenant asset fleet.
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  async scanPosture(
    @Body() dto: ScanTenantPostureDto,
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = dto.tenantId || headerTenantId || 'tenant-commercial-bank';
    const result = await this.postureDriftService.scanTenantPosture(
      tenantId,
      dto.assets,
    );

    return {
      status: 'SCAN_COMPLETED',
      ...result,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/assurance/posture-drift/findings
   * Lists active posture drift findings for a tenant.
   */
  @Get('findings')
  async getFindings(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'tenant-commercial-bank';
    const findings = await this.postureDriftService.getTenantFindings(tenantId);

    return {
      tenantId,
      totalFindings: findings.length,
      findings,
      retrievedAt: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/assurance/posture-drift/remediate
   * Executes 1-click remediation on a posture drift violation.
   */
  @Post('remediate')
  @HttpCode(HttpStatus.OK)
  async remediateDrift(
    @Body() dto: RemediatePostureDriftDto,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'tenant-commercial-bank';
    const result = await this.postureDriftService.remediateDriftFinding(
      tenantId,
      dto.findingId,
      dto.operatorRationale,
      dto.dualCustodyApproverId,
    );

    return result;
  }
}
