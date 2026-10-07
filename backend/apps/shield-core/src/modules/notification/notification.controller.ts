import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
import * as crypto from 'crypto';
import {
  ProductionEmailTemplateEngine,
  EMAIL_TEMPLATE_DOMAINS,
  EmailRenderInput,
} from './templates/production-email-template.engine';
import { EmailChannelService } from './channels/email-channel.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class NotificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acknowledgementService: NotificationAcknowledgementService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateEngine: ProductionEmailTemplateEngine,
    private readonly emailChannel: EmailChannelService,
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

  @Get('notifications/templates')
  async listTemplates(@Query('domain') domain?: string) {
    return {
      domains: EMAIL_TEMPLATE_DOMAINS,
      totalCount: 226,
      templates: this.templateEngine.listTemplates(domain),
    };
  }

  @Post('notifications/templates/:templateId/preview')
  async previewTemplate(
    @Param('templateId') templateId: string,
    @Body() customVariables?: Partial<EmailRenderInput>,
  ) {
    const defaultInput: EmailRenderInput = {
      templateId,
      recipientFirstName: customVariables?.recipientFirstName || 'Alex',
      organizationName:
        customVariables?.organizationName || 'Acme Cybersecurity Corp',
      referenceId:
        customVariables?.referenceId || `ref-${Date.now().toString(36)}`,
      statusLabel: customVariables?.statusLabel || 'ACTIVE',
      occurredAtLocal:
        customVariables?.occurredAtLocal || new Date().toLocaleString(),
      timezone: customVariables?.timezone || 'UTC+0',
      actionUrl:
        customVariables?.actionUrl || 'https://app.zoikoshield.com/actions',
      accountSecurityUrl:
        customVariables?.accountSecurityUrl ||
        'https://app.zoikoshield.com/admin',
      auditUrl:
        customVariables?.auditUrl || 'https://app.zoikoshield.com/ledger',
      billingUrl:
        customVariables?.billingUrl || 'https://app.zoikoshield.com/pricing',
      supportUrl:
        customVariables?.supportUrl || 'https://app.zoikoshield.com/services',
      onboardingUrl:
        customVariables?.onboardingUrl ||
        'https://app.zoikoshield.com/onboarding',
      developerUrl:
        customVariables?.developerUrl ||
        'https://app.zoikoshield.com/developer',
      governanceUrl:
        customVariables?.governanceUrl ||
        'https://app.zoikoshield.com/ai-governance',
      verificationUrl:
        customVariables?.verificationUrl ||
        'https://app.zoikoshield.com/verify-certificate',
      passwordResetUrl:
        customVariables?.passwordResetUrl ||
        'https://app.zoikoshield.com/login',
      tokenExpiresAtLocal: customVariables?.tokenExpiresAtLocal || '24 hours',
      ...customVariables,
    };

    return this.templateEngine.render(defaultInput);
  }

  @Post('notifications/templates/:templateId/send-test')
  async sendTestNotification(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
    @Body()
    body: { recipientEmail?: string; variables?: Partial<EmailRenderInput> },
  ) {
    const validTenantId = requireTenantId(tenantId);
    const recipientEmail =
      body.recipientEmail || user.email || 'operator@zoikoshield.corp';
    const recipientName =
      body.variables?.recipientFirstName ||
      (user.email ? user.email.split('@')[0] : 'Security Operator');

    const renderInput: EmailRenderInput = {
      templateId,
      recipientFirstName: recipientName,
      organizationName:
        body.variables?.organizationName || 'Zoiko Shield Sovereign Tenant',
      referenceId:
        body.variables?.referenceId || `test-${Date.now().toString(36)}`,
      statusLabel: body.variables?.statusLabel || 'TEST_VERIFIED',
      occurredAtLocal:
        body.variables?.occurredAtLocal || new Date().toLocaleString(),
      timezone: body.variables?.timezone || 'UTC',
      ...body.variables,
    };

    const rendered = this.templateEngine.render(renderInput);

    // Dispatch via email channel
    const sendResult = await this.emailChannel.send({
      recipientPrincipalId: recipientEmail,
      subject: rendered.subject,
      body: rendered.htmlBody,
    });

    // Resolve or find default policy for audit tracking
    const activePolicy = await this.prisma.notificationPolicy.findFirst({
      where: { status: 'ACTIVE' },
    });
    const policyId = activePolicy?.id ?? '00000000-0000-0000-0000-000000000001';
    const policyVersion = activePolicy?.version ?? 1;

    // Record delivery audit
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: validTenantId,
        recipient_principal_id: user.id,
        event_id: `evt-${Date.now()}`,
        policy_id: policyId,
        policy_version: policyVersion,
        template_version: 2,
        correlation_id: crypto.randomUUID(),
        channel: 'EMAIL',
        status: sendResult.delivered ? 'DELIVERED' : 'FAILED',
        first_attempt_at: new Date(),
        last_attempt_at: new Date(),
        attempt_count: 1,
        delivered_at: sendResult.delivered ? new Date() : null,
      },
    });

    return {
      deliveryId: delivery.id,
      recipient: recipientEmail,
      renderHash: rendered.renderHash,
      templateId: rendered.templateId,
      status: delivery.status,
    };
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
