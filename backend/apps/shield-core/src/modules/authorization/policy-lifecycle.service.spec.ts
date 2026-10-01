import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PolicyLifecycleService } from './policy-lifecycle.service';

const GLOBAL_ROW = {
  id: 'db-global-1',
  tenantId: null as string | null,
  policyKey: 'pol-2026-09-001',
  policyName: 'Zero-Trust JIT Admin Escalation Policy',
  domain: 'IAM',
  version: 'v2.4.1',
  status: 'PENDING_APPROVAL',
  stagedEnvironment: 'staging-eu-west3',
  canaryPercentage: 10,
  author: 'security-architect@zoikoshield.corp',
  approvers: ['soc-lead@zoikoshield.corp'],
  commitHash: '7f9a2c14e0b',
  diffSummary: 'Enforces 4-eyes approval on R3 actions.',
  diffPrevious: 'jit_elevation:\n  max_session_ttl_minutes: 60',
  diffProposed: 'jit_elevation:\n  max_session_ttl_minutes: 30',
  reversalReason: null as string | null,
  createdAt: new Date('2026-09-24T18:32:00.000Z'),
  updatedAt: new Date('2026-09-24T18:32:00.000Z'),
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    configPolicyVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      ...((overrides.configPolicyVersion as object) ?? {}),
    },
    configPolicyAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      ...((overrides.configPolicyAuditEvent as object) ?? {}),
    },
  };
}

describe('PolicyLifecycleService', () => {
  describe('onModuleInit', () => {
    it('seeds a canonical policy only when it is not already present', async () => {
      const create = jest.fn().mockResolvedValue(GLOBAL_ROW);
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(null) // pol-001 missing -> seeded
        .mockResolvedValue(GLOBAL_ROW); // the other three already exist
      const prisma = makePrisma({
        configPolicyVersion: { findFirst, create },
      });
      const service = new PolicyLifecycleService(prisma as never);

      await service.onModuleInit();

      expect(findFirst).toHaveBeenCalledTimes(4);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].data.tenantId).toBeNull();
    });
  });

  describe('listPolicies', () => {
    it('prefers a tenant-owned fork over the shared baseline for the same key', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const prisma = makePrisma({
        configPolicyVersion: {
          findMany: jest.fn().mockResolvedValue([GLOBAL_ROW, tenantRow]),
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.listPolicies('tenant-a');

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('tenant-a');
    });

    it('queries both the tenant and the shared baseline', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = makePrisma({ configPolicyVersion: { findMany } });
      const service = new PolicyLifecycleService(prisma as never);

      await service.listPolicies('tenant-a', 'IAM');

      expect(findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ tenantId: 'tenant-a' }, { tenantId: null }],
          domain: 'IAM',
        },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('getPolicyById', () => {
    it('falls back to the shared baseline when the tenant has no fork', async () => {
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(GLOBAL_ROW),
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.getPolicyById('tenant-a', 'pol-2026-09-001');

      expect(result.id).toBe('pol-2026-09-001');
      expect(result.diffContent.proposed).toBe(GLOBAL_ROW.diffProposed);
    });

    it('throws NotFoundException when neither a fork nor a baseline exists', async () => {
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      await expect(
        service.getPolicyById('tenant-a', 'pol-non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('simulatePolicy', () => {
    it('reports changed and unchanged top-level keys for valid YAML, and records the audit event', async () => {
      const row = {
        ...GLOBAL_ROW,
        diffPrevious: 'a: 1\nb: 2',
        diffProposed: 'a: 1\nb: 3',
      };
      const recordAudit = jest.fn().mockResolvedValue({});
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(row),
        },
        configPolicyAuditEvent: { create: recordAudit },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const report = await service.simulatePolicy(
        'tenant-a',
        'pol-2026-09-001',
        'analyst-1',
      );

      expect(report.syntaxValid).toBe(true);
      expect(report.changedKeys).toEqual(['b']);
      expect(report.unchangedKeys).toEqual(['a']);
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SIMULATED',
            actorId: 'analyst-1',
          }),
        }),
      );
    });

    it('reports invalid syntax rather than throwing when the proposed diff does not parse', async () => {
      const row = { ...GLOBAL_ROW, diffProposed: 'a: [1, 2' };
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(row),
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const report = await service.simulatePolicy(
        'tenant-a',
        'pol-2026-09-001',
        'analyst-1',
      );

      expect(report.syntaxValid).toBe(false);
      expect(report.parseError).toBeDefined();
    });
  });

  describe('stagePolicy', () => {
    it('forks the shared baseline into a tenant-owned row before updating it', async () => {
      const forked = { ...GLOBAL_ROW, id: 'db-tenant-1', tenantId: 'tenant-a' };
      const create = jest.fn().mockResolvedValue(forked);
      const update = jest.fn().mockResolvedValue({
        ...forked,
        status: 'STAGED',
        canaryPercentage: 25,
      });
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(GLOBAL_ROW),
          create,
          update,
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.stagePolicy(
        'tenant-a',
        'pol-2026-09-001',
        { stagedEnvironment: 'staging-us-east1', canaryPercentage: 25 },
        'operator-1',
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-a' }),
        }),
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: 'db-tenant-1' },
        data: {
          stagedEnvironment: 'staging-us-east1',
          canaryPercentage: 25,
          status: 'STAGED',
        },
      });
      expect(result.status).toBe('STAGED');
    });

    it('marks the policy ACTIVE at 100% canary', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const update = jest.fn().mockResolvedValue({
        ...tenantRow,
        status: 'ACTIVE',
        canaryPercentage: 100,
      });
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(tenantRow),
          update,
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.stagePolicy(
        'tenant-a',
        'pol-2026-09-001',
        { stagedEnvironment: 'production-global', canaryPercentage: 100 },
        'operator-1',
      );

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('approvePolicy (4-eyes dual-custody)', () => {
    it('promotes to ACTIVE once a second distinct approver signs', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const update = jest.fn().mockResolvedValue({
        ...tenantRow,
        approvers: [...tenantRow.approvers, 'ciso@zoikoshield.corp'],
        status: 'ACTIVE',
      });
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(tenantRow),
          update,
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.approvePolicy(
        'tenant-a',
        'pol-2026-09-001',
        'ciso@zoikoshield.corp',
      );

      expect(result.approvers).toContain('ciso@zoikoshield.corp');
      expect(result.status).toBe('ACTIVE');
    });

    it('rejects a duplicate approval from the same approver', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(tenantRow),
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      await expect(
        service.approvePolicy(
          'tenant-a',
          'pol-2026-09-001',
          'soc-lead@zoikoshield.corp',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rollbackPolicy', () => {
    it('zeroes canary and records the reversal reason', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const update = jest.fn().mockResolvedValue({
        ...tenantRow,
        status: 'ROLLED_BACK',
        canaryPercentage: 0,
        reversalReason: 'Canary anomaly detected.',
      });
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(tenantRow),
          update,
        },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const result = await service.rollbackPolicy(
        'tenant-a',
        'pol-2026-09-001',
        { reason: 'Canary anomaly detected.' },
        'sre-lead@tenant.com',
      );

      expect(result.status).toBe('ROLLED_BACK');
      expect(result.canaryPercentage).toBe(0);
      expect(result.reversalReason).toBe('Canary anomaly detected.');
    });
  });

  describe('listAuditEvents', () => {
    it('returns the append-only audit trail for a policy, most recent first', async () => {
      const tenantRow = {
        ...GLOBAL_ROW,
        id: 'db-tenant-1',
        tenantId: 'tenant-a',
      };
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'evt-2',
          action: 'APPROVED',
          actorId: 'ciso@zoikoshield.corp',
          detail: 'Approval 2 recorded',
          occurredAt: new Date('2026-10-01T10:00:00.000Z'),
        },
      ]);
      const prisma = makePrisma({
        configPolicyVersion: {
          findUnique: jest.fn().mockResolvedValue(tenantRow),
        },
        configPolicyAuditEvent: { findMany },
      });
      const service = new PolicyLifecycleService(prisma as never);

      const events = await service.listAuditEvents(
        'tenant-a',
        'pol-2026-09-001',
      );

      expect(findMany).toHaveBeenCalledWith({
        where: { policyVersionId: 'db-tenant-1' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(events[0].action).toBe('APPROVED');
    });
  });
});
