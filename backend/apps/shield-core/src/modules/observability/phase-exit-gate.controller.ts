import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { PhaseExitGateService, Phase0ExitProofRecord, Phase0PostureSummary } from './phase-exit-gate.service';
import {
  PhaseProofExporterService,
  Phase0ProofBundle,
  OfflineVerificationReport,
} from './phase-proof-exporter.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';

@Controller('api/v1/observability/phase-gates/phase-0')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class PhaseExitGateController {
  constructor(
    private readonly phaseExitGateService: PhaseExitGateService,
    private readonly phaseProofExporterService: PhaseProofExporterService,
  ) {}

  @Get('status')
  @RequirePlatformPermissions('observability:read')
  async getPhase0Status(): Promise<{
    postureSummary: Phase0PostureSummary;
    latestProof: Phase0ExitProofRecord;
  }> {
    const postureSummary = this.phaseExitGateService.getPostureSummary();
    const latestProof = this.phaseExitGateService.getLatestProof();
    return {
      postureSummary,
      latestProof,
    };
  }

  @Post('execute')
  @RequirePlatformPermissions('observability:write')
  async executePhase0Flow(
    @Body() body: { tenantId?: string; cellId?: string },
  ): Promise<Phase0ExitProofRecord> {
    return this.phaseExitGateService.executePhase0ReferenceFlow(
      body?.tenantId || 'tenant-zoiko-canary-01',
      body?.cellId || 'cell-eu-west-1a',
    );
  }

  @Get('proof')
  @RequirePlatformPermissions('observability:read')
  async getPhase0ProofBundle(
    @Query('proofId') proofId?: string,
  ): Promise<Phase0ProofBundle> {
    return this.phaseProofExporterService.exportPhase0ProofBundle(proofId);
  }

  @Post('verify')
  @RequirePlatformPermissions('observability:read')
  async verifyProofOffline(
    @Body() bundle: Record<string, any>,
  ): Promise<OfflineVerificationReport> {
    return this.phaseProofExporterService.verifyProofBundleOffline(
      bundle as Phase0ProofBundle,
    );
  }
}


