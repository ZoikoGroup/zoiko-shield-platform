import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationController } from './notification.controller';

describe('NotificationController', () => {
  const user = { id: 'principal-1', email: 'owner@example.test' } as any;

  function build(overrides: {
    findMany?: jest.Mock;
    findFirst?: jest.Mock;
    acknowledge?: jest.Mock;
    send?: jest.Mock;
  } = {}) {
    const prisma = {
      notificationDelivery: {
        findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
        findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
      },
      notificationPolicy: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const ack = { acknowledge: overrides.acknowledge ?? jest.fn() } as any;
    const templates = {
      render: jest.fn().mockReturnValue({ subject: 's', htmlBody: 'b', renderHash: 'h', templateId: 't' }),
    } as any;
    const email = { send: overrides.send ?? jest.fn().mockResolvedValue({ delivered: false }) } as any;
    return {
      controller: new NotificationController(prisma, ack, {} as any, templates, email),
      prisma,
    };
  }

  it('requires a tenant instead of reading a made-up default tenant', async () => {
    const { controller } = build();
    await expect(controller.list(undefined as any, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces a database failure instead of returning an empty inbox', async () => {
    const { controller } = build({ findMany: jest.fn().mockRejectedValue(new Error('db down')) });
    await expect(controller.list('tenant-1', user)).rejects.toThrow('db down');
  });

  it('lists only the caller and the shared role inboxes of the caller tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { controller } = build({ findMany });
    await controller.list('tenant-1', user, '10');
    expect(findMany.mock.calls[0][0].where).toEqual({
      tenant_id: 'tenant-1',
      OR: [
        { recipient_principal_id: 'principal-1' },
        { recipient_principal_id: 'tenant-admin' },
        { recipient_principal_id: 'soc-lead' },
      ],
    });
  });

  it('propagates an acknowledgement failure instead of reporting success', async () => {
    const acknowledge = jest.fn().mockRejectedValue(new NotFoundException('delivery not found'));
    const { controller } = build({ acknowledge });
    await expect(
      controller.acknowledge('tenant-1', user, 'missing', { acknowledgementType: 'ACKNOWLEDGED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unknown acknowledgement type', async () => {
    const { controller } = build();
    await expect(
      controller.acknowledge('tenant-1', user, 'n1', { acknowledgementType: 'BOGUS' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a test email that was not delivered as FAILED', async () => {
    const { controller } = build({ send: jest.fn().mockResolvedValue({ delivered: false }) });
    const result = await controller.sendTestNotification('tenant-1', user, 'ZS-EML-IAM-001', {});
    expect(result.status).toBe('FAILED');
    expect(result.transport).toBe('NOT_SENT');
  });

  it('returns 404 for a notification of another tenant or none at all', async () => {
    const { controller } = build({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(controller.getById('tenant-1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
