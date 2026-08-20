import { Test, TestingModule } from '@nestjs/testing';
import {
  ResponsePlaybookService,
  PlaybookDefinition,
} from './response-playbook.service';
import { ActionAuthorityService } from '../policy/action-authority.service';
import { ActionRollbackBrokerService } from '../rollback/action-rollback-broker.service';

describe('ResponsePlaybookService (Multi-Step Playbooks & Compensation)', () => {
  let service: ResponsePlaybookService;

  const mockPlaybook: PlaybookDefinition = {
    playbookId: 'PB-RANSOMWARE-01',
    name: 'Automated Ransomware Containment',
    category: 'RANSOMWARE_CONTAINMENT',
    steps: [
      {
        stepNumber: 1,
        actionType: 'host.isolate',
        authorityLevel: 'R2',
        targetIdentifier: 'infected-host-01',
        parameters: { vlan: 'quarantine' },
        compensatingActionType: 'host.unisolate',
      },
      {
        stepNumber: 2,
        actionType: 'session.revoke',
        authorityLevel: 'R1',
        targetIdentifier: 'compromised-user@acme.com',
        parameters: { revokeAllTokens: true },
        compensatingActionType: 'session.noop',
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponsePlaybookService,
        ActionAuthorityService,
        ActionRollbackBrokerService,
      ],
    }).compile();

    service = module.get<ResponsePlaybookService>(ResponsePlaybookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('successfully executes 2-step playbook with approved authority', async () => {
    const report = await service.executePlaybook({
      playbook: mockPlaybook,
      tenantId: 'tenant-1',
      proposalStatus: 'APPROVED',
      approverIds: ['soc-lead-1'],
      stepExecutor: async () => ({ success: true }),
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.completedSteps).toBe(2);
    expect(report.executedReceiptIds.length).toBe(2);
    expect(report.stepResults.every((s) => s.status === 'SUCCESS')).toBe(true);
  });

  it('rolls back previous steps when a subsequent step fails during execution', async () => {
    const failingPlaybook: PlaybookDefinition = {
      ...mockPlaybook,
      steps: [
        ...mockPlaybook.steps,
        {
          stepNumber: 3,
          actionType: 'firewall.block_ip',
          authorityLevel: 'R3',
          targetIdentifier: '203.0.113.88',
          parameters: { port: 443 },
          compensatingActionType: 'firewall.unblock_ip',
        },
      ],
    };

    const report = await service.executePlaybook({
      playbook: failingPlaybook,
      tenantId: 'tenant-1',
      proposalStatus: 'APPROVED',
      approverIds: ['soc-lead-1'],
      stepExecutor: async (step) => {
        if (step.stepNumber === 3) {
          return { success: false, error: 'Firewall API timeout' };
        }
        return { success: true };
      },
    });

    expect(report.status).toBe('FAILED_COMPENSATED');
    expect(report.completedSteps).toBe(0);
    // Steps 1 & 2 should be marked COMPENSATED
    expect(report.stepResults[0].status).toBe('COMPENSATED');
    expect(report.stepResults[1].status).toBe('COMPENSATED');
    expect(report.stepResults[2].status).toBe('FAILED');
  });
});
