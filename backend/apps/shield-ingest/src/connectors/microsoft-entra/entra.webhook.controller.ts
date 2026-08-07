/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
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
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../../kafka/kafka.producer.service';

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
   * Required by Section 9 of the PDF.
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
      // Send 202 Accepted immediately before doing heavy work
      res.status(HttpStatus.ACCEPTED).send();

      // Process the payload asynchronously
      this.processNotifications(body.value).catch((err) => {
        this.logger.error(
          `Failed to process webhook notifications: ${err.message}`,
        );
      });
      return;
    }

    // Invalid payload
    throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
  }

  /**
   * Processes the notifications asynchronously.
   */
  private async processNotifications(notifications: any[]) {
    this.logger.debug(
      `Processing ${notifications.length} notifications from Microsoft Graph.`,
    );

    for (const notification of notifications) {
      // Security: Validate the clientState to prevent forged notifications
      const clientState = notification.clientState;
      if (!clientState) {
        this.logger.warn(
          `Discarding notification without clientState. Resource: ${notification.resource}`,
        );
        continue;
      }

      // Check if this subscription exists in our database
      const subscription = await this.prisma.webhookSubscription.findFirst({
        where: { clientState },
      });

      if (!subscription) {
        this.logger.warn(
          `Discarding notification for unknown clientState. Resource: ${notification.resource}`,
        );
        continue;
      }

      if (notification.lifecycleEvent) {
        // Handle lifecycle events (e.g., reauthorizationRequired, subscriptionRemoved)
        this.logger.log(
          `Received lifecycle event: ${notification.lifecycleEvent} for subscription ${subscription.subscriptionId}`,
        );
        // TODO: Handle renewal or cleanup logic
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
        );

        // Override event type for webhooks
        canonicalEvent.event_type = `security.identity.webhook.${notification.changeType.toLowerCase()}`;

        await this.kafkaProducer.publishCanonicalEvent(canonicalEvent);
      }
    }
  }
}
