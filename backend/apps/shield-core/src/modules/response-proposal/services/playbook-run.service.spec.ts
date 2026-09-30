import { NotFoundException } from '@nestjs/common';
import { PlaybookRunService } from './playbook-run.service';

const RUN_FIXTURE = {
  id: 'run-1',
  case_id: 'case-1',
  mode: 'SIMULATION',
  status: 'RUNNING',
  triggered_by: 'analyst-1',
  started_at: new Date('2026-09-30T00:00:00.000Z'),
  completed_at: null,
  termination_reason: null,
  playbookVersion: {
    version: 3,
    required_authority: 'R2',
    steps: JSON.stringify([
      {
        stepNumber: 1,
        actionType: 'NETWORK_ISOLATE_HOST',
        authorityLevel: 'R2',
        targetIdentifier: 'host-1',
        compensatingActionType: 'NETWORK_UNISOLATE_HOST',
      },
    ]),
    playbook: { key: 'ransomware-containment', owner: 'soc-eng' },
  },
};

describe('PlaybookRunService', () => {
  it('partitions the run list by tenant in the database query', async () => {
    const prisma = {
      playbookRun: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PlaybookRunService(prisma as never);

    await service.listForTenant('tenant-a');

    expect(prisma.playbookRun.findMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a' },
      orderBy: { started_at: 'desc' },
      include: { playbookVersion: { include: { playbook: true } } },
    });
  });

  it('maps a real run row to the summary shape, not fixture data', async () => {
    const prisma = {
      playbookRun: { findMany: jest.fn().mockResolvedValue([RUN_FIXTURE]) },
    };
    const service = new PlaybookRunService(prisma as never);

    const [summary] = await service.listForTenant('tenant-a');

    expect(summary).toEqual({
      id: 'run-1',
      caseId: 'case-1',
      playbookKey: 'ransomware-containment',
      playbookOwner: 'soc-eng',
      version: 3,
      mode: 'SIMULATION',
      status: 'RUNNING',
      triggeredBy: 'analyst-1',
      startedAt: RUN_FIXTURE.started_at,
      completedAt: null,
      terminationReason: null,
    });
  });

  it('binds detail lookup to both run ID and authoritative tenant', async () => {
    const prisma = {
      playbookRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PlaybookRunService(prisma as never);

    await expect(service.getById('tenant-a', 'run-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.playbookRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', tenant_id: 'tenant-a' },
      include: { playbookVersion: { include: { playbook: true } } },
    });
  });

  it('parses the real step plan from PlaybookVersion.steps rather than inventing one', async () => {
    const prisma = {
      playbookRun: { findFirst: jest.fn().mockResolvedValue(RUN_FIXTURE) },
    };
    const service = new PlaybookRunService(prisma as never);

    const detail = await service.getById('tenant-a', 'run-1');

    expect(detail.requiredAuthority).toBe('R2');
    expect(detail.plannedSteps).toEqual([
      {
        stepNumber: 1,
        actionType: 'NETWORK_ISOLATE_HOST',
        authorityLevel: 'R2',
        targetIdentifier: 'host-1',
        compensatingActionType: 'NETWORK_UNISOLATE_HOST',
      },
    ]);
  });

  it('reports an empty step plan rather than throwing when steps JSON is malformed', async () => {
    const malformed = {
      ...RUN_FIXTURE,
      playbookVersion: { ...RUN_FIXTURE.playbookVersion, steps: 'not-json' },
    };
    const prisma = {
      playbookRun: { findFirst: jest.fn().mockResolvedValue(malformed) },
    };
    const service = new PlaybookRunService(prisma as never);

    const detail = await service.getById('tenant-a', 'run-1');

    expect(detail.plannedSteps).toEqual([]);
  });
});
