import { NotificationDeliveryWebhookController } from './notification-delivery-webhook.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('NotificationDeliveryWebhookController (ZS-EML-TPL-001 v2.0 Gates 9 & 12)', () => {
  let controller: NotificationDeliveryWebhookController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      notificationDelivery: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    controller = new NotificationDeliveryWebhookController(prismaMock as PrismaService);
  });

  it('should throw BadRequestException if mandatory payload fields are missing', async () => {
    await expect(
      controller.handleDeliveryStatus({} as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should process DELIVERED webhook and update notification status', async () => {
    prismaMock.notificationDelivery.findUnique.mockResolvedValue({
      id: 'del-202',
      tenant_id: 'tenant-acme',
      status: 'PROCESSING',
    });
    prismaMock.notificationDelivery.update.mockResolvedValue({
      id: 'del-202',
      status: 'DELIVERED',
    });

    const result = await controller.handleDeliveryStatus({
      deliveryId: 'del-202',
      recipientEmail: 'admin@acme.com',
      status: 'DELIVERED',
      timestamp: new Date().toISOString(),
    });

    expect(result.acknowledged).toBe(true);
    expect(result.status).toBe('DELIVERED');
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-202' },
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });

  it('should process BOUNCED status and mark status as FAILED', async () => {
    prismaMock.notificationDelivery.findUnique.mockResolvedValue({
      id: 'del-203',
      tenant_id: 'tenant-acme',
      status: 'PROCESSING',
    });
    prismaMock.notificationDelivery.update.mockResolvedValue({
      id: 'del-203',
      status: 'FAILED',
    });

    const result = await controller.handleDeliveryStatus({
      deliveryId: 'del-203',
      recipientEmail: 'invalid@acme.com',
      status: 'BOUNCED',
      bounceReason: '550 Mailbox does not exist',
      timestamp: new Date().toISOString(),
    });

    expect(result.acknowledged).toBe(true);
    expect(result.status).toBe('FAILED');
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-203' },
        data: expect.objectContaining({
          status: 'FAILED',
          error_code: 'BOUNCE: 550 Mailbox does not exist',
        }),
      }),
    );
  });
});
