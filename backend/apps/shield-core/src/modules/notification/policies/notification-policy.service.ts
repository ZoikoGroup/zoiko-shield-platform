import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreatePolicyInput {
  key: string;
  eventType: string;
  audienceType: string;
  severity?: string;
  mandatory?: boolean;
  allowedChannels: string[];
  acknowledgementRequired?: boolean;
  escalationPolicy?: string;
}

@Injectable()
export class NotificationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePolicyInput) {
    return this.prisma.notificationPolicy.create({
      data: {
        id: randomUUID(),
        key: input.key,
        event_type: input.eventType,
        audience_type: input.audienceType,
        severity: input.severity,
        mandatory: input.mandatory ?? false,
        allowed_channels: JSON.stringify(input.allowedChannels),
        acknowledgement_required: input.acknowledgementRequired ?? false,
        escalation_policy: input.escalationPolicy,
        status: 'ACTIVE',
      },
    });
  }

  async getByEventType(eventType: string) {
    return this.prisma.notificationPolicy.findMany({ where: { event_type: eventType, status: 'ACTIVE' } });
  }

  async getById(policyId: string) {
    const policy = await this.prisma.notificationPolicy.findUnique({ where: { id: policyId } });
    if (!policy) {
      throw new NotFoundException(`NotificationPolicy '${policyId}' not found`);
    }
    return policy;
  }
}
