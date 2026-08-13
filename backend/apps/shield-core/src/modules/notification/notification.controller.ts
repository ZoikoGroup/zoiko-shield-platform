import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationAcknowledgementService } from './acknowledgement/notification-acknowledgement.service';
import { NotificationPreferenceService } from './preferences/notification-preference.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class NotificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acknowledgementService: NotificationAcknowledgementService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get('notifications')
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.notificationDelivery.findMany({
      where: {
        tenant_id: requireTenantId(tenantId),
        recipient_principal_id: user.id,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  @Get('notifications/:notificationId')
  async getById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('notificationId') id: string,
  ) {
    return this.prisma.notificationDelivery.findFirst({
      where: { id, tenant_id: requireTenantId(tenantId) },
    });
  }

  @Post('notifications/:notificationId/acknowledge')
  async acknowledge(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId') id: string,
    @Body()
    body: {
      acknowledgementType: 'SEEN' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'DECLINED';
    },
  ) {
    return this.acknowledgementService.acknowledge({
      tenantId: requireTenantId(tenantId),
      notificationDeliveryId: id,
      principalId: user.id,
      acknowledgementType: body.acknowledgementType,
    });
  }

  @Get('notification-preferences')
  async listPreferences(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.notificationPreference.findMany({
      where: { tenant_id: requireTenantId(tenantId), principal_id: user.id },
    });
  }

  @Patch('notification-preferences/:id')
  async updatePreference(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      notificationPolicyId: string;
      channel: string;
      enabled: boolean;
      quietHours?: string;
      locale?: string;
    },
  ) {
    if (body.notificationPolicyId && body.notificationPolicyId !== id) {
      throw new BadRequestException(
        'Path and body notification policy identifiers conflict',
      );
    }
    return this.preferenceService.setPreference({
      tenantId: requireTenantId(tenantId),
      principalId: user.id,
      notificationPolicyId: id,
      channel: body.channel,
      enabled: body.enabled,
      quietHours: body.quietHours,
      locale: body.locale,
    });
  }

  @Get('notification-policies')
  async listPolicies() {
    return this.prisma.notificationPolicy.findMany({
      where: { status: 'ACTIVE' },
    });
  }

  @Get('notification-deliveries/:id')
  async getDelivery(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.prisma.notificationDelivery.findFirst({
      where: { id, tenant_id: requireTenantId(tenantId) },
      include: { acknowledgements: true },
    });
  }
}
