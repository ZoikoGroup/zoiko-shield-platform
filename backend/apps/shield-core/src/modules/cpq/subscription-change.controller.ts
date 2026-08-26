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
import { IsDefined, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  ConcessionService,
  DecideConcessionDto,
  RequestConcessionDto,
} from './concession.service';
import {
  RecordDowngradeRemediationDto,
  RequestDowngradeDto,
  RequestUpgradeDto,
  SubscriptionService,
  VerifyUpgradeReadinessDto,
} from './subscription.service';
import { HumanAuthorityAttestationDto } from '../human-authority/human-authority.dto';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';
import { IsISO8601 } from 'class-validator';

export class ScheduleAmendmentDto {
  @IsISO8601()
  scheduledAt!: Date;
}

export class DecideSubscriptionChangeDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/cpq/subscriptions')
export class TenantSubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  private boundary(headerTenantId: string, user: AuthenticatedUser) {
    return {
      tenantId: requireTenantId(headerTenantId),
      environmentId: requireEnvironmentId(user.environmentId),
    };
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const subscription = await this.subscriptions.getSubscriptionForTenant(
      id,
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Post(':id/upgrades')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestUpgrade(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestUpgradeDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.requestUpgrade(
      id,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: amendment };
  }

  @Post(':id/downgrades')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async requestDowngrade(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestDowngradeDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.requestDowngrade(
      id,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.CREATED, data: amendment };
  }

  @Get('amendments/:amendmentId')
  async getAmendment(
    @Param('amendmentId') amendmentId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.getAmendmentForTenant(
      amendmentId,
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }

  @Patch('amendments/:amendmentId/decision')
  @UseGuards(HumanAuthorityGuard)
  @RequireHumanAuthority(
    'CONTRACT_CHANGE_AUTHORIZATION',
    'CommercialAmendment',
    'amendmentId',
  )
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideAmendment(
    @Param('amendmentId') amendmentId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideSubscriptionChangeDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.decideAmendment(
      amendmentId,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto.decision,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }

  @Patch('amendments/:amendmentId/remediation')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async recordRemediation(
    @Param('amendmentId') amendmentId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordDowngradeRemediationDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.recordDowngradeRemediation(
      amendmentId,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }

  @Post('amendments/:amendmentId/schedule')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async scheduleAmendment(
    @Param('amendmentId') amendmentId: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScheduleAmendmentDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendment = await this.subscriptions.scheduleAmendment(
      amendmentId,
      boundary.tenantId,
      boundary.environmentId,
      user.id,
      new Date(dto.scheduledAt),
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }

  @Get(':id/amendments')
  async listAmendments(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    const amendments = await this.subscriptions.listAmendmentsForTenant(
      id,
      boundary.tenantId,
      boundary.environmentId,
    );
    return { statusCode: HttpStatus.OK, data: amendments };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(
  PERMISSION_CODES.PLATFORM_COMMERCIAL_READINESS_VERIFY,
)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/cpq/subscriptions')
export class PlatformSubscriptionChangeController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    const subscription = await this.subscriptions.activateSubscription(id);
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    const subscription = await this.subscriptions.cancelSubscription(id);
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Patch('amendments/:amendmentId/readiness')
  async verifyReadiness(
    @Param('amendmentId') amendmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyUpgradeReadinessDto,
  ) {
    const amendment = await this.subscriptions.verifyUpgradeReadiness(
      amendmentId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }

  @Post('amendments/:amendmentId/apply')
  async apply(
    @Param('amendmentId') amendmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const amendment = await this.subscriptions.applyAmendment(
      amendmentId,
      user.id,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CONCESSION_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/commercial/concessions')
export class CommercialConcessionController {
  constructor(private readonly concessions: ConcessionService) {}

  @Post()
  async request(
    @Body() dto: RequestConcessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const concession = await this.concessions.requestConcession(dto, user.id);
    return { statusCode: HttpStatus.CREATED, data: concession };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.concessions.getConcession(id),
    };
  }

  @Patch(':id/decision')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CONCESSION_APPROVE)
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideConcessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const concession = await this.concessions.decideConcession(
      id,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: concession };
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const concession = await this.concessions.activateConcession(id, user.id);
    return { statusCode: HttpStatus.OK, data: concession };
  }

  @Get()
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CONCESSION_MANAGE)
  async list() {
    const concessions = await this.concessions.listConcessions();
    return { statusCode: HttpStatus.OK, data: concessions };
  }
}
