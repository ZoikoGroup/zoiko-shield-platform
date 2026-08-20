import { Test, TestingModule } from '@nestjs/testing';
import { AiKillSwitchService } from './ai-kill-switch.service';
import { AiUnavailableException } from '../gateway/fallback/fallback.exceptions';

describe('AiKillSwitchService (ZS-ENG-AI-001 §23)', () => {
  let service: AiKillSwitchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiKillSwitchService],
    }).compile();

    service = module.get<AiKillSwitchService>(AiKillSwitchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows normal traffic when no kill switch is active', () => {
    const check = service.isBlocked({
      tenantId: 'tenant-1',
      useCaseKey: 'CASE_SUMMARY',
    });
    expect(check.blocked).toBe(false);
  });

  it('blocks all traffic with GLOBAL kill switch', () => {
    service.activateKillSwitch({
      scope: 'GLOBAL',
      targetId: '*',
      reason: 'Critical model vulnerability discovered',
      activatedBy: 'ciso-admin',
    });

    expect(() =>
      service.assertNotBlocked({
        tenantId: 'tenant-1',
        useCaseKey: 'CASE_SUMMARY',
      }),
    ).toThrow(AiUnavailableException);
  });

  it('blocks specific tenant without affecting other tenants', () => {
    service.activateKillSwitch({
      scope: 'TENANT',
      targetId: 'tenant-bad',
      reason: 'Tenant under abuse investigation',
      activatedBy: 'sec-ops',
    });

    expect(() =>
      service.assertNotBlocked({
        tenantId: 'tenant-bad',
        useCaseKey: 'CASE_SUMMARY',
      }),
    ).toThrow(AiUnavailableException);

    expect(
      service.isBlocked({
        tenantId: 'tenant-good',
        useCaseKey: 'CASE_SUMMARY',
      }).blocked,
    ).toBe(false);
  });

  it('blocks specific feature (e.g. DETECTION_CANDIDATE) granularly', () => {
    service.activateKillSwitch({
      scope: 'FEATURE',
      targetId: 'DETECTION_CANDIDATE',
      reason: 'Prompt regression under review',
      activatedBy: 'ai-lead',
    });

    expect(
      service.isBlocked({
        tenantId: 'tenant-1',
        useCaseKey: 'DETECTION_CANDIDATE',
      }).blocked,
    ).toBe(true);

    expect(
      service.isBlocked({
        tenantId: 'tenant-1',
        useCaseKey: 'CASE_SUMMARY',
      }).blocked,
    ).toBe(false);
  });

  it('deactivates kill switch and restores normal traffic', () => {
    service.activateKillSwitch({
      scope: 'TOOL',
      targetId: 'telemetry.query',
      reason: 'API rate limit spike',
      activatedBy: 'sre-admin',
    });

    expect(
      service.isBlocked({
        tenantId: 'tenant-1',
        toolName: 'telemetry.query',
      }).blocked,
    ).toBe(true);

    service.deactivateKillSwitch({
      scope: 'TOOL',
      targetId: 'telemetry.query',
      deactivatedBy: 'sre-admin',
    });

    expect(
      service.isBlocked({
        tenantId: 'tenant-1',
        toolName: 'telemetry.query',
      }).blocked,
    ).toBe(false);
  });
});
