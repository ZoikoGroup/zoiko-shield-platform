import { ReportingProjectionRebuildService } from './reporting-projection-rebuild.service';
import { ReportingProjectionService } from './reporting-projection.service';

describe('ReportingProjectionRebuildService', () => {
  it('rebuilds every case from one projection query, flagging stale ones', async () => {
    const stale = {
      id: 'proj-1',
      tenant_id: 't-1',
      projection_type: 'CASE_POSTURE',
      source_object_id: 'case-1',
      payload: JSON.stringify({
        status: 'NEW',
        severity: 'HIGH',
        priority: 'P2',
      }),
      projection_version: 3,
    };
    const prisma = {
      case: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case-1',
            status: 'INVESTIGATING',
            severity: 'HIGH',
            priority: 'P2',
            updated_at: new Date(),
          },
          {
            id: 'case-2',
            status: 'NEW',
            severity: 'LOW',
            priority: 'P4',
            updated_at: new Date(),
          },
        ]),
      },
      reportingProjection: {
        findMany: jest.fn().mockResolvedValue([stale]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ReportingProjectionRebuildService(
      prisma as any,
      new ReportingProjectionService(prisma as any),
    );

    const result = await service.rebuildCasePosture('t-1');

    expect(result).toEqual({ rebuilt: 2, mismatches: 1 });
    expect(prisma.reportingProjection.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.reportingProjection.findFirst).not.toHaveBeenCalled();
    expect(prisma.reportingProjection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1' },
        data: expect.objectContaining({ projection_version: 4 }),
      }),
    );
    expect(prisma.reportingProjection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source_object_id: 'case-2',
          projection_version: 1,
        }),
      }),
    );
  });
});
