import { JitElevationService } from './jit-elevation.service';
import { JitElevationRequest } from './entities/jit-elevation-request.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { Role } from './entities/role.entity';
import { IdentityEvent } from '../identity-adapter/identity-event.entity';

describe('JitElevationService (Dual-Authorized Scoped & Time-Bound Tenant Access)', () => {
  let jitService: JitElevationService;
  let jitRequests: JitElevationRequest[] = [];
  let memberships: TenantMembership[] = [];
  let roles: Role[] = [];
  let events: IdentityEvent[] = [];

  const fakeJitRepo = {
    create: (data: any) => ({
      id: `jit-req-${Math.random()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    save: jest.fn(async (entity: any) => {
      const idx = jitRequests.findIndex((r) => r.id === entity.id);
      if (idx >= 0) {
        jitRequests[idx] = entity;
      } else {
        jitRequests.push(entity);
      }
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) return jitRequests.find((r) => r.id === where.id) || null;
      if (where.superAdminPrincipalId && where.targetTenantId) {
        return (
          jitRequests.find(
            (r) =>
              r.superAdminPrincipalId === where.superAdminPrincipalId &&
              r.targetTenantId === where.targetTenantId &&
              r.status === where.status,
          ) || null
        );
      }
      return null;
    }),
    find: jest.fn(async ({ where }: any) => {
      if (where.targetTenantId) {
        return jitRequests.filter(
          (r) => r.targetTenantId === where.targetTenantId,
        );
      }
      return jitRequests;
    }),
  } as any;

  const fakeMembershipRepo = {
    create: (data: any) => ({
      id: `mem-${Math.random()}`,
      ...data,
      joinedAt: new Date(),
    }),
    save: jest.fn(async (entity: any) => {
      const idx = memberships.findIndex((m) => m.id === entity.id);
      if (idx >= 0) {
        memberships[idx] = entity;
      } else {
        memberships.push(entity);
      }
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) return memberships.find((m) => m.id === where.id) || null;
      if (where.tenantId && where.principalId) {
        return (
          memberships.find(
            (m) =>
              m.tenantId === where.tenantId &&
              m.principalId === where.principalId,
          ) || null
        );
      }
      return null;
    }),
  } as any;

  const fakeRoleRepo = {
    create: (data: any) => ({ id: `role-${Math.random()}`, ...data }),
    save: jest.fn(async (entity: any) => {
      roles.push(entity);
      return entity;
    }),
    findOne: jest.fn(async () => ({
      id: 'role-analyst-1',
      code: 'TENANT_SECURITY_ANALYST',
      name: 'Tenant Security Analyst',
      roleLevel: 'TENANT',
      permissions: [],
    })),
  } as any;

  const fakeIdentityEventRepo = {
    create: (data: any) => ({
      id: `evt-${Math.random()}`,
      ...data,
      createdAt: new Date(),
    }),
    save: jest.fn(async (entity: any) => {
      events.push(entity);
      return entity;
    }),
  } as any;

  beforeEach(() => {
    jitRequests = [];
    memberships = [];
    roles = [];
    events = [];
    jest.clearAllMocks();

    fakeJitRepo.find = jest.fn(async ({ where }: any) => {
      if (where.targetTenantId) {
        return jitRequests.filter(
          (r) => r.targetTenantId === where.targetTenantId,
        );
      }
      if (where.status === 'APPROVED') {
        return jitRequests.filter(
          (r) =>
            r.status === 'APPROVED' && r.expiresAt && r.expiresAt <= new Date(),
        );
      }
      return jitRequests;
    });

    jitService = new JitElevationService(
      fakeJitRepo,
      fakeMembershipRepo,
      fakeRoleRepo,
      fakeIdentityEventRepo,
    );
  });

  it('1. should create a PENDING JIT elevation request with stated purpose', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose:
        'Investigating high severity data exfiltration alert INC-9001',
      requestedDurationMinutes: 60,
    });

    expect(req.id).toBeDefined();
    expect(req.status).toBe('PENDING');
    expect(req.statedPurpose).toBe(
      'Investigating high severity data exfiltration alert INC-9001',
    );
    expect(req.requestedDurationMinutes).toBe(60);
    expect(events.some((e) => e.eventType === 'JIT_ELEVATION_REQUESTED')).toBe(
      true,
    );
  });

  it('2. should reject self-approval due to dual-authorization requirement', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose:
        'Investigating high severity data exfiltration alert INC-9001',
    });

    await expect(
      jitService.approveElevation({
        requestId: req.id,
        approverPrincipalId: 'admin-super-01', // Self approval attempt!
      }),
    ).rejects.toThrow('DUAL_AUTHORIZATION_REQUIRED');
  });

  it('3. should allow independent peer admin to approve and create time-bound TenantMembership', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose:
        'Investigating high severity data exfiltration alert INC-9001',
      requestedDurationMinutes: 60,
    });

    const approved = await jitService.approveElevation({
      requestId: req.id,
      approverPrincipalId: 'admin-peer-02',
    });

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedByPrincipalId).toBe('admin-peer-02');
    expect(approved.expiresAt).toBeDefined();

    // Verify created membership
    const membership = memberships.find(
      (m) => m.principalId === 'admin-super-01',
    );
    expect(membership).toBeDefined();
    expect(membership?.status).toBe('ACTIVE');
    expect(membership?.source).toBe('JIT_ELEVATION');
    expect(membership?.expiresAt).toBeDefined();
    expect(membership?.elevationPurpose).toBe(req.statedPurpose);
    expect(membership?.elevationApprovedBy).toBe('admin-peer-02');

    // Customer-visible audit event verified
    expect(events.some((e) => e.eventType === 'JIT_ELEVATION_GRANTED')).toBe(
      true,
    );
  });

  it('4. should support auto-approved internal break-glass elevation', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose:
        'Emergency containment for live ransomware encryption probe',
      requestedDurationMinutes: 30,
      isInternalAutoApproved: true,
      autoApprovalReason: 'P0_CRITICAL_INCIDENT_BREAK_GLASS',
    });

    expect(req.status).toBe('APPROVED');
    expect(req.membershipId).toBeDefined();
    const membership = memberships.find(
      (m) => m.principalId === 'admin-super-01',
    );
    expect(membership?.status).toBe('ACTIVE');
    expect(membership?.source).toBe('JIT_ELEVATION');
  });

  it('5. should sweep and expire overdue memberships', async () => {
    // Inject past approved request
    const pastDate = new Date(Date.now() - 60000);
    const expiredReq: any = {
      id: 'req-past-01',
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      status: 'APPROVED',
      expiresAt: pastDate,
      membershipId: 'mem-past-01',
      customerVisibleAuditLogRef: 'audit-ref-01',
    };
    jitRequests.push(expiredReq);
    memberships.push({
      id: 'mem-past-01',
      tenantId: 'tenant-acme-bank',
      principalId: 'admin-super-01',
      status: 'ACTIVE',
      source: 'JIT_ELEVATION',
      expiresAt: pastDate,
      elevationPurpose: 'Old test',
      elevationApprovedBy: 'admin-02',
      roles: [],
      joinedAt: new Date(),
    });

    const res = await jitService.sweepExpiredMemberships();
    expect(res.expiredCount).toBe(1);
    expect(expiredReq.status).toBe('EXPIRED');
    expect(memberships[0].status).toBe('REMOVED');
    expect(events.some((e) => e.eventType === 'JIT_ELEVATION_EXPIRED')).toBe(
      true,
    );
  });

  it('6. should provide full customer-visible audit trail for tenant', async () => {
    await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose:
        'Investigating high severity data exfiltration alert INC-9001',
      isInternalAutoApproved: true,
    });

    const trail = await jitService.getCustomerAuditTrail('tenant-acme-bank');
    expect(trail).toHaveLength(1);
    expect(trail[0].targetTenantId).toBe('tenant-acme-bank');
    expect(trail[0].customerVisibleAuditLogRef).toBeDefined();
  });
});
