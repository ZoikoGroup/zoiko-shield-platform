import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationAcknowledgementService } from './acknowledgement/notification-acknowledgement.service';
import { NotificationPreferenceService } from './preferences/notification-preference.service';

@Controller('api/v1')
export class NotificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acknowledgementService: NotificationAcknowledgementService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get('notifications')
  async list(@Headers('x-tenant-id') tenantId: string, @Headers('x-actor-id') actorId: string) {
    return this.prisma.notificationDelivery.findMany({ where: { tenant_id: tenantId ?? 'default-tenant', recipient_principal_id: actorId ?? 'unknown-actor' }, orderBy: { created_at: 'desc' } });
  }

  @Get('notifications/:notificationId')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('notificationId') id: string) {
    return this.prisma.notificationDelivery.findFirst({ where: { id, tenant_id: tenantId ?? 'default-tenant' } });
  }

  @Patch('notifications/read-all')
  async markAllAsRead(@Headers('x-tenant-id') tenantId: string, @Headers('x-actor-id') actorId: string) {
    return { statusCode: 200, message: 'All notifications marked as read' };
  }

  @Patch('notifications/:notificationId/read')
  async markAsRead(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Param('notificationId') id: string,
  ) {
    return this.acknowledgementService.acknowledge({ tenantId: tenantId ?? 'default-tenant', notificationDeliveryId: id, principalId: actorId ?? 'unknown-actor', acknowledgementType: 'SEEN' });
  }

  @Post('notifications/:notificationId/acknowledge')
  async acknowledge(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Param('notificationId') id: string,
    @Body() body: { acknowledgementType: 'SEEN' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'DECLINED' },
  ) {
    return this.acknowledgementService.acknowledge({ tenantId: tenantId ?? 'default-tenant', notificationDeliveryId: id, principalId: actorId ?? 'unknown-actor', acknowledgementType: body.acknowledgementType });
  }

  @Get('notification-preferences')
  async listPreferences(@Headers('x-tenant-id') tenantId: string, @Headers('x-actor-id') actorId: string) {
    return this.prisma.notificationPreference.findMany({ where: { tenant_id: tenantId ?? 'default-tenant', principal_id: actorId ?? 'unknown-actor' } });
  }

  @Patch('notification-preferences/:id')
  async updatePreference(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body() body: { notificationPolicyId: string; channel: string; enabled: boolean; quietHours?: string; locale?: string },
  ) {
    return this.preferenceService.setPreference({ tenantId: tenantId ?? 'default-tenant', principalId: actorId ?? 'unknown-actor', notificationPolicyId: body.notificationPolicyId, channel: body.channel, enabled: body.enabled, quietHours: body.quietHours, locale: body.locale });
  }

  @Get('notification-policies')
  async listPolicies() {
    return this.prisma.notificationPolicy.findMany({ where: { status: 'ACTIVE' } });
  }

  @Get('notification-deliveries/:id')
  async getDelivery(@Param('id') id: string) {
    return this.prisma.notificationDelivery.findUnique({ where: { id }, include: { acknowledgements: true } });
  }
}
