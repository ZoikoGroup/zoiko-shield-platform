import { Test, TestingModule } from '@nestjs/testing';
import { AiIncidentService } from './ai-incident.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AiIncidentService (§23 AI Incident Lifecycle Management)', () => {
  let service: AiIncidentService;
  let killSwitchService: AiKillSwitchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiIncidentService, AiKillSwitchService],
    }).compile();

    service = module.get<AiIncidentService>(AiIncidentService);
    killSwitchService = module.get<AiKillSwitchService>(AiKillSwitchService);
    service.clearAll();
  });

  afterEach(() => {
    service.clearAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Incident Declaration & Auto-Containment', () => {
    it('should declare a SEV1_CRITICAL incident and automatically engage kill switch', async () => {
      const tenantId = 'tenant-defense-01';

      const incident = await service.declareIncident(
        tenantId,
        {
          title:
            'Critical Model Hallucination in Automated Firewall Rule Generator',
          category: 'MODEL_HALLUCINATION',
          severity: 'SEV1_CRITICAL',
          description: 'Model attempted to delete 0.0.0.0/0 whitelist route',
          affectedModel: 'model:claude-3-5-sonnet',
          autoContain: true,
        },
        'analyst-jane',
      );

      expect(incident.id).toBeDefined();
      expect(incident.status).toBe('CONTAINED_KILL_SWITCH');
      expect(incident.killSwitchActive).toBe(true);
      expect(incident.timeline).toHaveLength(2); // DECLARED + CONTAINED

      // Verify that the kill switch is actually active in AiKillSwitchService
      const blockCheck = killSwitchService.isBlocked({
        tenantId,
        modelRoute: 'model:claude-3-5-sonnet',
      });
      expect(blockCheck.blocked).toBe(true);
    });

    it('should declare a SEV3_MEDIUM incident without auto-containment in DECLARED state', async () => {
      const tenantId = 'tenant-retail';

      const incident = await service.declareIncident(tenantId, {
        title: 'Mild latency drift in SOC alert summarization',
        category: 'DRIFT_ANOMALY',
        severity: 'SEV3_MEDIUM',
        description: 'P99 latency increased by 15%',
      });

      expect(incident.status).toBe('DECLARED');
      expect(incident.killSwitchActive).toBe(false);
      expect(incident.timeline).toHaveLength(1);
    });
  });

  describe('Full Incident Lifecycle Workflow', () => {
    it('should transition through full state machine: DECLARED -> CONTAINED -> FALLBACK -> RCA -> RESOLVED -> CLOSED', async () => {
      const tenantId = 'tenant-fintech';

      // 1. Declare
      const inc1 = await service.declareIncident(tenantId, {
        title: 'Prompt Injection Bypass in Log Triage',
        category: 'PROMPT_INJECTION_EXPLOIT',
        severity: 'SEV2_HIGH',
        description:
          'Attacker bypassed canary token via markdown block obfuscation',
        affectedPromptKey: 'triage-system-prompt-v2',
      });
      expect(inc1.status).toBe('DECLARED');

      // 2. Contain
      const inc2 = await service.containIncident(tenantId, inc1.id, {
        reason: 'Quarantine prompt key until input sanitizer is patched',
        killSwitchScope: 'PROMPT',
        targetId: 'triage-system-prompt-v2',
        containedBy: 'soc-lead-bob',
      });
      expect(inc2.status).toBe('CONTAINED_KILL_SWITCH');
      expect(inc2.killSwitchActive).toBe(true);

      // 3. Fallback
      const inc3 = await service.activateFallback(tenantId, inc1.id, {
        fallbackStrategy: 'DETERMINISTIC_RULES',
        fallbackNotes: 'Routing triage to deterministic regex rule parser',
      });
      expect(inc3.status).toBe('FALLBACK_ACTIVE');
      expect(inc3.fallbackActive).toBe(true);

      // 4. RCA
      const inc4 = await service.completeRca(tenantId, inc1.id, {
        rootCauseSummary:
          'Unsanitized user comments in triage prompt allowed jailbreak markdown escape',
        contributingFactors: [
          'Missing markdown sanitizer',
          'Prompt delimiter collision',
        ],
        preventativeActions: [
          'Added AST delimiter isolation filter',
          'Updated canary tokens',
        ],
      });
      expect(inc4.status).toBe('ROOT_CAUSE_ANALYZED');
      expect(inc4.rcaSummary).toContain('Unsanitized user comments');

      // 5. Resolve
      const inc5 = await service.resolveIncident(tenantId, inc1.id, {
        resolutionSummary:
          'Sanitizer deployed to production. Prompt v3 validated with zero bypass.',
        disengageKillSwitch: true,
        resolvedBy: 'soc-lead-bob',
      });
      expect(inc5.status).toBe('RESOLVED');
      expect(inc5.killSwitchActive).toBe(false);

      // Verify kill switch was released
      const checkReleased = killSwitchService.isBlocked({
        tenantId,
        promptKey: 'triage-system-prompt-v2',
      });
      expect(checkReleased.blocked).toBe(false);

      // 6. Close
      const inc6 = await service.closeIncident(tenantId, inc1.id);
      expect(inc6.status).toBe('CLOSED');
      expect(inc6.closedAt).toBeDefined();
      expect(inc6.timeline.length).toBe(6);
    });

    it('should reject invalid state transitions', async () => {
      const tenantId = 'tenant-test';
      const inc = await service.declareIncident(tenantId, {
        title: 'Minor issue',
        category: 'DRIFT_ANOMALY',
        severity: 'SEV4_LOW',
        description: 'Minor test',
      });

      // Cannot close directly from DECLARED
      await expect(service.closeIncident(tenantId, inc.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Querying & Metrics', () => {
    it('should filter incidents and calculate metrics accurately', async () => {
      const tenantId = 'tenant-metrics';

      await service.declareIncident(tenantId, {
        title: 'Crit 1',
        category: 'DATA_EXFILTRATION',
        severity: 'SEV1_CRITICAL',
        description: 'Crit test',
      });

      await service.declareIncident(tenantId, {
        title: 'Med 1',
        category: 'DRIFT_ANOMALY',
        severity: 'SEV3_MEDIUM',
        description: 'Med test',
      });

      const metrics = service.getMetrics(tenantId);
      expect(metrics.totalIncidents).toBe(2);
      expect(metrics.criticalIncidents).toBe(1);
      expect(metrics.containedKillSwitches).toBe(1); // SEV1 auto-contained
    });
  });
});
