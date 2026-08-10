import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

/** Delivery != acknowledgement, and SEEN != APPROVED — never conflated (spec §19). */
@Injectable()
export class NotificationAcknowledgementService {
  constructor(private readonly prisma: PrismaService) {}

  async acknowledge(params: { tenantId: string; notificationDeliveryId: string; principalId: string; acknowledgementType: 'SEEN' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'DECLINED'; correlationId?: string }) {
    const delivery = await this.prisma.notificationDelivery.findFirst({ where: { id: params.notificationDeliveryId, tenant_id: params.tenantId } });
    if (!delivery) {
      throw new NotFoundException(`NotificationDelivery '${params.notificationDeliveryId}' not found`);
    }
    if (delivery.recipient_principal_id !== params.principalId) {
      throw new ForbiddenException('Only the recipient of a notification may acknowledge it');
    }
    return this.prisma.notificationAcknowledgement.create({
      data: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        notification_delivery_id: delivery.id,
        principal_id: params.principalId,
        acknowledgement_type: params.acknowledgementType,
        correlation_id: params.correlationId ?? randomUUID(),
      },
    });
  }
}
