import { HttpStatus } from '@nestjs/common';
import { EntraWebhookController } from './entra.webhook.controller';

describe('EntraWebhookController', () => {
  function setup(subscription: unknown) {
    const prisma = {
      webhookSubscription: {
        findFirst: jest.fn().mockResolvedValue(subscription),
      },
      webhookReplayNonce: { create: jest.fn().mockResolvedValue({}) },
    };
    const normalizer = {
      normalizeSignInLog: jest.fn().mockReturnValue({ event_type: 'x' }),
    };
    const kafka = {
      publishCanonicalEvent: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new EntraWebhookController(
      normalizer as any,
      kafka as any,
      prisma as any,
    );
    const res: any = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return { controller, prisma, kafka, res };
  }

  const notification = (id: string, subscriptionId = 'sub-1') => ({
    id,
    clientState: 'secret-1',
    subscriptionId,
    changeType: 'updated',
    resource: `users/${id}`,
    resourceData: {},
  });

  it('looks each subscription up once per batch, but checks replay for every notification', async () => {
    const { controller, prisma, kafka, res } = setup({
      id: 'ws-1',
      tenant_id: 't-1',
      instanceId: 'inst-1',
      subscriptionId: 'sub-1',
      instance: { environment_id: 'env-1', source_region: 'eu-west-2' },
    });

    await controller.handleGraphWebhook(
      undefined as any,
      'application/json',
      { value: [notification('n1'), notification('n2'), notification('n3')] },
      res,
    );

    expect(prisma.webhookSubscription.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.webhookReplayNonce.create).toHaveBeenCalledTimes(3);
    expect(kafka.publishCanonicalEvent).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
  });

  it('still rejects the batch when the subscription is unknown', async () => {
    const { controller, prisma, res } = setup(null);

    await expect(
      controller.handleGraphWebhook(
        undefined as any,
        'application/json',
        { value: [notification('n1'), notification('n2')] },
        res,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    expect(prisma.webhookSubscription.findFirst).toHaveBeenCalledTimes(1);
  });
});
