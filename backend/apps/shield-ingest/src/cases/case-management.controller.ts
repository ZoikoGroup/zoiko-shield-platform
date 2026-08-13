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
} from '@nestjs/common';
import {
  CaseManagementService,
  CreateCaseDto,
  UpdateCaseDto,
} from './case-management.service';
import { requireTenantId } from '../security/tenant-context';

export class AssignCaseDto {
  ownerId!: string;
  actorId?: string;
}

export class TransitionCaseDto {
  targetStatus!: string;
  actorId?: string;
  reason?: string;
}

export class AddNoteDto {
  note!: string;
  actorId?: string;
}

export class LinkEvidenceDto {
  evidenceId!: string;
  actorId?: string;
}

@Controller('api/v1/cases')
export class CaseManagementController {
  constructor(private readonly caseService: CaseManagementService) {}

  /**
   * POST /api/v1/cases
   * Create a new investigation case
   */
  @Post()
  async createCase(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() dto: CreateCaseDto,
  ) {
    dto.tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const caseRecord = await this.caseService.createCase(dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Case created successfully',
      data: caseRecord,
    };
  }

  /**
   * GET /api/v1/cases
   * List investigation cases for tenant
   */
  @Get()
  async getCases(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const cases = await this.caseService.getCases(
      tenantId,
      status,
      severity,
      ownerId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: cases,
    };
  }

  /**
   * GET /api/v1/cases/:caseId
   * Get single case detail and full timeline
   */
  @Get(':caseId')
  async getCaseById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const caseRecord = await this.caseService.getCaseById(
      requireTenantId(headerTenantId),
      caseId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: caseRecord,
    };
  }

  /**
   * PATCH /api/v1/cases/:caseId
   * Update case metadata fields
   */
  @Patch(':caseId')
  async updateCase(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateCaseDto,
  ) {
    const updated = await this.caseService.updateCase(
      requireTenantId(headerTenantId),
      caseId,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Case updated successfully',
      data: updated,
    };
  }

  /**
   * POST /api/v1/cases/:caseId/assign
   * Assign case owner
   */
  @Post(':caseId/assign')
  async assignCase(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: AssignCaseDto,
  ) {
    const updated = await this.caseService.assignCase(
      requireTenantId(headerTenantId),
      caseId,
      dto.ownerId,
      dto.actorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: `Case assigned to owner '${dto.ownerId}'`,
      data: updated,
    };
  }

  /**
   * POST /api/v1/cases/:caseId/transition
   * Execute validated state transition per case lifecycle
   */
  @Post(':caseId/transition')
  async transitionState(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: TransitionCaseDto,
  ) {
    const updated = await this.caseService.transitionState(
      requireTenantId(headerTenantId),
      caseId,
      dto.targetStatus,
      dto.actorId,
      dto.reason,
    );
    return {
      statusCode: HttpStatus.OK,
      message: `Case status updated to '${dto.targetStatus}'`,
      data: updated,
    };
  }

  /**
   * POST /api/v1/cases/:caseId/notes
   * Add analyst note to case timeline
   */
  @Post(':caseId/notes')
  async addNote(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: AddNoteDto,
  ) {
    const noteEntry = await this.caseService.addNote(
      requireTenantId(headerTenantId),
      caseId,
      dto.note,
      dto.actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Note added to case timeline',
      data: noteEntry,
    };
  }

  /**
   * POST /api/v1/cases/:caseId/evidence
   * Link evidence record to case timeline
   */
  @Post(':caseId/evidence')
  async linkEvidence(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: LinkEvidenceDto,
  ) {
    const evidenceEntry = await this.caseService.linkEvidence(
      requireTenantId(headerTenantId),
      caseId,
      dto.evidenceId,
      dto.actorId,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Evidence linked to case timeline',
      data: evidenceEntry,
    };
  }

  /**
   * GET /api/v1/cases/:caseId/timeline
   * Query case timeline entries
   */
  @Get(':caseId/timeline')
  async getCaseTimeline(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
  ) {
    const timeline = await this.caseService.getCaseTimeline(
      requireTenantId(headerTenantId),
      caseId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: timeline,
    };
  }
}
