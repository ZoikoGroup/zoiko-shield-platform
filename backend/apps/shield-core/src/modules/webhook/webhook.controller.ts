import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookSubscriptionService } from './subscriptions/webhook-subscription.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';
import { WebhookReplayService } from './replay/webhook-replay.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/webhooks')
export class WebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: WebhookSubscriptionService,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly replayService: WebhookReplayService,
  ) {}

  @Post()
  async create(@Headers('x-tenant-id') tenantId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: { endpointUrl: string; eventTypes: string[]; apiClientId?: string }) {
    return this.subscriptionService.create({ tenantId: requireTenantId(tenantId), createdBy: user.id, endpointUrl: body.endpointUrl, eventTypes: body.eventTypes, apiClientId: body.apiClientId });
  }

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.prisma.outboundWebhookSubscription.findMany({ where: { tenant_id: requireTenantId(tenantId) } });
  }

  @Get(':id')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.subscriptionService.assertTenantOwnership(requireTenantId(tenantId), id);
  }

  @Patch(':id')
  async patch(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string, @Body() body: { status?: string }) {
    if (body.status === 'SUSPENDED') return this.subscriptionService.suspend(requireTenantId(tenantId), id);
    return this.subscriptionService.assertTenantOwnership(requireTenantId(tenantId), id);
  }

  @Delete(':id')
  async remove(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.prisma.outboundWebhookSubscription.update({ where: { id }, data: { status: 'REVOKED' } });
  }

  @Post(':id/test')
  async test(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    await this.subscriptionService.assertTenantOwnership(requireTenantId(tenantId), id);
    // Synthetic, clearly-marked test=true payload, non-sensitive (spec §54) — never a real production event ID.
    await this.deliveryService.deliver({ tenantId: requireTenantId(tenantId), webhookSubscriptionId: id, eventId: `test_${randomUUID()}`, eventType: 'test.event.v1', data: { synthetic: true }, test: true });
    return { queued: true };
  }

  @Post(':id/rotate-secret')
  async rotateSecret(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.subscriptionService.rotateSecret(requireTenantId(tenantId), id);
  }

  @Get(':id/deliveries')
  async listDeliveries(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.prisma.webhookDelivery.findMany({ where: { tenant_id: requireTenantId(tenantId), webhook_subscription_id: id }, orderBy: { created_at: 'desc' }, take: 100 });
  }

  @Get(':id/deliveries/:deliveryId')
  async getDelivery(@Headers('x-tenant-id') tenantId: string, @Param('deliveryId') deliveryId: string) {
    return this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, tenant_id: requireTenantId(tenantId) }, include: { attempts: true } });
  }

  @Post(':id/deliveries/:deliveryId/replay')
  async replay(@Headers('x-tenant-id') tenantId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('deliveryId') deliveryId: string) {
    return this.replayService.replay(requireTenantId(tenantId), id, deliveryId, user.id);
  }
}
