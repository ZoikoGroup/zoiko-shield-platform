import type { PrismaService } from '../../apps/shield-core/src/prisma/prisma.service';

/**
 * In-memory stand-in for the Prisma delegate PostureDriftDetectorService
 * uses, for the offline simulation scripts. Rows live in the caller's array
 * so the script can assert on them; $transaction just runs each operation
 * in order, since there is nothing here that needs real atomicity.
 */
export function createInMemoryPostureDriftPrisma(store: {
  findings: any[];
}): PrismaService {
  const fake = {
    postureDriftFinding: {
      deleteMany: async ({ where }: any) => {
        const before = store.findings.length;
        store.findings = store.findings.filter(
          (f) => f.tenantId !== where.tenantId,
        );
        return { count: before - store.findings.length };
      },
      createMany: async ({ data }: any) => {
        const rows = (data as any[]).map((d) => ({
          ...d,
          remediationReceipt: null,
          updatedAt: new Date(),
        }));
        store.findings.push(...rows);
        return { count: rows.length };
      },
      findMany: async ({ where }: any) =>
        store.findings
          .filter((f) => f.tenantId === where.tenantId)
          .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()),
      findUnique: async ({ where }: any) =>
        store.findings.find((f) => f.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = store.findings.find((f) => f.id === where.id);
        if (!row) throw new Error(`No posture drift finding ${where.id}`);
        return Object.assign(row, data, { updatedAt: new Date() });
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return fake as unknown as PrismaService;
}
