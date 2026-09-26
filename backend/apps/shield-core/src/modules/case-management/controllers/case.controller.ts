import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CaseService } from '../services/case.service';
import { CaseTimelineService } from '../timeline/case-timeline.service';
import { CaseNoteService } from '../notes/case-note.service';
import { CaseDecisionService } from '../decisions/case-decision.service';
import type { DecisionType } from '../decisions/case-decision.service';
import { CaseQualityReviewService } from '../quality/case-quality-review.service';
import type {
  QualityReviewType,
  QualityReviewDecision,
} from '../quality/case-quality-review.service';
import type {
  CaseStatus,
  CaseDisposition,
} from '../state-machine/case-state-machine.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../../tenant-context';
import { IsIn, IsOptional, IsString } from 'class-validator';

const CASE_STATUSES: CaseStatus[] = [
  'NEW',
  'TRIAGED',
  'INVESTIGATING',
  'CONTAINMENT_PENDING',
  'CONTAINED',
  'REMEDIATING',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
];

const CASE_DISPOSITIONS: CaseDisposition[] = [
  'DUPLICATE',
  'FALSE_POSITIVE',
  'ACCEPTED_RISK',
  'CUSTOMER_ACTION_REQUIRED',
  'THIRD_PARTY_DEPENDENCY',
  'LEGAL_HOLD',
];

const DECISION_TYPES: DecisionType[] = [
  'FALSE_POSITIVE_DECISION',
  'ESCALATE_TO_INCIDENT',
  'RESPONSE_RECOMMENDATION',
  'ACCEPT_RISK',
  'CLOSE_CASE',
];

export class CreateCaseDto {
  // Either alertId (escalate an existing alert) or title+environmentId+region
  // (a bare, standalone case) must be supplied - see CaseController.create.
  @IsOptional()
  @IsString()
  alertId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: string;

  @IsOptional()
  @IsIn(['P1', 'P2', 'P3', 'P4'])
  priority?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: string;

  @IsOptional()
  @IsIn(['P1', 'P2', 'P3', 'P4'])
  priority?: string;

  @IsOptional()
  @IsString()
  queue?: string;
}

export class AssignCaseDto {
  @IsString()
  ownerId!: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class LinkEvidenceDto {
  @IsString()
  evidenceId!: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class PauseSlaClockDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class RequestQualityReviewDto {
  @IsIn(['DISPOSITION_REVIEW', 'CLOSURE_REVIEW'])
  reviewType!: QualityReviewType;

  @IsOptional()
  @IsString()
  trigger?: string;
}

export class DecideQualityReviewDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: QualityReviewDecision;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class TransitionCaseDto {
  @IsIn(CASE_STATUSES)
  toState!: CaseStatus;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsIn(CASE_DISPOSITIONS)
  disposition?: CaseDisposition;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class LinkAlertDto {
  @IsString()
  alertId!: string;

  @IsOptional()
  @IsString()
  relationshipType?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class AddNoteDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  supersedesId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

export class RecordDecisionDto {
  @IsIn(DECISION_TYPES)
  decisionType!: DecisionType;

  @IsString()
  decision!: string;

  @IsString()
  rationale!: string;

  @IsOptional()
  @IsString()
  policyVersion?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/cases')
export class CaseController {
  constructor(
    private readonly caseService: CaseService,
    private readonly timelineService: CaseTimelineService,
    private readonly noteService: CaseNoteService,
    private readonly decisionService: CaseDecisionService,
    private readonly qualityReviewService: CaseQualityReviewService,
  ) {}

  private resolveTenantId(headerTenantId: string): string {
    return requireTenantId(headerTenantId);
  }

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const cases = await this.caseService.list(
      tenantId,
      status,
      limit ? Number(limit) : 50,
    );
    return { statusCode: HttpStatus.OK, data: cases };
  }

  @Post()
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);

    if (dto.alertId) {
      const createdCase = await this.caseService.createFromAlert({
        tenantId,
        alertId: dto.alertId,
        actorId: user.id,
        title: dto.title,
        description: dto.description,
      });
      return { statusCode: HttpStatus.CREATED, data: createdCase };
    }

    if (!dto.title || !dto.environmentId || !dto.region) {
      throw new BadRequestException(
        'A case requires either alertId, or title + environmentId + region for a standalone case',
      );
    }
    const createdCase = await this.caseService.createStandalone({
      tenantId,
      environmentId: dto.environmentId,
      region: dto.region,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      priority: dto.priority,
      actorId: user.id,
    });
    return { statusCode: HttpStatus.CREATED, data: createdCase };
  }

  /**
   * Tenant-wide handover snapshot (W20). Declared before the ':caseId' route
   * so Nest does not read 'handover' as a case id.
   */
  @Get('handover')
  async handover(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const cases = await this.caseService.handoverSnapshot(tenantId);
    return { statusCode: HttpStatus.OK, data: cases };
  }

  @Get(':caseId')
  async getById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const caseRow = await this.caseService.getById(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: caseRow };
  }

  @Patch(':caseId')
  async update(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateCaseDto,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const caseRow = await this.caseService.update({
      tenantId,
      caseId,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      priority: dto.priority,
      queue: dto.queue,
    });
    return { statusCode: HttpStatus.OK, data: caseRow };
  }

  @Post(':caseId/assign')
  async assign(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: AssignCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const updated = await this.caseService.assign({
      tenantId,
      caseId,
      ownerId: dto.ownerId,
      actorId: dto.actorId ?? user.id,
    });
    return { statusCode: HttpStatus.OK, data: updated };
  }

  @Post(':caseId/transition')
  async transition(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: TransitionCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const transition = await this.caseService.transition({
      tenantId,
      caseId,
      toState: dto.toState,
      actorId: user.id,
      reason: dto.reason,
      disposition: dto.disposition,
    });
    return { statusCode: HttpStatus.OK, data: transition };
  }

  @Post(':caseId/alerts')
  async linkAlert(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: LinkAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const link = await this.caseService.linkAlert({
      tenantId,
      caseId,
      alertId: dto.alertId,
      actorId: user.id,
      relationshipType: dto.relationshipType,
    });
    return { statusCode: HttpStatus.OK, data: link };
  }

  @Get(':caseId/timeline')
  async getTimeline(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const timeline = await this.timelineService.listForCase(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: timeline };
  }

  /**
   * The case communications record (W19). Notes carry a classification, so
   * what was said to the customer and what was said internally stay
   * distinguishable after the fact; a superseded note keeps its predecessor
   * rather than overwriting it.
   */
  @Get(':caseId/notes')
  async getNotes(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const notes = await this.noteService.listForCase(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: notes };
  }

  @Post(':caseId/notes')
  async addNote(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const note = dto.supersedesId
      ? await this.noteService.correct({
          tenantId,
          caseId,
          authorId: user.id,
          content: dto.content,
          supersedesId: dto.supersedesId,
          classification: dto.classification,
        })
      : await this.noteService.add({
          tenantId,
          caseId,
          authorId: user.id,
          content: dto.content,
          classification: dto.classification,
        });
    return { statusCode: HttpStatus.CREATED, data: note };
  }

  @Get(':caseId/evidence')
  async getEvidence(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const evidence = await this.caseService.getEvidenceLinks(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: evidence };
  }

  @Post(':caseId/evidence')
  async linkEvidence(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: LinkEvidenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const link = await this.caseService.linkEvidence({
      tenantId,
      caseId,
      evidenceId: dto.evidenceId,
      actorId: dto.actorId ?? user.id,
    });
    return { statusCode: HttpStatus.CREATED, data: link };
  }

  @Get(':caseId/sla')
  async getSlaClock(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const clock = await this.caseService.getSlaClock(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: clock };
  }

  @Post(':caseId/sla/pause')
  async pauseSlaClock(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: PauseSlaClockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const clock = await this.caseService.pauseSlaClock({
      tenantId,
      caseId,
      reason: dto.reason,
      actorId: dto.actorId ?? user.id,
    });
    return { statusCode: HttpStatus.OK, data: clock };
  }

  @Post(':caseId/sla/resume')
  async resumeSlaClock(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const clock = await this.caseService.resumeSlaClock({
      tenantId,
      caseId,
      actorId: user.id,
    });
    return { statusCode: HttpStatus.OK, data: clock };
  }

  @Get(':caseId/quality-reviews')
  async listQualityReviews(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const reviews = await this.qualityReviewService.listForCase(
      tenantId,
      caseId,
    );
    return { statusCode: HttpStatus.OK, data: reviews };
  }

  @Post(':caseId/quality-reviews')
  async requestQualityReview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: RequestQualityReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const review = await this.qualityReviewService.request({
      tenantId,
      caseId,
      reviewType: dto.reviewType,
      requestedBy: user.id,
      trigger: dto.trigger ?? 'Manually requested',
    });
    return { statusCode: HttpStatus.CREATED, data: review };
  }

  @Post(':caseId/quality-reviews/:reviewId/decide')
  async decideQualityReview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: DecideQualityReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    await this.caseService.assertTenantOwnership(tenantId, caseId);
    const review = await this.qualityReviewService.decide({
      tenantId,
      reviewId,
      reviewerId: user.id,
      decision: dto.decision,
      comments: dto.comments,
    });
    return { statusCode: HttpStatus.OK, data: review };
  }

  @Post(':caseId/decisions')
  async recordDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const decision = await this.decisionService.record({
      tenantId,
      caseId,
      decisionType: dto.decisionType,
      decision: dto.decision,
      rationale: dto.rationale,
      actorId: user.id,
      policyVersion: dto.policyVersion,
    });
    return { statusCode: HttpStatus.CREATED, data: decision };
  }
}
