import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../../authorization/constants';
import { requireTenantId } from '../../../tenant-context';
import { ExternalAuditorWorkspaceService } from './external-auditor-workspace.service';

// NOT G4-gated: ExternalAuditorWorkspaceService's own docstring names its
// specification as "W26, W31-W32 & G4 Phase 4" - this is W26 (G1,
// auditor workspace), not a sovereign/OT-specific capability. It was
// mistakenly swept into the ADR-20 G4 proposal alongside genuinely G4
// services (same "G4 Phase..." comment style) and gated off; corrected
// 2026-10-01 once the W26 experience contract needed it. See ADR-20's
// addendum for the correction record.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/auditor')
export class ExternalAuditorController {
  constructor(
    private readonly auditorService: ExternalAuditorWorkspaceService,
  ) {}

  /**
   * GET /api/v1/auditor/workspace
   * Retrieve high-level cryptographic integrity dashboard for external auditors.
   */
  @Get('workspace')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getWorkspaceSummary(@Headers('x-tenant-id') tenantIdHeader: string) {
    const tenantId = requireTenantId(tenantIdHeader);
    const summary =
      await this.auditorService.getAuditorWorkspaceSummary(tenantId);

    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * GET /api/v1/auditor/merkle-path/:nodeHash
   * Real-time Merkle path validation visualizer data.
   */
  @Get('merkle-path/:nodeHash')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getMerklePath(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Param('nodeHash') nodeHash: string,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const proof = await this.auditorService.getMerklePathProof(
      tenantId,
      nodeHash,
    );

    return {
      statusCode: HttpStatus.OK,
      data: proof,
    };
  }

  /**
   * GET /api/v1/auditor/evidence-chain/:packageId
   * SHA-256 evidence chain inspector with per-file digests and witness signatures.
   */
  @Get('evidence-chain/:packageId')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getEvidenceChain(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Param('packageId') packageId: string,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const chain = await this.auditorService.getEvidenceChain(
      tenantId,
      packageId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: chain,
    };
  }

  /**
   * POST /api/v1/auditor/freeze-certificate/:packageId
   * Generate an immutable, dual-signed freeze certificate for independent regulatory submission.
   */
  @Post('freeze-certificate/:packageId')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async generateFreezeCertificate(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Param('packageId') packageId: string,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const certificate =
      await this.auditorService.generateImmutableFreezeCertificate(
        tenantId,
        packageId,
      );

    return {
      statusCode: HttpStatus.OK,
      data: certificate,
    };
  }
}
