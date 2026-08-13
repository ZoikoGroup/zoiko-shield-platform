import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationDispatchService,
  DispatchInput,
} from './notification-dispatch.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationPolicyService } from '../policies/notification-policy.service';
import { NotificationPreferenceService } from '../preferences/notification-preference.service';
import { NotificationTemplateService } from '../templates/notification-template.service';
import { InAppChannelService } from '../channels/in-app-channel.service';
import { EmailChannelService } from '../channels/email-channel.service';
import { SlackChannelService } from '../channels/slack-channel.service';
import { TeamsChannelService } from '../channels/teams-channel.service';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;
  let prismaMock: any;
  let policyServiceMock: any;
  let preferenceServiceMock: any;
  let templateServiceMock: any;
  let slackChannelMock: any;
  let teamsChannelMock: any;

  beforeEach(async () => {
    prismaMock = {
      notificationDelivery: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    policyServiceMock = {
      getByEventType: jest.fn(),
    };

    preferenceServiceMock = {
      resolveDeliveryDecision: jest.fn(),
    };

    templateServiceMock = {
      getLatestPublished: jest.fn(),
      render: jest.fn(),
    };

    slackChannelMock = {
      channelType: 'SLACK',
      send: jest.fn(),
    };

    teamsChannelMock = {
      channelType: 'TEAMS',
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationPolicyService, useValue: policyServiceMock },
        {
          provide: NotificationPreferenceService,
          useValue: preferenceServiceMock,
        },
        { provide: NotificationTemplateService, useValue: templateServiceMock },
        {
          provide: InAppChannelService,
          useValue: {
            channelType: 'IN_APP',
            send: jest.fn().mockResolvedValue({ delivered: true }),
          },
        },
        {
          provide: EmailChannelService,
          useValue: {
            channelType: 'EMAIL',
            send: jest.fn().mockResolvedValue({ delivered: true }),
          },
        },
        { provide: SlackChannelService, useValue: slackChannelMock },
        { provide: TeamsChannelService, useValue: teamsChannelMock },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(
      NotificationDispatchService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should dispatch to Slack channel when allowed by policy', async () => {
    policyServiceMock.getByEventType.mockResolvedValue([
      {
        id: 'pol-1',
        key: 'ALERT_CRITICAL',
        allowed_channels: JSON.stringify(['SLACK']),
        mandatory: false,
        version: 1,
      },
    ]);
    preferenceServiceMock.resolveDeliveryDecision.mockResolvedValue({
      shouldDeliver: true,
    });
    prismaMock.notificationDelivery.create.mockResolvedValue({ id: 'del-1' });
    templateServiceMock.getLatestPublished.mockResolvedValue({
      id: 'tmpl-1',
      version: 1,
    });
    templateServiceMock.render.mockReturnValue({
      subject: 'Critical Security Alert',
      body: 'Host compromise detected',
    });
    slackChannelMock.send.mockResolvedValue({ delivered: true });

    const input: DispatchInput = {
      tenantId: 'tenant-1',
      eventId: 'evt-101',
      eventType: 'ALERT_CRITICAL',
      recipientPrincipalId: 'principal-1',
      templateContext: { host: 'server-01' },
    };

    await service.dispatch(input);

    expect(slackChannelMock.send).toHaveBeenCalledWith({
      recipientPrincipalId: 'principal-1',
      subject: 'Critical Security Alert',
      body: 'Host compromise detected',
    });
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-1' },
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });
});
