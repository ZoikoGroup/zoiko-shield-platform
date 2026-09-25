import { JitElevationService } from './jit-elevation.service';
import type { JitElevationRequest } from './entities/jit-elevation-request.entity';
import type { TenantMembership } from './entities/tenant-membership.entity';
import type { Role } from './entities/role.entity';
import type { IdentityEvent } from '../identity-adapter/identity-event.entity';

describe('JitElevationService (Dual-Authorized Scoped & Time-Bound Tenant Access)', () => {
  let jitService: JitElevationService;
  let jitRequests: JitElevationRequest[] = [];
  let memberships: TenantMembership[] = [];
  let roles: Role[] = [];
  let events: IdentityEvent[] = [];

  // In-memory stand-in for the Prisma delegates the service uses. Rows are
  // mutated in place on update, as a database row would be re-read.
  const joinRoles = (membershipId: string, data: any) =>
    (data?.create ?? []).map((userRole: any) => ({
      membership_id: membershipId,
      role_id: userRole.role_id,
    }));

  const fakePrisma = {
    jitElevationRequest: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `jit-req-${Math.random()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        jitRequests.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = jitRequests.find((r) => r.id === where.id);
        if (!row) throw new Error(`No JIT request ${where.id}`);
        return Object.assign(row, data, { updatedAt: new Date() });
      }),
      findUnique: jest.fn(
        async ({ where }: any) =>
          jitRequests.find((r) => r.id === where.id) || null,
      ),
      findFirst: jest.fn(
        async ({ where }: any) =>
          jitRequests.find(
            (r) =>
              r.superAdminPrincipalId === where.superAdminPrincipalId &&
              r.targetTenantId === where.targetTenantId &&
              r.status === where.status &&
              (!where.expiresAt?.gt ||
                (r.expiresAt !== null && r.expiresAt > where.expiresAt.gt)),
          ) || null,
      ),
      findMany: jest.fn(async ({ where }: any) => {
        if (where.targetTenantId) {
          return jitRequests.filter(
            (r) => r.targetTenantId === where.targetTenantId,
          );
        }
        if (where.status === 'APPROVED') {
          return jitRequests.filter(
            (r) =>
              r.status === 'APPROVED' &&
              r.expiresAt &&
              r.expiresAt <= where.expiresAt.lte,
          );
        }
        return jitRequests;
      }),
    },
    tenantMembership: {
      create: jest.fn(async ({ data }: any) => {
        const id = `mem-${Math.random()}`;
        const { roles: roleData, ...fields } = data;
        const row: any = {
          id,
          ...fields,
          roles: joinRoles(id, roleData),
          joinedAt: new Date(),
        };
        memberships.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row: any = memberships.find((m) => m.id === where.id);
        if (!row) throw new Error(`No membership ${where.id}`);
        const { roles: roleData, ...fields } = data;
        Object.assign(row, fields);
        if (roleData)
          row.roles = [...row.roles, ...joinRoles(row.id, roleData)];
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return memberships.find((m) => m.id === where.id) || null;
        const key = where.tenantId_principalId;
        return (
          memberships.find(
            (m) =>
              m.tenantId === key.tenantId && m.principalId === key.principalId,
          ) || null
        );
      }),
    },
    role: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `role-${Math.random()}`, ...data };
        roles.push(row);
        return row;
      }),
      findFirst: jest.fn(async () => ({
        id: 'role-analyst-1',
        tenantId: null,
        code: 'TENANT_SECURITY_ANALYST',
        name: 'Tenant Security Analyst',
        roleLevel: 'TENANT',
        createdAt: new Date(),
      })),
    },
    identityEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `evt-${Math.random()}`,
          ...data,
          occurredAt: new Date(),
        };
        events.push(row);
        return row;
      }),
    },
  } as any;

  beforeEach(() => {
    jitRequests = [];
    memberships = [];
    roles = [];
    events = [];
    jest.clearAllMocks();

    jitService = new JitElevationService(fakePrisma);
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

  it('7. should verify FIDO2/WebAuthn step-up challenge with hardware attestation digest', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose: 'Hardware MFA step-up verification test',
    });

    const verification = await jitService.verifyStepUpChallenge({
      requestId: req.id,
      principalId: 'admin-super-01',
      clientDataJson: Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: 'test-challenge' }),
      ).toString('base64'),
      signature: 'mock-fido2-signature-bytes',
      authenticatorData: 'mock-auth-data',
    });

    expect(verification.verified).toBe(true);
    expect(verification.hardwareProofDigest).toBeDefined();
    expect(verification.hardwareProofDigest.length).toBe(64); // SHA-256 hex string
    expect(
      events.some((e) => e.eventType === 'JIT_STEPUP_CHALLENGE_VERIFIED'),
    ).toBe(true);
  });

  it('8. should reject step-up challenge when signature or clientDataJson is missing', async () => {
    const req = await jitService.requestElevation({
      superAdminPrincipalId: 'admin-super-01',
      targetTenantId: 'tenant-acme-bank',
      statedPurpose: 'Hardware MFA step-up validation test',
    });

    await expect(
      jitService.verifyStepUpChallenge({
        requestId: req.id,
        principalId: 'admin-super-01',
        clientDataJson: '',
        signature: '',
      }),
    ).rejects.toThrow('FIDO2_ATTESTATION_REQUIRED');
  });

  it('9. should reject step-up challenge when JIT request is not found', async () => {
    await expect(
      jitService.verifyStepUpChallenge({
        requestId: 'non-existent-jit-req',
        principalId: 'admin-super-01',
        clientDataJson: 'dummy-client-data',
        signature: 'dummy-sig',
      }),
    ).rejects.toThrow("JIT request 'non-existent-jit-req' not found");
  });
});
