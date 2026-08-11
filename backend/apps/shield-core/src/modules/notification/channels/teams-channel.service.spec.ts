import { Test, TestingModule } from '@nestjs/testing';
import { TeamsChannelService } from './teams-channel.service';

describe('TeamsChannelService', () => {
  let service: TeamsChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsChannelService],
    }).compile();

    service = module.get<TeamsChannelService>(TeamsChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.channelType).toBe('TEAMS');
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
