/**
 * Fake ingest.DlqMessage table, shared by reference so two service instances
 * behave like two processes on one database. updateMany applies its where
 * clause atomically, as a conditional UPDATE does.
 */
export function createFakeDlqDb() {
  const rows: any[] = [];
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  const fieldMatches = (value: any, cond: any): boolean => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('lt' in cond) return value != null && value < cond.lt;
      if ('gt' in cond) return value != null && value > cond.gt;
    }
    return value === cond;
  };
  const matches = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([field, cond]: [string, any]) =>
      field === 'OR'
        ? cond.some((alt: any) => matches(row, alt))
        : fieldMatches(row[field], cond),
    );
  const apply = (row: any, data: any) => {
    for (const [field, value] of Object.entries<any>(data)) {
      row[field] =
        value && typeof value === 'object' && 'increment' in value
          ? row[field] + value.increment
          : value;
    }
  };
  const project = (row: any, select?: Record<string, boolean>) =>
    select
      ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
      : { ...row };

  return {
    rows,
    dlqMessage: {
      create: jest.fn(async ({ data }: any) => {
        await tick();
        const row = {
          id: `row-${rows.length + 1}`,
          attempt_count: 0,
          max_attempts: 3,
          last_error: null,
          last_attempt_at: null,
          replayed_at: null,
          quarantined_at: new Date(),
          connector_id: null,
          environment_id: null,
          source_region: null,
          kafka_topic: null,
          kafka_partition: null,
          kafka_offset: null,
          // Prisma treats an undefined field as "not set", so the column stays NULL.
          ...Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
        };
        rows.push(row);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        await tick();
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findMany: jest.fn(async ({ where, distinct, select }: any) => {
        await tick();
        let found = rows.filter((r) => matches(r, where));
        if (distinct) {
          const seen = new Set<string>();
          found = found.filter((r) => {
            const key = distinct.map((f: string) => r[f]).join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        return found.map((r) => project(r, select));
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        await tick();
        let count = 0;
        for (const row of rows) {
          if (matches(row, where)) {
            apply(row, data);
            count++;
          }
        }
        return { count };
      }),
      count: jest.fn(
        async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
      ),
    },
  };
}

export type FakeDlqDb = ReturnType<typeof createFakeDlqDb>;
