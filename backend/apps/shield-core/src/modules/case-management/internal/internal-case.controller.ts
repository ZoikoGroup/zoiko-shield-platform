import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
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

  /**
   * Escalate an alert to a case on behalf of a satellite service.
   *
   * shield-ingest owns alerts but must not own cases (architecture spec
   * §07), so its "promote this alert" API call lands here and runs the same
   * CaseService.createFromAlert the operator-facing controller runs —
   * including its idempotency guard and its walk of the alert to
   * ESCALATED_TO_CASE. Before this endpoint existed, promotion in
   * shield-ingest only flipped a status column and returned a payload
   * describing a case nobody ever created.
   */
  @Post('from-alert')
  async createFromAlert(
    @Body()
    body: {
      tenantId?: string;
      alertId?: string;
      actorId?: string;
      title?: string;
      description?: string;
    },
  ) {
    if (!body?.tenantId || !body?.alertId) {
      throw new BadRequestException('tenantId and alertId are required');
    }
    const createdCase = await this.caseService.createFromAlert({
      tenantId: body.tenantId,
      alertId: body.alertId,
      actorId: body.actorId ?? 'system:shield-ingest-promotion',
      title: body.title,
      description: body.description,
    });
    return { statusCode: HttpStatus.CREATED, data: createdCase };
  }

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

  /**
   * The alerts actually linked to this case, not the tenant's most recent
   * alerts. The previous version returned `take: 10` of every alert in the
   * tenant regardless of the caseId in the path, so shield-ai reasoned about
   * alerts belonging to unrelated investigations.
   */
  @Get(':caseId/detections')
  async getDetections(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const links = await this.prisma.caseAlert.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: { linked_at: 'asc' },
    });
    if (links.length === 0) {
      return { statusCode: HttpStatus.OK, data: [] };
    }
    const alerts = await this.prisma.alert.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: links.map((link) => link.alert_id) },
      },
      orderBy: { created_at: 'desc' },
    });
    return { statusCode: HttpStatus.OK, data: alerts };
  }

  /**
   * The context snapshot the detection pipeline resolved for this case's
   * primary alert.
   *
   * This endpoint used to return a fixed fiction — an invented process tree
   * (`svchost.exe` spawning an encoded PowerShell command) and an invented
   * network flow — for every case in every tenant. shield-ai consumed it as
   * the case's evidence, so any analysis it produced described an attack that
   * had not happened. A case with no resolved context now says so instead.
   */
  @Get(':caseId/context-snapshot')
  async getContextSnapshot(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const caseRow = await this.caseService.getById(tenantId, caseId);
    if (!caseRow) {
      throw new NotFoundException(`Case '${caseId}' not found for this tenant`);
    }

    const primaryLink = await this.prisma.caseAlert.findFirst({
      where: { tenant_id: tenantId, case_id: caseId },
      orderBy: [{ relationship_type: 'asc' }, { linked_at: 'asc' }],
    });
    const alert = primaryLink
      ? await this.prisma.alert.findFirst({
          where: { tenant_id: tenantId, id: primaryLink.alert_id },
        })
      : null;

    const snapshot = alert?.context_snapshot_id
      ? await this.prisma.contextSnapshot.findFirst({
          where: { tenant_id: tenantId, id: alert.context_snapshot_id },
        })
      : null;

    return {
      statusCode: HttpStatus.OK,
      data: {
        caseId,
        tenantId,
        environmentId: caseRow.environment_id,
        severity: caseRow.severity,
        status: caseRow.status,
        alertId: alert?.id ?? null,
        // UNRESOLVED is a real state of the context resolver, and saying it
        // is more useful to a reviewer than a plausible invention.
        contextHealth: snapshot?.context_health ?? 'UNRESOLVED',
        identityEntityId: snapshot?.identity_entity_id ?? null,
        identityRisk: snapshot?.identity_risk ?? null,
        assetId: snapshot?.asset_id ?? null,
        assetCriticality: snapshot?.asset_criticality ?? null,
        relationshipRefs: snapshot
          ? JSON.parse(snapshot.relationship_refs)
          : [],
        sourceVersions: snapshot ? JSON.parse(snapshot.source_versions) : {},
        resolverVersion: snapshot?.resolver_version ?? null,
        capturedAt: snapshot?.created_at ?? null,
      },
    };
  }

  /**
   * The identities this case's alerts actually implicate, read from the
   * resolved identity graph. Previously two hard-coded people were returned
   * for every case, with the tenant id spliced into their ids to make them
   * look tenant-specific.
   */
  @Get(':caseId/entities')
  async getEntities(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const identityIds = await this.identityIdsForCase(tenantId, caseId);
    if (identityIds.length === 0) {
      return { statusCode: HttpStatus.OK, data: [] };
    }
    const identities = await this.prisma.identityEntity.findMany({
      where: { tenant_id: tenantId, id: { in: identityIds } },
    });
    return {
      statusCode: HttpStatus.OK,
      data: identities.map((identity) => ({
        id: identity.id,
        email: identity.email,
        displayName: identity.display_name,
        type: identity.identity_type,
        status: identity.status,
        confidence: identity.confidence,
        lastSeenAt: identity.last_seen_at,
      })),
    };
  }

  /**
   * The assets this case's alerts actually implicate. Previously a single
   * invented Ubuntu host was returned for every case.
   */
  @Get(':caseId/assets')
  async getAssets(
    @Param('caseId') caseId: string,
    @Query('tenantId') tenantId: string,
  ) {
    const assetIds = await this.assetIdsForCase(tenantId, caseId);
    if (assetIds.length === 0) {
      return { statusCode: HttpStatus.OK, data: [] };
    }
    const assets = await this.prisma.asset.findMany({
      where: { tenant_id: tenantId, id: { in: assetIds } },
    });
    return {
      statusCode: HttpStatus.OK,
      data: assets.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        assetType: asset.asset_type,
        externalId: asset.external_id,
        criticality: asset.criticality,
        status: asset.status,
        lastSeenAt: asset.last_seen_at,
      })),
    };
  }

  private async alertsForCase(tenantId: string, caseId: string) {
    const links = await this.prisma.caseAlert.findMany({
      where: { tenant_id: tenantId, case_id: caseId },
      select: { alert_id: true },
    });
    if (links.length === 0) return [];
    return this.prisma.alert.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: links.map((link) => link.alert_id) },
      },
      select: {
        primary_identity_id: true,
        primary_asset_id: true,
        affected_identities: true,
        affected_assets: true,
      },
    });
  }

  /** Tolerates a malformed JSON column rather than failing the whole read. */
  private parseIdList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private async identityIdsForCase(
    tenantId: string,
    caseId: string,
  ): Promise<string[]> {
    const alerts = await this.alertsForCase(tenantId, caseId);
    const ids = new Set<string>();
    for (const alert of alerts) {
      if (alert.primary_identity_id) ids.add(alert.primary_identity_id);
      for (const id of this.parseIdList(alert.affected_identities)) ids.add(id);
    }
    return [...ids];
  }

  private async assetIdsForCase(
    tenantId: string,
    caseId: string,
  ): Promise<string[]> {
    const alerts = await this.alertsForCase(tenantId, caseId);
    const ids = new Set<string>();
    for (const alert of alerts) {
      if (alert.primary_asset_id) ids.add(alert.primary_asset_id);
      for (const id of this.parseIdList(alert.affected_assets)) ids.add(id);
    }
    return [...ids];
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
