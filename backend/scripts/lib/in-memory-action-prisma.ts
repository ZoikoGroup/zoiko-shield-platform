import { randomUUID } from 'crypto';
import type { PrismaService as ShieldActionPrismaService } from '../../apps/shield-action/src/prisma/prisma.service';

/**
 * In-memory stand-in for the Prisma delegates DurableContainmentEscalationService uses,
 * for offline simulation and verification scripts.
 */
export function createInMemoryActionPrisma(): ShieldActionPrismaService {
  const instances = new Map<string, any>();
  const transitionsByInstance = new Map<string, any[]>();

  const toRow = (instanceId: string) => {
    const row = instances.get(instanceId);
    if (!row) return null;
    return {
      ...row,
      transitions: [...(transitionsByInstance.get(instanceId) ?? [])].sort(
        (a, b) =>
          new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
      ),
    };
  };

  const fake = {
    $connect: async () => {},
    $disconnect: async () => {},
    durableWorkflowInstance: {
      create: async ({ data }: any) => {
        const id = `dwi-${randomUUID().slice(0, 8)}`;
        const { transitions, ...rest } = data;
        instances.set(id, { id, ...rest, completed_at: null, created_at: new Date(), updated_at: new Date() });
        transitionsByInstance.set(
          id,
          (transitions?.create ?? []).map((t: any, i: number) => ({
            id: `dwt-${id}-${i}`,
            workflow_instance_id: id,
            recorded_by: null,
            occurred_at: new Date(),
            ...t,
          })),
        );
        return toRow(id);
      },
      findUnique: async ({ where }: any) => {
        const entry = [...instances.entries()].find(
          ([, row]) => row.workflow_id === where.workflow_id,
        );
        return entry ? toRow(entry[0]) : null;
      },
      update: async ({ where, data }: any) => {
        const entry = [...instances.entries()].find(
          ([, row]) => row.workflow_id === where.workflow_id,
        );
        if (!entry) throw new Error(`Workflow ${where.workflow_id} not found`);
        const [id, row] = entry;
        const { transitions, ...rest } = data;
        const merged = { ...row, ...rest, updated_at: new Date() };
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
              occurred_at: new Date(),
              ...t,
            })),
          ]);
        }
        return toRow(id);
      },
    },
  };

  return fake as unknown as ShieldActionPrismaService;
}
