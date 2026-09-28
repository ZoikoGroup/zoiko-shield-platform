import { DurableContainmentEscalationService } from './durable-containment-escalation.service';

/**
 * A minimal fake Postgres, shared by reference between test instances, so
 * that two independently-constructed DurableContainmentEscalationService
 * objects genuinely share no JS-level state — the property that proves
 * durability/resumability, since a real process restart isn't practical in
 * a unit test. Each PrismaService mock built from the same store behaves
 * like two processes talking to the same database.
 */
function createFakeDb() {
  const instances = new Map<string, any>();
  const transitionsByInstance = new Map<string, any[]>();

  const toRow = (instanceId: string) => {
    const row = instances.get(instanceId);
    return {
      ...row,
      transitions: [...(transitionsByInstance.get(instanceId) ?? [])].sort(
        (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
      ),
    };
  };

  const prisma = {
    durableWorkflowInstance: {
      create: jest.fn(async ({ data }: any) => {
        const id = `dwi-${instances.size + 1}`;
        const { transitions, ...rest } = data;
        instances.set(id, { id, ...rest, completed_at: null });
        transitionsByInstance.set(
          id,
          (transitions?.create ?? []).map((t: any, i: number) => ({
            id: `dwt-${id}-${i}`,
            workflow_instance_id: id,
            recorded_by: null,
            ...t,
          })),
        );
        return toRow(id);
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const entry = [...instances.entries()].find(
          ([, row]) => row.workflow_id === where.workflow_id,
        );
        return entry ? toRow(entry[0]) : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const entry = [...instances.entries()].find(
          ([, row]) => row.workflow_id === where.workflow_id,
        );
        if (!entry) throw new Error('not found');
        const [id, row] = entry;
        const { transitions, ...rest } = data;
        const merged = { ...row, ...rest };
        instances.set(id, merged);
        if (transitions?.create) {
          const existing = transitionsByInstance.get(id) ?? [];
          const toCreate = Array.isArray(transitions.create)
            ? transitions.create
            : [transitions.create];
          transitionsByInstance.set(id, [
            ...existing,
            ...toCreate.map((t: any, i: number) => ({
              id: `dwt-${id}-${existing.length + i}`,
              workflow_instance_id: id,
              recorded_by: null,
              ...t,
            })),
          ]);
        }
        return toRow(id);
      }),
    },
  };

  return prisma;
}

describe('DurableContainmentEscalationService (LAB 10 & 15 Multi-Approver Escalation)', () => {
  it('should start workflow and escalate to SOC Lead upon timeout', async () => {
    const db = createFakeDb();
    const service = new DurableContainmentEscalationService(db as any);

    const wf = await service.startContainmentWorkflow({
      workflowId: 'wf-inc-001',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-001',
      targetResource: 'srv-k8s-pod-01',
      actionType: 'ISOLATE_ENDPOINT',
      initialApprovalTier: 'TIER_1_SOC_ANALYST',
      analystApprovalTimeoutSeconds: 60,
    });

    expect(wf.currentState).toBe('AWAITING_ANALYST_APPROVAL');

    const escalated = await service.handleApprovalTimeout(
      wf.workflowId,
      'tenant-bank-01',
    );
    expect(escalated.currentState).toBe('ESCALATED_TO_SOC_LEAD');
    expect(escalated.currentTier).toBe('TIER_2_SOC_LEAD');
  });

  it('should verify step-up MFA and resolve containment workflow', async () => {
    const db = createFakeDb();
    const service = new DurableContainmentEscalationService(db as any);

    const wf = await service.startContainmentWorkflow({
      workflowId: 'wf-inc-002',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-002',
      targetResource: 'user@bank.com',
      actionType: 'REVOKE_IAM_SESSION',
      initialApprovalTier: 'TIER_2_SOC_LEAD',
      analystApprovalTimeoutSeconds: 60,
    });

    const resolved = await service.recordApprovalWithStepUpMfa(
      wf.workflowId,
      'tenant-bank-01',
      'soc.lead@bank.com',
      'APPROVE',
      'fido2-hw-key-yubikey-5c-attested',
    );

    expect(resolved.currentState).toBe('RESOLVED');
    expect(resolved.mfaChallengeVerified).toBe(true);
    expect(resolved.actionReceiptId).toBeDefined();
  });

  it('should throw error when step-up MFA token is missing or invalid', async () => {
    const db = createFakeDb();
    const service = new DurableContainmentEscalationService(db as any);

    const wf = await service.startContainmentWorkflow({
      workflowId: 'wf-inc-003',
      tenantId: 'tenant-bank-01',
      incidentRef: 'INC-2026-003',
      targetResource: 'user@bank.com',
      actionType: 'REVOKE_IAM_SESSION',
      initialApprovalTier: 'TIER_2_SOC_LEAD',
      analystApprovalTimeoutSeconds: 60,
    });

    await expect(
      service.recordApprovalWithStepUpMfa(
        wf.workflowId,
        'tenant-bank-01',
        'soc.lead@bank.com',
        'APPROVE',
        'invalid-software-token',
      ),
    ).rejects.toThrow('Step-up FIDO2 MFA challenge failed');
  });

  describe('durability across independent instances (fresh process proxy)', () => {
    it('resumes a workflow from a second, independent service instance sharing no in-process state with the writer', async () => {
      const db = createFakeDb();
      const writer = new DurableContainmentEscalationService(db as any);
      const reader = new DurableContainmentEscalationService(db as any);

      const wf = await writer.startContainmentWorkflow({
        workflowId: 'wf-durable-001',
        tenantId: 'tenant-durable-01',
        incidentRef: 'INC-2026-777',
        targetResource: 'srv-durable-01',
        actionType: 'ISOLATE_ENDPOINT',
        initialApprovalTier: 'TIER_1_SOC_ANALYST',
        analystApprovalTimeoutSeconds: 60,
      });

      // The reader has never seen `writer` and holds no reference to any Map
      // the writer populated — only the shared fake DB connects them.
      const resumed = await reader.resumeWorkflow(
        wf.workflowId,
        'tenant-durable-01',
      );

      expect(resumed.currentState).toBe('AWAITING_ANALYST_APPROVAL');
      expect(resumed.history).toHaveLength(2);
      expect(resumed.history.map((h) => h.state)).toEqual([
        'INITIALIZED',
        'AWAITING_ANALYST_APPROVAL',
      ]);
    });

    it('sees state transitions written by one instance from a different instance', async () => {
      const db = createFakeDb();
      const writer = new DurableContainmentEscalationService(db as any);
      const reader = new DurableContainmentEscalationService(db as any);

      const wf = await writer.startContainmentWorkflow({
        workflowId: 'wf-durable-002',
        tenantId: 'tenant-durable-02',
        incidentRef: 'INC-2026-778',
        targetResource: 'srv-durable-02',
        actionType: 'ISOLATE_ENDPOINT',
        initialApprovalTier: 'TIER_1_SOC_ANALYST',
        analystApprovalTimeoutSeconds: 60,
      });

      await writer.handleApprovalTimeout(wf.workflowId, 'tenant-durable-02');

      const resumed = await reader.resumeWorkflow(
        wf.workflowId,
        'tenant-durable-02',
      );
      expect(resumed.currentState).toBe('ESCALATED_TO_SOC_LEAD');
      expect(resumed.currentTier).toBe('TIER_2_SOC_LEAD');
      expect(resumed.history.map((h) => h.state)).toContain(
        'ESCALATED_TO_SOC_LEAD',
      );
    });

    it('throws for an unknown workflow rather than silently returning nothing', async () => {
      const db = createFakeDb();
      const service = new DurableContainmentEscalationService(db as any);

      await expect(
        service.resumeWorkflow('wf-never-existed', 'tenant-bank-01'),
      ).rejects.toThrow("Workflow 'wf-never-existed' not found");
    });
  });
});
