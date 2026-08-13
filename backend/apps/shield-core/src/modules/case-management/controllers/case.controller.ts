import {
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
import {
  CaseDecisionService,
  DecisionType,
} from '../decisions/case-decision.service';
import {
  CaseStatus,
  CaseDisposition,
} from '../state-machine/case-state-machine.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../../tenant-context';

export class CreateCaseDto {
  alertId!: string;
  title?: string;
  description?: string;
  actorId?: string;
}

export class TransitionCaseDto {
  toState!: CaseStatus;
  reason!: string;
  disposition?: CaseDisposition;
  actorId?: string;
}

export class LinkAlertDto {
  alertId!: string;
  relationshipType?: string;
  actorId?: string;
}

export class AddNoteDto {
  content!: string;
  classification?: string;
  supersedesId?: string;
  actorId?: string;
}

export class RecordDecisionDto {
  decisionType!: DecisionType;
  decision!: string;
  rationale!: string;
  policyVersion?: string;
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
    const createdCase = await this.caseService.createFromAlert({
      tenantId,
      alertId: dto.alertId,
      actorId: user.id,
      title: dto.title,
      description: dto.description,
    });
    return { statusCode: HttpStatus.CREATED, data: createdCase };
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
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const caseRow = await this.caseService.getById(tenantId, caseId);
    return { statusCode: HttpStatus.OK, data: caseRow };
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
