import { Test, TestingModule } from '@nestjs/testing';
import { SlackChannelService } from './slack-channel.service';

describe('SlackChannelService', () => {
  let service: SlackChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlackChannelService],
    }).compile();

    service = module.get<SlackChannelService>(SlackChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.channelType).toBe('SLACK');
  });

  it('should return delivered true when sending notification', async () => {
    const res = await service.send({
      recipientPrincipalId: 'p-1',
      subject: 'Critical Alert',
      body: 'Suspicious login detected',
    });

    expect(res.delivered).toBe(true);
  });
});
