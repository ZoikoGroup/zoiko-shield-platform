/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
  Logger,
  Headers,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntraNormalizerService } from './entra.normalizer';
import { PrismaService } from '../../../prisma/prisma.service';
import { KafkaProducerService } from '../../../kafka/kafka.producer.service';
import { PublicIngress } from '../../../security/public-ingress.decorator';
import { createHash } from 'crypto';
import { requireRegion } from '../../../security/tenant-context';

@PublicIngress()
@Controller('v1/webhooks/microsoft-graph')
export class EntraWebhookController {
  private readonly logger = new Logger(EntraWebhookController.name);

  constructor(
    private readonly normalizer: EntraNormalizerService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Endpoint for Microsoft Graph to push Change Notifications.
   */
  @Post()
  async handleGraphWebhook(
    @Query('validationToken') validationToken: string,
    @Headers('content-type') contentType: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    // 1. Validation Token Handshake
    // Microsoft requires us to echo this exact token back as plain text within 10 seconds.
    if (validationToken) {
      this.logger.log(
        `Received validationToken request from Microsoft Graph: ${validationToken}`,
      );
      return res.status(HttpStatus.OK).type('text/plain').send(validationToken);
    }

    // 2. Queue-First Processing
    // Microsoft requires a 2xx response immediately, otherwise they will assume failure and retry.
    if (body && body.value) {
      const validated = await this.validateNotifications(body.value);
      // Queue (Kafka) or durably record lifecycle state before acknowledging.
      // A processing failure returns non-2xx so Microsoft Graph retries instead
      // of silently losing a validated notification.
      await this.processNotifications(validated);
      return res.status(HttpStatus.ACCEPTED).send();
    }

    // Invalid payload
    throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
  }

  private async validateNotifications(
    notifications: any[],
  ): Promise<Array<{ notification: any; subscription: any }>> {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new HttpException(
        'Notification batch is empty',
        HttpStatus.BAD_REQUEST,
      );
    }
    const validated: Array<{ notification: any; subscription: any }> = [];
    for (const notification of notifications) {
      if (!notification?.id || !notification?.clientState) {
        throw new HttpException(
          'Every notification must include id and clientState',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: {
          clientState: notification.clientState,
          subscriptionId: notification.subscriptionId,
        },
        include: {
          instance: {
            select: {
              environment_id: true,
              source_region: true,
            },
          },
        },
      });
      if (!subscription)
        throw new HttpException(
          'Unknown Microsoft Graph subscription',
          HttpStatus.UNAUTHORIZED,
        );

      const nonceHash = createHash('sha256')
        .update(`${notification.subscriptionId}:${notification.id}`)
        .digest('hex');
      try {
        await this.prisma.webhookReplayNonce.create({
          data: {
            connector_id: subscription.instanceId,
            nonce_hash: nonceHash,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      } catch {
        throw new HttpException(
          'Microsoft Graph notification replay detected',
          HttpStatus.CONFLICT,
        );
      }
      validated.push({ notification, subscription });
    }
    return validated;
  }

  /**
   * Processes the notifications asynchronously.
   */
  private async processNotifications(
    validated: Array<{ notification: any; subscription: any }>,
  ) {
    this.logger.debug(
      `Processing ${validated.length} notifications from Microsoft Graph.`,
    );

    for (const { notification, subscription } of validated) {
      if (notification.lifecycleEvent) {
        this.logger.log(
          `Received lifecycle event: ${notification.lifecycleEvent} for subscription ${subscription.subscriptionId}`,
        );
        await this.prisma.$transaction(async (tx) => {
          if (notification.lifecycleEvent === 'subscriptionRemoved') {
            await tx.webhookSubscription.deleteMany({
              where: {
                id: subscription.id,
                tenant_id: subscription.tenant_id,
              },
            });
          }
          await tx.connectorInstance.updateMany({
            where: {
              id: subscription.instanceId,
              tenant_id: subscription.tenant_id,
            },
            data: {
              state:
                notification.lifecycleEvent === 'reauthorizationRequired'
                  ? 'PERMISSION_REVOKED'
                  : 'DEGRADED',
            },
          });
          await tx.connectorError.create({
            data: {
              tenant_id: subscription.tenant_id,
              instanceId: subscription.instanceId,
              errorCode: `GRAPH_${String(notification.lifecycleEvent).toUpperCase()}`,
              message: `Microsoft Graph lifecycle event '${notification.lifecycleEvent}' requires connector reconciliation`,
            },
          });
        });
      } else {
        // Standard resource change notification (e.g., user updated)
        this.logger.log(
          `Resource changed: ${notification.resource} (ChangeType: ${notification.changeType})`,
        );

        // Use normalizer to format the webhook data if it matches expected structures
        // For simplicity, we are wrapping it into our Canonical Event format.
        // In a full implementation, we'd fetch the exact user data from Graph API using notification.resource.
        const canonicalEvent = this.normalizer.normalizeSignInLog(
          { id: notification.id, ...notification.resourceData },
          subscription.tenant_id,
          subscription.instance.environment_id,
          requireRegion(subscription.instance.source_region),
        );

        // Override event type for webhooks
        canonicalEvent.event_type = `security.identity.webhook.${notification.changeType.toLowerCase()}`;

        await this.kafkaProducer.publishCanonicalEvent(canonicalEvent);
      }
    }
  }
}
