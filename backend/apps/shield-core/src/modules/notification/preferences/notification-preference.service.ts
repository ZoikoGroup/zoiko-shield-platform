import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async setPreference(params: {
    tenantId: string;
    principalId: string;
    notificationPolicyId: string;
    channel: string;
    enabled: boolean;
    quietHours?: string;
    locale?: string;
  }) {
    return this.prisma.notificationPreference.upsert({
      where: {
        tenant_id_principal_id_notification_policy_id_channel: {
          tenant_id: params.tenantId,
          principal_id: params.principalId,
          notification_policy_id: params.notificationPolicyId,
          channel: params.channel,
        },
      },
      create: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        principal_id: params.principalId,
        notification_policy_id: params.notificationPolicyId,
        channel: params.channel,
        enabled: params.enabled,
        quiet_hours: params.quietHours,
        locale: params.locale,
      },
      update: {
        enabled: params.enabled,
        quiet_hours: params.quietHours,
        locale: params.locale,
      },
    });
  }

  /** User preference can never suppress a mandatory NotificationPolicy — resolved here, not left to the caller to remember (spec §15). */
  async resolveDeliveryDecision(params: {
    tenantId: string;
    principalId: string;
    policy: { id: string; mandatory: boolean };
  }): Promise<{ shouldDeliver: boolean; reason: string }> {
    if (params.policy.mandatory) {
      return {
        shouldDeliver: true,
        reason: 'Policy is mandatory — preference cannot suppress it',
      };
    }
    const preference = await this.prisma.notificationPreference.findFirst({
      where: {
        tenant_id: params.tenantId,
        principal_id: params.principalId,
        notification_policy_id: params.policy.id,
      },
    });
    if (!preference) {
      return {
        shouldDeliver: true,
        reason: 'No preference recorded — defaults to enabled',
      };
    }
    return {
      shouldDeliver: preference.enabled,
      reason: preference.enabled
        ? 'Preference enabled'
        : 'Preference disabled by recipient',
    };
  }
}
