import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  ActivateAiGovernanceProfileDto,
  AiGovernanceProfileService,
  CreateAiGovernanceProfileDto,
  DecideAiGovernanceProfileDto,
} from './ai-governance-profile.service';
import {
  AiProviderCostService,
  RecordAiProviderCostEventDto,
} from './ai-provider-cost.service';
import { AiBudgetService, SetBudgetDto } from './ai-budget.service';
import {
  AiUsageService,
  MarkAiUsageBillableDto,
  RecordAiUsageDto,
} from './ai-usage.service';
import {
  EvaluateNoLlmContinuityDto,
  NoLlmContinuityService,
} from './no-llm-continuity.service';

function boundary(headerTenantId: string, user: AuthenticatedUser) {
  return {
    tenantId: requireTenantId(headerTenantId, user.tenantId),
    environmentId: requireEnvironmentId(user.environmentId),
  };
}

/** AI usage is written by shield-ai after all runtime policy checks. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/usage')
export class AiUsageController {
  constructor(private readonly usageService: AiUsageService) {}

  @Post()
  async record(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @Body() dto: RecordAiUsageDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const environmentId = requireEnvironmentId(
      headerEnvironmentId,
      dto.environmentId,
    );
    const usage = await this.usageService.recordUsage({
      ...dto,
      tenantId,
      environmentId,
    });
    return { statusCode: HttpStatus.CREATED, data: usage };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @Param('id') id: string,
  ) {
    const usage = await this.usageService.getUsageById(
      requireTenantId(headerTenantId),
      requireEnvironmentId(headerEnvironmentId),
      id,
    );
    return { statusCode: HttpStatus.OK, data: usage };
  }

  @Patch(':id/mark-billable')
  async markBillable(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @Param('id') id: string,
    @Body() dto: MarkAiUsageBillableDto,
  ) {
    const usage = await this.usageService.markBillable(
      requireTenantId(headerTenantId),
      requireEnvironmentId(headerEnvironmentId),
      id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: usage };
  }
}

@UseGuards(InternalAuthGuard)
@Controller('internal/v1/ai/provider-cost-events')
export class InternalAiProviderCostController {
  constructor(private readonly costs: AiProviderCostService) {}

  @Post()
  async record(@Body() dto: RecordAiProviderCostEventDto) {
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.costs.record(dto),
    };
  }

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.costs.list(
        requireTenantId(headerTenantId),
        requireEnvironmentId(headerEnvironmentId),
      ),
    };
  }
}

@UseGuards(InternalAuthGuard)
@Controller('internal/v1/no-llm-continuity')
export class InternalNoLlmContinuityController {
  constructor(private readonly continuity: NoLlmContinuityService) {}

  @Post('evaluate')
  async evaluate(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') headerEnvironmentId: string,
    @Body() dto: EvaluateNoLlmContinuityDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, dto.tenantId);
    const environmentId = requireEnvironmentId(
      headerEnvironmentId,
      dto.environmentId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: await this.continuity.evaluate({
        ...dto,
        tenantId,
        environmentId,
      }),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_READ)
@Controller('api/v1/ai/governance/profiles')
export class AiGovernanceProfileController {
  constructor(
    private readonly profiles: AiGovernanceProfileService,
    private readonly usage: AiUsageService,
  ) {}

  @Get()
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.profiles.list(scope.tenantId, scope.environmentId),
    };
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAiGovernanceProfileDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.profiles.create(
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get(':id')
  async get(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.profiles.get(id, scope.tenantId, scope.environmentId),
    };
  }

  @Get(':id/visibility')
  async visibility(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.usage.visibility(
        scope.tenantId,
        scope.environmentId,
        id,
      ),
    };
  }

  @Patch(':id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decide(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideAiGovernanceProfileDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.profiles.decide(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async activate(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ActivateAiGovernanceProfileDto,
  ) {
    const scope = boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.profiles.activate(
        id,
        scope.tenantId,
        scope.environmentId,
        user.id,
        dto,
      ),
    };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_READ)
@Controller('api/v1/ai/budgets')
export class AiBudgetController {
  constructor(private readonly budgetService: AiBudgetService) {}

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_AI_GOVERNANCE_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async setBudget(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetBudgetDto,
  ) {
    const scope = boundary(headerTenantId, user);
    const budget = await this.budgetService.setBudget({
      ...dto,
      tenantId: scope.tenantId,
      environmentId: scope.environmentId,
    });
    return { statusCode: HttpStatus.CREATED, data: budget };
  }

  @Get('over-budget')
  async isOverBudget(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = boundary(headerTenantId, user);
    const overBudget = await this.budgetService.isOverBudget(
      scope.tenantId,
      scope.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: { ...scope, overBudget } };
  }
}
