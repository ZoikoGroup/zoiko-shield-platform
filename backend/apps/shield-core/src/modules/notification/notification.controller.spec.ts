import { BadRequestException } from '@nestjs/common';
import { NotificationController } from './notification.controller';

describe('NotificationController.list', () => {
  function controllerWith(findMany: jest.Mock) {
    return new NotificationController(
      { notificationDelivery: { findMany } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('rejects a request with no tenant instead of reading a demo tenant', async () => {
    const findMany = jest.fn();

    await expect(
      controllerWith(findMany).list(undefined as any, { id: 'p-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads only the caller's tenant", async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await controllerWith(findMany).list('tenant-1', { id: 'p-1' } as any);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 'tenant-1' }),
      }),
    );
  });
});
