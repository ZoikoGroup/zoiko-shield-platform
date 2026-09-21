import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { ShieldAiClient } from '../../internal-client/shield-ai.client';
import { requireTenantId } from '../../tenant-context';

/**
 * ZS-ENG-AI-001 & Governance Runbook: User-Facing AI Gateway Proxy Controller
 * Bridges authenticated browser requests (JWT) to workload-token-protected shield-ai.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/ai')
export class AiProxyController {
  constructor(private readonly shieldAiClient: ShieldAiClient) {}

  // ==========================================
  // AI Incidents Console Endpoints
  // ==========================================
  @Post('incidents')
  async declareIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const actorId = user?.id || 'usr-anonymous';
    return this.shieldAiClient.declareIncident(tenantId, actorId, dto);
  }

  @Get('incidents')
  async listIncidents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.listIncidents(tenantId, {
      status,
      severity,
      category,
    });
  }

  @Get('incidents/metrics')
  async getIncidentMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.getIncidentMetrics(tenantId);
  }

  @Get('incidents/:id')
  async getIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.getIncident(tenantId, id);
  }

  @Post('incidents/:id/contain')
  async containIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.containIncident(tenantId, id, dto);
  }

  @Post('incidents/:id/fallback')
  async fallbackIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.fallbackIncident(tenantId, id, dto);
  }

  @Post('incidents/:id/rca')
  async rcaIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.rcaIncident(tenantId, id, dto);
  }

  @Post('incidents/:id/resolve')
  async resolveIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.resolveIncident(tenantId, id, dto);
  }

  @Post('incidents/:id/close')
  async closeIncident(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.closeIncident(tenantId, id, dto);
  }

  // ==========================================
  // AI Decision Rights Endpoints
  // ==========================================
  @Get('decisions')
  async listDecisions(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('state') state?: string,
    @Query('useCase') useCase?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.listDecisions(tenantId, { state, useCase });
  }

  @Get('decisions/:envelopeId')
  async getDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('envelopeId') envelopeId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.getDecision(tenantId, envelopeId);
  }

  @Post('decisions/:envelopeId/accept')
  async acceptDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.acceptDecision(tenantId, envelopeId, {
      ...dto,
      decidedBy: dto.decidedBy || user?.id,
    });
  }

  @Post('decisions/:envelopeId/modify')
  async modifyDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.modifyDecision(tenantId, envelopeId, {
      ...dto,
      decidedBy: dto.decidedBy || user?.id,
    });
  }

  @Post('decisions/:envelopeId/reject')
  async rejectDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.rejectDecision(tenantId, envelopeId, {
      ...dto,
      decidedBy: dto.decidedBy || user?.id,
    });
  }

  @Post('decisions/:envelopeId/escalate')
  async escalateDecision(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.escalateDecision(tenantId, envelopeId, {
      ...dto,
      decidedBy: dto.decidedBy || user?.id,
    });
  }

  // ==========================================
  // AI System Inventory & Governance Views
  // ==========================================
  @Get('inventory')
  async getInventory() {
    return this.shieldAiClient.getInventory();
  }

  @Post('inventory')
  async registerAiModel(@Body() dto: any) {
    return this.shieldAiClient.registerAiModel(dto);
  }

  @Get('inventory/:modelId')
  async getAiModel(@Param('modelId') modelId: string) {
    return this.shieldAiClient.getAiModel(modelId);
  }

  @Patch('inventory/:modelId')
  async updateAiModel(@Param('modelId') modelId: string, @Body() dto: any) {
    return this.shieldAiClient.updateAiModel(modelId, dto);
  }

  @Delete('inventory/:modelId')
  async deleteAiModel(@Param('modelId') modelId: string) {
    return this.shieldAiClient.deleteAiModel(modelId);
  }

  @Get('supply-chain')
  async getSupplyChain() {
    return this.shieldAiClient.getSupplyChain();
  }

  @Get('finops/budget')
  async getFinOpsBudget(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.getFinOpsBudget(tenantId);
  }

  @Get('drift')
  async getDrift(
    @Query('modelId') modelId?: string,
    @Query('minSampleSize') minSampleSize?: string,
  ) {
    return this.shieldAiClient.getDrift(
      modelId,
      minSampleSize ? parseInt(minSampleSize, 10) : 10,
    );
  }

  @Post('drift/evaluate')
  async enforceDrift(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { modelId: string; minSampleSize?: number },
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.enforceDrift(
      body.modelId,
      tenantId,
      body.minSampleSize || 10,
    );
  }

  // ==========================================
  // AI Red-Team, Threat Hunting & RCA
  // ==========================================
  @Post('red-team/simulate-scenario')
  async simulateRedTeamScenario(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.simulateRedTeamScenario({ ...dto, tenantId });
  }

  @Post('red-team/execute-chain')
  async executeRedTeamChain(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.executeRedTeamChain({ ...dto, tenantId });
  }

  @Post('copilot/hunt')
  async copilotHunt(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.copilotHunt({
      ...dto,
      tenantId,
      analystId: user?.id,
    });
  }

  @Post('threat-hunting/hunt')
  async threatHuntingHunt(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.threatHuntingHunt({
      ...dto,
      tenantId,
      analystId: user?.id,
    });
  }

  @Post('rca/generate')
  async generateIncidentRca(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: any,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.shieldAiClient.generateIncidentRca({ ...dto, tenantId });
  }
}
