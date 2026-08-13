import { Controller, Get, Post, Param, Headers, HttpStatus, UseGuards } from '@nestjs/common';
import { EvidenceService } from '../services/evidence.service';
import { EvidenceVerificationService } from '../verification/evidence-verification.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { requireTenantId } from '../../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly verificationService: EvidenceVerificationService,
    private readonly lineageService: EvidenceLineageService,
  ) {}

  private resolveTenantId(headerTenantId: string): string {
    return requireTenantId(headerTenantId);
  }

  @Get(':evidenceId')
  async getById(@Headers('x-tenant-id') headerTenantId: string, @Param('evidenceId') evidenceId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    // Cross-tenant access must be rejected, not merely filtered — see EvidenceService.assertTenantOwnership.
    await this.evidenceService.assertTenantOwnership(tenantId, evidenceId);
    const evidence = await this.evidenceService.getById(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: evidence };
  }

  @Get(':evidenceId/lineage')
  async getLineage(@Headers('x-tenant-id') headerTenantId: string, @Param('evidenceId') evidenceId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.evidenceService.assertTenantOwnership(tenantId, evidenceId);
    const lineage = await this.lineageService.reconstruct(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: lineage };
  }

  @Post(':evidenceId/verify')
  async verify(@Headers('x-tenant-id') headerTenantId: string, @Param('evidenceId') evidenceId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const result = await this.verificationService.verify(tenantId, evidenceId);
    return { statusCode: HttpStatus.OK, data: result };
  }
}
