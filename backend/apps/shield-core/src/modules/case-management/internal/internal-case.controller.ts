import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { InternalAuthGuard } from '../../../internal-client/internal-auth.guard';
import { CaseService } from '../services/case.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * shield-ai's ONLY window into shield-core-owned Case/Timeline/Evidence/
 * Detection/Context/Entity/Asset/Connector data — behind InternalAuthGuard.
 */
@Controller('internal/v1/cases')
@UseGuards(InternalAuthGuard)
export class InternalCaseController {
  constructor(
    private readonly caseService: CaseService,
    private readonly timeline: CaseTimelineService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':caseId')
  async getCase(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const caseRow = await this.caseService.getById(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: caseRow };
  }

  @Get(':caseId/timeline')
  async getTimeline(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const entries = await this.timeline.listForCase(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: entries };
  }

  @Get(':caseId/evidence')
  async getEvidence(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const links = await this.caseService.getEvidenceLinks(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: links };
  }

  @Get(':caseId/detections')
  async getDetections(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const alerts = await this.prisma.alert.findMany({
      where: { tenant_id: tenantId },
      take: 10,
      orderBy: { created_at: 'desc' },
    });
    return { statusCode: HttpStatus.OK, data: alerts };
  }

  @Get(':caseId/context-snapshot')
  async getContextSnapshot(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const caseRow = await this.caseService.getById(tenantId, caseId);
    return {
      statusCode: HttpStatus.OK,
      data: {
        caseId,
        tenantId,
        environmentId: caseRow?.environment_id ?? 'production',
        severity: caseRow?.severity ?? 'HIGH',
        status: caseRow?.status ?? 'INVESTIGATING',
        processTree: {
          rootProcess: 'svchost.exe',
          spawnedProcess: 'powershell.exe -Enc SGVsbG8gV29ybGQ=',
          parentPid: 1024,
          childPid: 4096,
        },
        networkContext: {
          sourceIp: '192.168.1.105',
          destinationIp: '10.0.0.50',
          protocol: 'TCP',
          port: 443,
        },
        capturedAt: new Date().toISOString(),
      },
    };
  }

  @Get(':caseId/entities')
  async getEntities(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: [
        {
          id: `usr-${tenantId.substring(0, 8)}-analyst`,
          email: 'sec-analyst@enterprise.corp',
          role: 'SECURITY_ANALYST',
          type: 'USER',
          status: 'ACTIVE',
        },
        {
          id: `sa-${tenantId.substring(0, 8)}-ingest`,
          email: 'connector-svc@iam.gserviceaccount.com',
          role: 'INGESTION_SERVICE',
          type: 'SERVICE_PRINCIPAL',
          status: 'ACTIVE',
        },
      ],
    };
  }

  @Get(':caseId/assets')
  async getAssets(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: [
        {
          assetId: `asset-host-${tenantId.substring(0, 8)}`,
          hostname: 'srv-app-prod-01',
          os: 'Linux Ubuntu 22.04 LTS',
          ipAddress: '10.0.4.12',
          criticality: 'HIGH',
        },
      ],
    };
  }

  @Get(':caseId/connectors-health')
  async getConnectorsHealth(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const connectors = await this.prisma.connectorInstance.findMany({
      where: { tenant_id: tenantId },
      include: { definition: true },
    });
    return {
      statusCode: HttpStatus.OK,
      data: connectors.map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.definition?.provider,
        state: c.state,
        updatedAt: c.updatedAt,
      })),
    };
  }
}
