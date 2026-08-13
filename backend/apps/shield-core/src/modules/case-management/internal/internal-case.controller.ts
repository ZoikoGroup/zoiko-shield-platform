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

/**
 * shield-ai's ONLY window into shield-core-owned Case/Timeline/Evidence
 * data — it never touches these Prisma tables directly. Reuses the same
 * services the public /api/v1/cases/* controller uses, just behind
 * InternalAuthGuard instead of end-user auth.
 */
@Controller('internal/v1/cases')
@UseGuards(InternalAuthGuard)
export class InternalCaseController {
  constructor(
    private readonly caseService: CaseService,
    private readonly timeline: CaseTimelineService,
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
}
