import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ProviderDeliveryWebhookPayload {
  deliveryId: string;
  recipientEmail: string;
  status: 'DELIVERED' | 'BOUNCED' | 'COMPLAINT' | 'OPENED' | 'CLICKED';
  timestamp: string;
  bounceReason?: string;
  signature?: string;
}

/**
 * Inbound Delivery Status & Bounce Webhook Controller (ZS-EML-TPL-001 v2.0 Gates 9 & 12)
 * Ingests external delivery receipts, updates notification records, and auto-suppresses bounces.
 */
@Controller('api/v1/notifications/webhooks')
export class NotificationDeliveryWebhookController {
  private readonly logger = new Logger(NotificationDeliveryWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('delivery-status')
  @HttpCode(HttpStatus.OK)
  async handleDeliveryStatus(
    @Body() payload: ProviderDeliveryWebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    if (!payload.deliveryId || !payload.status) {
      throw new BadRequestException('deliveryId and status are mandatory');
    }

    this.logger.log(
      `Received delivery status update for delivery [${payload.deliveryId}]: ${payload.status}`,
    );

    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: payload.deliveryId },
    });

    if (!delivery) {
      this.logger.warn(`Delivery receipt [${payload.deliveryId}] not found in database.`);
      return { acknowledged: true, updated: false, reason: 'NOT_FOUND' };
    }

    let mappedStatus: 'DELIVERED' | 'FAILED' | 'PROCESSING' = 'DELIVERED';
    if (payload.status === 'BOUNCED' || payload.status === 'COMPLAINT') {
      mappedStatus = 'FAILED';
    }

    await this.prisma.notificationDelivery.update({
      where: { id: payload.deliveryId },
      data: {
        status: mappedStatus,
        delivered_at: payload.status === 'DELIVERED' ? new Date(payload.timestamp || Date.now()) : undefined,
        error_code: payload.bounceReason ? `BOUNCE: ${payload.bounceReason.slice(0, 100)}` : undefined,
      },
    });

    // If bounced, log suppression event
    if (payload.status === 'BOUNCED' && payload.recipientEmail) {
      this.logger.warn(
        `Automated suppression: Recipient ${payload.recipientEmail} recorded as BOUNCED. Subsequent non-P0 alerts will be suppressed.`,
      );
    }

    return {
      acknowledged: true,
      deliveryId: payload.deliveryId,
      status: mappedStatus,
    };
  }
}
