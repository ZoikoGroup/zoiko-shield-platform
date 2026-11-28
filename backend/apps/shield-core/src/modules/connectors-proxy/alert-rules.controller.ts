import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { requireTenantId } from '../../tenant-context';
import {
  AlertConditionDto,
  CreateAlertRuleDto,
  PreviewAlertRuleDto,
  SetAlertRuleEnabledDto,
  UpdateAlertRuleDto,
} from './alert-rules.dto';

/** What the browser sees of a rule: no internal columns, conditions already parsed. */
export function toAlertRuleView(rule: any) {
  let def: any = {};
  try {
    def = JSON.parse(rule.condition_definition ?? '{}');
  } catch {
    /* a rule that cannot be read is shown without conditions */
  }
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    severity: rule.severity,
    enabled: rule.status === 'ACTIVE',
    conditions: Array.isArray(def.conditions) ? def.conditions : [],
    threshold: def.ruleType === 'THRESHOLD' ? (def.threshold ?? null) : null,
    windowMinutes:
      def.ruleType === 'THRESHOLD' ? (def.windowMinutes ?? null) : null,
    version: rule.current_version,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  };
}

/**
 * A threshold needs both numbers, a plain match needs neither. Anything else is a
 * rule that would not do what its author expects, so it is refused.
 */
export function buildDefinition(input: {
  conditions: AlertConditionDto[];
  threshold?: number;
  windowMinutes?: number;
}) {
  const hasT = input.threshold !== undefined;
  const hasW = input.windowMinutes !== undefined;
  if (hasT !== hasW) {
    throw new BadRequestException(
      'Set both "threshold" and "windowMinutes", or neither.',
    );
  }
  return {
    ruleType: hasT ? 'THRESHOLD' : 'MATCH',
    conditions: input.conditions.map(({ field, operator, value }) => ({
      field,
      operator,
      value,
    })),
    ...(hasT
      ? { threshold: input.threshold, windowMinutes: input.windowMinutes }
      : {}),
  };
}

/**
 * Alert rules a tenant administrator defines for their own workspace.
 *
 * A rule is "when an event matches these conditions, raise an alert of this
 * severity". Core owns the contract: the tenant always comes from the signed-in
 * session, only whitelisted fields and operators are accepted, and a tenant can
 * only ever see or change rules it created (never the shared platform rules).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/alert-rules')
export class AlertRulesController {
  constructor(private readonly ingest: ShieldIngestClient) {}

  /** Owned by this tenant; a rule from any other tenant, or a shared one, is never returned. */
  private async owned(tenantId: string, id: string) {
    const { data } = await this.ingest.listAlertRules(tenantId);
    const rule = (data ?? []).find(
      (r: any) => r.id === id && r.tenant_id === tenantId,
    );
    if (!rule) throw new NotFoundException('Alert rule not found');
    return rule;
  }

  @Get()
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const { data } = await this.ingest.listAlertRules(tenantId);
    return {
      data: (data ?? [])
        .filter((r: any) => r.tenant_id === tenantId)
        .map(toAlertRuleView),
    };
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async preview(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewAlertRuleDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    return this.ingest.previewAlertRule(tenantId, {
      conditionDefinition: buildDefinition({ conditions: dto.conditions }),
      limit: dto.limit,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAlertRuleDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const definition = buildDefinition(dto);
    const { data } = await this.ingest.createAlertRule(tenantId, {
      tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      severity: dto.severity,
      ruleType: definition.ruleType,
      conditionDefinition: definition,
      createdBy: user?.id,
    });
    return { data: toAlertRuleView(data) };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async update(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const existing = toAlertRuleView(await this.owned(tenantId, id));

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined)
      patch.description = dto.description.trim();
    if (dto.severity !== undefined) patch.severity = dto.severity;

    const touchesCondition =
      dto.conditions !== undefined ||
      dto.threshold !== undefined ||
      dto.windowMinutes !== undefined;
    if (touchesCondition) {
      patch.conditionDefinition = buildDefinition({
        conditions: dto.conditions ?? existing.conditions,
        threshold: dto.threshold ?? existing.threshold ?? undefined,
        windowMinutes: dto.windowMinutes ?? existing.windowMinutes ?? undefined,
      });
    }
    const { data } = await this.ingest.updateAlertRule(tenantId, id, patch);
    return { data: toAlertRuleView(data) };
  }

  @Post(':id/enabled')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async setEnabled(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetAlertRuleEnabledDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    await this.owned(tenantId, id);
    const { data } = await this.ingest.setAlertRuleEnabled(
      tenantId,
      id,
      dto.enabled,
    );
    return { data: toAlertRuleView(data) };
  }
}
