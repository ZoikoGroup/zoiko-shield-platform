import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { AuthorizationService } from '../authorization/authorization.service';
import { requireTenantId } from '../../tenant-context';
import {
  EmailSecurityService,
  type EmailActorContext,
} from './email-security.service';
import {
  ApproveEmailActionDto,
  ApproveOrActivateEmailPolicyDto,
  BuildEmailEvidenceExportDto,
  CreateEmailConnectionIntentDto,
  DecideEmailAnalysisDto,
  DisconnectEmailConnectorDto,
  DraftEmailPolicyDto,
  EvaluateEmailAiDto,
  ExecuteEmailActionDto,
  GrantEmailAuditorAccessDto,
  LabelEmailBehaviourDto,
  PromoteEmailThreatToCaseDto,
  ProposeEmailActionDto,
  RecordEmailAdjudicationDto,
  RequestEmailBackfillDto,
  RevokeEmailAccessDto,
  RollbackEmailActionDto,
  SyncEmailConnectorDto,
  VerifyEmailConnectionIntentDto,
} from './dto/email-security.dto';

/**
 * ZoikoShield Email Threat Intelligence & Assurance Controller (WF-01..WF-14).
 * Strictly enforces tenant header isolation and granular `email:*` permissions.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/email')
export class EmailSecurityController {
  constructor(
    private readonly emailService: EmailSecurityService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async buildActor(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<EmailActorContext> {
    let roleCodes: string[] = [];
    try {
      const membership =
        await this.authorizationService.getMembershipForPrincipal(
          tenantId,
          user.id,
        );
      roleCodes = membership?.roles?.map((r) => r.code) ?? [];
    } catch {
      roleCodes = [];
    }
    return {
      userId: user.id,
      email: user.email,
      roleCodes,
    };
  }

  @Get('overview')
  @RequirePermissions(PERMISSION_CODES.EMAIL_THREAT_READ)
  async getOverview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('environmentId') environmentId?: string,
    @Query('windowHours') windowHours?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getOverview(tenantId, {
      environmentId,
      windowHours: windowHours ? Number(windowHours) : undefined,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('sources/coverage')
  @RequirePermissions(PERMISSION_CODES.EMAIL_COVERAGE_READ)
  async getSourceCoverage(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getSourceCoverage(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('sources/:connectionId/health')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_VIEW)
  async getSourceHealth(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getSourceHealth(
      tenantId,
      connectionId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('connectors')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_VIEW)
  async listConnectors(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.listConnectors(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('connection-intents')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async createConnectionIntent(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmailConnectionIntentDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.createConnectionIntent(
      tenantId,
      actor,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('connection-intents/:id/verify')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async verifyConnectionIntent(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') intentId: string,
    @Body() dto: VerifyEmailConnectionIntentDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.verifyConnectionIntent(
      tenantId,
      actor,
      intentId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('connectors/:id/test')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async testConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.testConnector(
      tenantId,
      actor,
      connectionId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('connectors/:id/sync')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async syncConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
    @Body() dto: SyncEmailConnectorDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.syncConnector(
      tenantId,
      actor,
      connectionId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('connectors/:id/disconnect')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async disconnectConnector(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
    @Body() dto: DisconnectEmailConnectorDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.disconnectConnector(
      tenantId,
      actor,
      connectionId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('reconciliations')
  @RequirePermissions(PERMISSION_CODES.EMAIL_COVERAGE_READ)
  async listReconciliations(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.listReconciliations(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('backfills/:connectionId')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async requestBackfill(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: RequestEmailBackfillDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.requestBackfill(
      tenantId,
      actor,
      connectionId,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Get('threats')
  @RequirePermissions(PERMISSION_CODES.EMAIL_THREAT_READ)
  async listThreats(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('threatClass') threatClass?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.listThreats(tenantId, actor, {
      severity,
      status,
      provider,
      threatClass,
      search,
      limit: limit ? Number(limit) : undefined,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('threats/:id')
  @RequirePermissions(PERMISSION_CODES.EMAIL_THREAT_READ)
  async getThreatDetail(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') findingId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.getThreatDetail(
      tenantId,
      actor,
      findingId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('threats/:id/promote-case')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CASE_INVESTIGATE)
  async promoteThreatToCase(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') findingId: string,
    @Body() dto: PromoteEmailThreatToCaseDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.promoteThreatToCase(
      tenantId,
      actor,
      findingId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('threats/:id/adjudications')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CASE_INVESTIGATE)
  async recordAdjudication(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') findingId: string,
    @Body() dto: RecordEmailAdjudicationDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.recordAdjudication(
      tenantId,
      actor,
      findingId,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('threats/:id/ai-evaluate')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CASE_INVESTIGATE)
  async evaluateThreatWithAi(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') findingId: string,
    @Body() dto: EvaluateEmailAiDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.evaluateThreatWithAi(
      tenantId,
      actor,
      findingId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('controls/coverage')
  @RequirePermissions(PERMISSION_CODES.EMAIL_COVERAGE_READ)
  async getControlsCoverage(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getControlsCoverage(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('evidence/manifests')
  @RequirePermissions(PERMISSION_CODES.EMAIL_EVIDENCE_EXPORT)
  async listEvidenceManifests(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.listEvidenceManifests(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('evidence/exports')
  @RequirePermissions(PERMISSION_CODES.EMAIL_EVIDENCE_EXPORT)
  async buildEvidenceExport(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BuildEmailEvidenceExportDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.buildEvidenceExport(
      tenantId,
      actor,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('evidence/manifests/:id/verify')
  @RequirePermissions(PERMISSION_CODES.EMAIL_EVIDENCE_EXPORT)
  async verifyEvidenceManifest(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') manifestId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.verifyEvidenceManifest(
      tenantId,
      actor,
      manifestId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('policies')
  @RequirePermissions(PERMISSION_CODES.EMAIL_POLICY_READ)
  async listPolicies(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.listPolicies(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('policies')
  @RequirePermissions(PERMISSION_CODES.EMAIL_POLICY_MANAGE)
  async draftPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DraftEmailPolicyDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.draftPolicy(tenantId, actor, dto);
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('policies/:id/approve')
  @RequirePermissions(PERMISSION_CODES.EMAIL_POLICY_MANAGE)
  async approvePolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') policyId: string,
    @Body() dto: ApproveOrActivateEmailPolicyDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.approvePolicy(
      tenantId,
      actor,
      policyId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('policies/:id/activate')
  @RequirePermissions(PERMISSION_CODES.EMAIL_POLICY_MANAGE)
  async activatePolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') policyId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.activatePolicy(
      tenantId,
      actor,
      policyId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('policies/:id/rollback')
  @RequirePermissions(PERMISSION_CODES.EMAIL_POLICY_MANAGE)
  async rollbackPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') policyId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.rollbackPolicy(
      tenantId,
      actor,
      policyId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('behaviour/overview')
  @RequirePermissions(PERMISSION_CODES.EMAIL_THREAT_READ)
  async getBehaviourOverview(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getBehaviourOverview(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('behaviour/labels')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CASE_INVESTIGATE)
  async recordBehaviourLabel(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LabelEmailBehaviourDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.recordBehaviourLabel(
      tenantId,
      actor,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Get('analyses/:id')
  @RequirePermissions(PERMISSION_CODES.EMAIL_THREAT_READ)
  async getAnalysisDetail(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') analysisId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getAnalysisDetail(
      tenantId,
      analysisId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('analyses/:id/decision')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CASE_INVESTIGATE)
  async decideAnalysis(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') analysisId: string,
    @Body() dto: DecideEmailAnalysisDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.decideAnalysis(
      tenantId,
      actor,
      analysisId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('actions')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_PROPOSE)
  async listActions(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.listActions(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('actions/proposals')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_PROPOSE)
  async proposeAction(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProposeEmailActionDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.proposeAction(tenantId, actor, dto);
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('actions/:id/simulate')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_PROPOSE)
  async simulateAction(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.simulateAction(
      tenantId,
      actor,
      proposalId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('actions/:id/approve')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_APPROVE)
  async approveAction(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Body() dto: ApproveEmailActionDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.approveAction(
      tenantId,
      actor,
      proposalId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('actions/:id/execute')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_EXECUTE)
  async executeAction(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Body() dto?: ExecuteEmailActionDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.executeAction(
      tenantId,
      actor,
      proposalId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('actions/:id/rollback')
  @RequirePermissions(PERMISSION_CODES.EMAIL_ACTION_EXECUTE)
  async rollbackAction(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Body() dto: RollbackEmailActionDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.rollbackAction(
      tenantId,
      actor,
      proposalId,
      dto,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('settings')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_VIEW)
  async getSettingsAndGovernance(
    @Headers('x-tenant-id') headerTenantId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getSettingsAndGovernance(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('audit/verify')
  @RequirePermissions(PERMISSION_CODES.EMAIL_EVIDENCE_EXPORT)
  async verifyAuditChain(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.verifyAuditChain(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('access-grants')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async grantAuditorAccess(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantEmailAuditorAccessDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.grantAuditorAccess(
      tenantId,
      actor,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }

  @Post('revoke')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE)
  async revokeAccess(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeEmailAccessDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const actor = await this.buildActor(tenantId, user);
    const data = await this.emailService.revokeAccess(tenantId, actor, dto);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('privacy/inventory')
  @RequirePermissions(PERMISSION_CODES.EMAIL_CONNECTOR_VIEW)
  async getPrivacyInventory(@Headers('x-tenant-id') headerTenantId: string) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.emailService.getPrivacyInventory(tenantId);
    return { statusCode: HttpStatus.OK, data };
  }
}
