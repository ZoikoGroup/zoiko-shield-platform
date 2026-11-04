import { AssistantConfigService } from './assistant-config.service';
import { ContentService } from '../content/content.service';

const ENV_KEYS = [
  'PUBLIC_ASSISTANT_FLAG_ASSISTANT_KILL',
  'PUBLIC_ASSISTANT_FLAG_ASSISTANT_AI_ANSWERS',
  'PUBLIC_ASSISTANT_FLAG_ASSISTANT_LEAD_SUBMIT',
  'PUBLIC_ASSISTANT_DISPLAY_NAME',
  'PUBLIC_ASSISTANT_DISPLAY_CLEARANCE',
  'PUBLIC_ASSISTANT_MESSAGES_PER_MINUTE',
  'PUBLIC_ASSISTANT_NOTICE_VERSION',
];

describe('AssistantConfigService', () => {
  const saved: Record<string, string | undefined> = {};
  const service = new AssistantConfigService(new ContentService());

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('turns a flag on or off from the environment', () => {
    expect(service.isEnabled('assistant_kill')).toBe(false);
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_KILL = 'on';
    expect(service.isEnabled('assistant_kill')).toBe(true);
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_KILL = 'no';
    expect(service.isEnabled('assistant_kill')).toBe(false);
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_LEAD_SUBMIT = 'true';
    expect(service.flags().assistant_lead_submit).toBe(true);
  });

  it('lets the kill switch override AI answers', () => {
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_AI_ANSWERS = 'on';
    expect(service.aiAnswersEnabled()).toBe(true);
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_KILL = 'on';
    expect(service.aiAnswersEnabled()).toBe(false);
    expect(service.snapshot().assistant.mode).toBe('disabled');
  });

  it('reports static mode when AI answers are off', () => {
    process.env.PUBLIC_ASSISTANT_FLAG_ASSISTANT_AI_ANSWERS = 'off';
    expect(service.aiAnswersEnabled()).toBe(false);
    expect(service.snapshot().assistant.mode).toBe('static');
  });

  it('keeps the neutral name until brand clearance is approved', () => {
    process.env.PUBLIC_ASSISTANT_DISPLAY_NAME = 'Zhield';
    expect(service.clearanceState()).toBe('PENDING');
    expect(service.displayName()).toBe('ZoikoShield Assistant');
    process.env.PUBLIC_ASSISTANT_DISPLAY_CLEARANCE = 'APPROVED';
    expect(service.clearanceState()).toBe('APPROVED');
    expect(service.displayName()).toBe('Zhield');
    delete process.env.PUBLIC_ASSISTANT_DISPLAY_NAME;
    expect(service.displayName()).toBe('ZoikoShield Assistant');
  });

  it('serves policy versions, limits and a full snapshot', () => {
    process.env.PUBLIC_ASSISTANT_NOTICE_VERSION = 'v9';
    process.env.PUBLIC_ASSISTANT_MESSAGES_PER_MINUTE = '5';
    expect(service.policyVersions().privacy_notice).toBe('v9');
    expect(service.limits().messages_per_minute).toBe(5);
    expect(service.limits().message_chars).toBe(2000);
    const snapshot = service.snapshot();
    expect(snapshot.routes.WEB_SUPPORT).toBeDefined();
    expect(snapshot.topic_tiles.length).toBeGreaterThan(0);
    expect(snapshot.content_epoch).toBe(1);
  });
});
