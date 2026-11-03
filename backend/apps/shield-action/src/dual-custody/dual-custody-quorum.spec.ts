import {
  DualCustodyQuorumService,
  DualCustodyQuorumRequest,
  ApproverIdentity,
} from './dual-custody-quorum.service';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

/**
 * A fake Postgres for action.DualCustodyQuorum, shared by reference so two
 * service instances behave like two processes on one database. updateMany
 * applies its where clause atomically, as a conditional UPDATE does.
 */
function createFakeDb() {
  const rows = new Map<string, any>();
  const key = (t: string, q: string) => `${t}:${q}`;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([field, cond]: [string, any]) => {
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('in' in cond) return cond.in.includes(row[field]);
        if ('gt' in cond) return row[field] > cond.gt;
      }
      return row[field] === cond;
    });
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  return {
    rows,
    dualCustodyQuorum: {
      create: jest.fn(async ({ data }: any) => {
        await tick();
        const k = key(data.tenant_id, data.quorum_id);
        if (rows.has(k)) throw new Error('unique violation');
        const row = {
          id: `dcq-${rows.size + 1}`,
          secondary_approver: null,
          quorum_signature: null,
          finalized_at: null,
          consumed_at: null,
          ...data,
        };
        rows.set(k, row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        await tick();
        const { tenant_id, quorum_id } = where.tenant_id_quorum_id;
        const row = rows.get(key(tenant_id, quorum_id));
        return row ? { ...row } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        await tick();
        let count = 0;
        for (const row of rows.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      }),
    },
  };
}

describe('DualCustodyQuorumService', () => {
  let service: DualCustodyQuorumService;
  let db: ReturnType<typeof createFakeDb>;

  const initiator: ApproverIdentity = {
    userId: 'usr-analyst-lead-01',
    fullName: 'Sarah Chen (Lead Analyst)',
    role: 'SECURITY_OPERATIONS_LEAD',
    fido2WebAuthnSignature: 'fido2-webauthn-sig-hardware-token-01',
    signedAt: new Date().toISOString(),
  };

  const secondaryApprover: ApproverIdentity = {
    userId: 'usr-soc-director-02',
    fullName: 'David Ross (SOC Director)',
    role: 'TENANT_OWNER',
    fido2WebAuthnSignature: 'fido2-webauthn-sig-hardware-token-02',
    signedAt: new Date().toISOString(),
  };

  const sampleRequest: DualCustodyQuorumRequest = {
    tenantId: 'tenant-enterprise-bank-01',
    environmentId: 'prod-us-east-1',
    caseId: 'case-2026-auth-01',
    proposalId: 'prop-isolate-db-01',
    actionType: 'ISOLATE_ENDPOINT',
    targetResource: 'srv-db-prod-01',
    authorityLevel: 'R2',
    blastRadiusScore: 0.15,
    reversibilityTier: 'R1',
    compensatingCommand: 'UNQUARANTINE_ENDPOINT',
    initiator,
    ttlMinutes: 15,
  };

  beforeEach(() => {
    db = createFakeDb();
    service = new DualCustodyQuorumService(db as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The fake DB yields via setImmediate, so only the clock is faked.
  const advancePastExpiry = () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);
  };

  const reachQuorum = async (
    overrides: Partial<DualCustodyQuorumRequest> = {},
  ) => {
    const quorum = await service.initiateQuorum({
      ...sampleRequest,
      ...overrides,
    });
    await service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );
    return quorum;
  };

  it('should initiate a dual-custody approval quorum in PENDING_SECOND_SIGNATURE state', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);

    expect(quorum).toBeDefined();
    expect(quorum.quorumId).toMatch(/^quorum-/);
    expect(quorum.status).toBe('PENDING_SECOND_SIGNATURE');
    expect(quorum.singleUseRollbackToken).toMatch(/^ZS-ROLLBACK-TOKEN-/);
    expect(quorum.compensatingPlan.rollbackCommand).toBe(
      'UNQUARANTINE_ENDPOINT',
    );
  });

  it('should reject initiation if initiator FIDO2 signature is omitted', async () => {
    const invalidRequest = {
      ...sampleRequest,
      initiator: {
        ...initiator,
        fido2WebAuthnSignature: '',
      },
    };

    await expect(service.initiateQuorum(invalidRequest)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should strictly reject self-approval by the initiator (Two-Man rule non-negotiable invariant)', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);

    // Initiator attempts to approve their own request as secondary approver
    await expect(
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        initiator,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should successfully finalize quorum when a distinct authorized approver signs with FIDO2', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    const finalized = await service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );

    expect(finalized.status).toBe('QUORUM_REACHED');
    expect(finalized.secondaryApprover?.userId).toBe(secondaryApprover.userId);
    expect(finalized.quorumSignature).toBeDefined();
    expect(finalized.finalizedAt).toBeDefined();

    // Verify validation for execution
    const validation = await service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );

    expect(validation.valid).toBe(true);
    expect(validation.receipt?.quorumSignature).toBe(finalized.quorumSignature);
  });

  it('should reject execution validation if quorum is still pending second signature', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);

    const validation = await service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('PENDING_SECOND_SIGNATURE');
  });

  it('should reject approval if the quorum ticket has expired', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    advancePastExpiry();

    await expect(
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        secondaryApprover,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for unknown quorum IDs', async () => {
    await expect(
      service.signSecondApproval(
        sampleRequest.tenantId,
        'quorum-unknown-999',
        secondaryApprover,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject replaying/re-signing an already finalized quorum', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    await service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );

    // Attempting to sign again should fail
    const anotherApprover: ApproverIdentity = {
      userId: 'usr-analyst-03',
      fullName: 'Alice Smith',
      role: 'INCIDENT_COMMANDER',
      fido2WebAuthnSignature: 'fido2-sig-03',
      signedAt: new Date().toISOString(),
    };

    await expect(
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        anotherApprover,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should enforce strict cross-tenant isolation (Tenant B cannot access or approve Tenant A quorum)', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    const rogueTenantId = 'tenant-unauthorized-attacker';

    await expect(
      service.signSecondApproval(
        rogueTenantId,
        quorum.quorumId,
        secondaryApprover,
      ),
    ).rejects.toThrow(NotFoundException);

    const validation = await service.validateQuorumForExecution(
      rogueTenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('not found');
  });

  it('should reject execution validation if proposalId does not match the quorum', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    await service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );

    const validation = await service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      'tampered-fake-proposal-id',
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('does not match requested proposal');
  });

  it('should keep a pending quorum across a restart (fresh instance, same database)', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);

    const afterRestart = new DualCustodyQuorumService(db as any);
    const finalized = await afterRestart.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );
    expect(finalized.status).toBe('QUORUM_REACHED');

    const validation = await new DualCustodyQuorumService(
      db as any,
    ).validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );
    expect(validation.valid).toBe(true);
  });

  it('should let exactly one of two concurrent second approvers finalize the quorum', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    const otherApprover: ApproverIdentity = {
      ...secondaryApprover,
      userId: 'usr-incident-commander-03',
      fullName: 'Priya Nair (Incident Commander)',
      role: 'INCIDENT_COMMANDER',
    };

    const results = await Promise.allSettled([
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        secondaryApprover,
      ),
      new DualCustodyQuorumService(db as any).signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        otherApprover,
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject execution when the stored quorum row was forged in the database', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    await service.signSecondApproval(
      sampleRequest.tenantId,
      quorum.quorumId,
      secondaryApprover,
    );

    const row = db.rows.get(`${sampleRequest.tenantId}:${quorum.quorumId}`);
    row.secondary_approver = JSON.stringify({
      ...secondaryApprover,
      userId: 'usr-attacker-99',
    });

    const validation = await service.validateQuorumForExecution(
      sampleRequest.tenantId,
      quorum.quorumId,
      sampleRequest.proposalId,
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('does not verify');
  });

  it('should persist EXPIRED status when an expired quorum is signed', async () => {
    const quorum = await service.initiateQuorum(sampleRequest);
    advancePastExpiry();
    await expect(
      service.signSecondApproval(
        sampleRequest.tenantId,
        quorum.quorumId,
        secondaryApprover,
      ),
    ).rejects.toThrow(BadRequestException);

    const stored = await service.getQuorum(
      sampleRequest.tenantId,
      quorum.quorumId,
    );
    expect(stored.status).toBe('EXPIRED');
  });

  describe('TTL cap', () => {
    it('caps a requested TTL above 15 minutes at 15 minutes', async () => {
      const before = Date.now();
      const quorum = await service.initiateQuorum({
        ...sampleRequest,
        ttlMinutes: 600,
      });
      const ttlMs = new Date(quorum.expiresAt).getTime() - before;
      expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });

    it('rejects a non-positive TTL', async () => {
      await expect(
        service.initiateQuorum({ ...sampleRequest, ttlMinutes: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('consumeForExecution', () => {
    const approvalFor = (quorumId: string) => ({
      quorumId,
      proposalId: sampleRequest.proposalId,
    });

    it('authorizes exactly one execution for the approved action and target', async () => {
      const quorum = await reachQuorum();
      const receipt = await service.consumeForExecution(
        sampleRequest.tenantId,
        approvalFor(quorum.quorumId),
        'ISOLATE_ENDPOINT',
        'srv-db-prod-01',
      );
      expect(receipt.quorumId).toBe(quorum.quorumId);

      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(
        (await service.getQuorum(sampleRequest.tenantId, quorum.quorumId))
          .status,
      ).toBe('CONSUMED');
    });

    it('lets only one of two concurrent executions consume the quorum', async () => {
      const quorum = await reachQuorum();
      const attempt = () =>
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        );
      const results = await Promise.allSettled([attempt(), attempt()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('rejects a missing approval, a pending quorum, and a different tenant', async () => {
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          undefined,
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);

      const pending = await service.initiateQuorum(sampleRequest);
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(pending.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);

      const approved = await reachQuorum({
        proposalId: sampleRequest.proposalId,
      });
      await expect(
        service.consumeForExecution(
          'tenant-other',
          approvalFor(approved.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an approval reused for a different action or target', async () => {
      const quorum = await reachQuorum();
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'SUSPEND_USER',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-02',
        ),
      ).rejects.toThrow(ForbiddenException);
      // A rejected mismatch must not burn the approval.
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).resolves.toBeDefined();
    });

    it('rejects an expired quorum', async () => {
      const quorum = await reachQuorum();
      advancePastExpiry();
      await expect(
        service.consumeForExecution(
          sampleRequest.tenantId,
          approvalFor(quorum.quorumId),
          'ISOLATE_ENDPOINT',
          'srv-db-prod-01',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
