import { ControlMappingService } from './control-mapping.service';

function makePrisma() {
  const rows: any[] = [];
  return {
    rows,
    controlMapping: {
      create: jest.fn(async ({ data }: any) => {
        const row = { recorded_at: new Date(), valid_to: null, ...data };
        rows.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) => {
        return rows
          .filter((r) => {
            if (
              where.control_objective_id &&
              r.control_objective_id !== where.control_objective_id
            )
              return false;
            if (where.recorded_at?.lte && r.recorded_at > where.recorded_at.lte)
              return false;
            if (where.valid_from?.lte && r.valid_from > where.valid_from.lte)
              return false;
            const validToOk = where.OR.some((clause: any) =>
              clause.valid_to === null
                ? r.valid_to == null
                : r.valid_to > clause.valid_to.gt,
            );
            return validToOk;
          })
          .sort((a, b) => b.recorded_at - a.recorded_at);
      }),
    },
  } as any;
}

describe('ControlMappingService bitemporal semantics', () => {
  it('never rewrites a superseded row — correct() inserts a brand-new row with supersedes_id set', async () => {
    const prisma = makePrisma();
    const service = new ControlMappingService(prisma);

    const original = await service.create({
      controlObjectiveId: 'co1',
      frameworkVersionId: 'fv1',
      requirementId: 'req1',
      mappingType: 'FULL',
      mappingVersion: '1.0',
      validFrom: new Date('2026-01-01'),
    });

    const originalSnapshot = { ...original };

    const corrected = await service.correct(original.id, {
      mappingType: 'PARTIAL',
      mappingVersion: '1.1',
      validFrom: new Date('2026-06-01'),
    });

    expect(corrected.supersedes_id).toBe(original.id);
    // The original row's own fields must be byte-for-byte unchanged — never rewritten.
    expect(prisma.rows.find((r: any) => r.id === original.id)).toEqual(
      originalSnapshot,
    );
  });

  it('resolveAsOf reconstructs what was known at an earlier point, unaffected by a later correction', async () => {
    const prisma = makePrisma();
    const service = new ControlMappingService(prisma);

    const original = await service.create({
      controlObjectiveId: 'co1',
      frameworkVersionId: 'fv1',
      requirementId: 'req1',
      mappingType: 'FULL',
      mappingVersion: '1.0',
      validFrom: new Date('2026-01-01'),
    });

    const beforeCorrection = new Date();
    await new Promise((r) => setTimeout(r, 5));

    await service.correct(original.id, {
      mappingType: 'PARTIAL',
      mappingVersion: '1.1',
      validFrom: new Date('2026-01-01'),
    });

    const asOfBeforeCorrection = await service.resolveAsOf(
      'co1',
      new Date('2026-01-15'),
      beforeCorrection,
    );
    expect(asOfBeforeCorrection[0]?.mapping_type).toBe('FULL');

    const asOfNow = await service.resolveAsOf(
      'co1',
      new Date('2026-01-15'),
      new Date(),
    );
    expect(asOfNow[0]?.mapping_type).toBe('PARTIAL');
  });
});
