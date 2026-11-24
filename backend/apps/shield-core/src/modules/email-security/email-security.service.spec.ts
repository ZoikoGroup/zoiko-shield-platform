import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmailSecurityService } from './email-security.service';

describe('EmailSecurityService (ZoikoShield Email Security)', () => {
  const tenantId = 'tenant-1';
  const adminActor = {
    userId: 'user-admin-1',
    email: 'admin@example.com',
    roleCodes: ['SOC_ADMIN'],
  };
  const reviewerActor = {
    userId: 'user-reviewer-2',
    email: 'reviewer@example.com',
    roleCodes: ['SOC_ADMIN'],
  };
  const auditorActor = {
    userId: 'user-auditor-9',
    email: 'auditor@example.com',
    roleCodes: ['SECURITY_AUDITOR'],
  };

  function createService() {
    const prisma: any = {
      emailSourceConnection: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emailConnectionIntent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      sourceCoverageWindow: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      emailThreatFinding: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailThreatAdjudication: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      emailDetectionDecision: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailPolicyVersion: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailEvidenceManifest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailActionProposal: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emailAccessAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const caseService: any = {
      createStandalone: jest.fn().mockResolvedValue({ id: 'case-101' }),
    };
    const ingestClient: any = {
      testEmailSource: jest.fn(),
      syncEmailSource: jest.fn(),
      requestEmailBackfill: jest.fn(),
    };
    const aiClient: any = {
      evaluateEmailFinding: jest.fn(),
      benchmarkEmailDetections: jest.fn(),
    };
    const actionClient: any = {
      simulateEmailAction: jest.fn(),
      executeEmailAction: jest.fn(),
      rollbackEmailAction: jest.fn(),
    };
    const anchorClient: any = {
      anchorEmailManifest: jest.fn(),
      verifyEmailManifest: jest.fn(),
    };

    const vault: any = {
      assertConfigured: jest.fn(),
      store: jest.fn().mockResolvedValue('sec-1'),
      reveal: jest.fn().mockResolvedValue('secret-value'),
      revoke: jest.fn().mockResolvedValue(1),
      hasActive: jest.fn().mockResolvedValue(false),
    };
    const oauth: any = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://login.example/authorize?state=x'),
      exchangeCode: jest.fn().mockResolvedValue({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresInSeconds: 3600,
        grantedScopes: ['https://graph.microsoft.com/SecurityAlert.Read.All'],
      }),
      refreshAccessToken: jest.fn().mockResolvedValue({
        accessToken: 'at-2',
        refreshToken: null,
        expiresInSeconds: 3600,
        grantedScopes: [],
      }),
    };

    const service = new EmailSecurityService(
      prisma,
      caseService,
      ingestClient,
      aiClient,
      actionClient,
      anchorClient,
      vault,
      oauth,
    );

    return {
      service,
      prisma,
      caseService,
      ingestClient,
      aiClient,
      actionClient,
      anchorClient,
      vault,
      oauth,
    };
  }

  afterEach(() => {
    delete process.env.ENABLE_EMAIL_PHASE2_ACTIONS;
  });

  it('returns honest NO_COVERAGE when zero email sources exist (T01)', async () => {
    const { service } = createService();
    const overview = await service.getOverview(tenantId, {});
    expect(overview.protectionState).toBe('NO_COVERAGE');
    expect(overview.phase2ActionsLocked).toBe(true);
    expect(overview.coverageDenominator.completenessGrade).toBe('UNKNOWN');
  });

  it('rejects unsupported providers (Shield supports MICROSOFT_365 and GOOGLE_WORKSPACE only)', async () => {
    const { service } = createService();
    await expect(
      service.createConnectionIntent(tenantId, adminActor, {
        provider: 'ZOIKO_MAIL' as any,
        displayName: 'Invalid Feed',
        requestedScopes: ['SecurityAlert.Read.All'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks Microsoft Mail.ReadWrite and Google gmail.modify scopes in Phase 0/1 (S01, S02, T18)', async () => {
    const { service } = createService();
    await expect(
      service.createConnectionIntent(tenantId, adminActor, {
        provider: 'MICROSOFT_365',
        displayName: 'M365 Defender',
        requestedScopes: ['SecurityAlert.Read.All', 'Mail.ReadWrite'],
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.createConnectionIntent(tenantId, adminActor, {
        provider: 'GOOGLE_WORKSPACE',
        displayName: 'Google Alert Center',
        requestedScopes: ['https://www.googleapis.com/auth/gmail.modify'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('halts sync when connector is REVOKED (T16)', async () => {
    const { service, prisma } = createService();
    prisma.emailSourceConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      tenant_id: tenantId,
      status: 'REVOKED',
    });

    await expect(
      service.syncConnector(tenantId, adminActor, 'conn-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies role-scoped field masking for SECURITY_AUDITOR (E06)', async () => {
    const { service, prisma } = createService();
    prisma.emailThreatFinding.findMany.mockResolvedValue([
      {
        id: 'finding-1',
        tenant_id: tenantId,
        provider: 'MICROSOFT_365',
        source_event_ref: 'evt-1',
        threat_class: 'BEC',
        severity: 'HIGH',
        status: 'OBSERVED',
        subject_ref: 'wire-transfer-urgent-token-ref',
        metadata: { sensitiveHeader: 'val' },
      },
    ]);

    const res = await service.listThreats(tenantId, auditorActor, {});
    expect(res.items[0].subject_ref).toBe(
      '[REDACTED_FOR_AUDITOR_LEAST_PRIVILEGE]',
    );
    expect(res.items[0].metadata).toEqual({
      redacted: true,
      reason: 'Role-scoped field masking (E06)',
    });
  });

  it('enforces strict non-self-approval on email policy governance (E10)', async () => {
    const { service, prisma } = createService();
    prisma.emailPolicyVersion.findFirst.mockResolvedValue({
      id: 'pol-1',
      tenant_id: tenantId,
      policy_key: 'default-email',
      version: 1,
      status: 'DRAFT',
      authored_by: adminActor.userId,
    });

    await expect(
      service.approvePolicy(tenantId, adminActor, 'pol-1', {}),
    ).rejects.toThrow(ForbiddenException);

    prisma.emailPolicyVersion.update.mockResolvedValue({
      id: 'pol-1',
      status: 'APPROVED',
      approved_by: reviewerActor.userId,
    });
    const approved = await service.approvePolicy(
      tenantId,
      reviewerActor,
      'pol-1',
      { comments: 'LGTM' },
    );
    expect(approved.status).toBe('APPROVED');
  });

  it('delegates case creation cleanly via CaseService on threat promotion (WF-07)', async () => {
    const { service, prisma, caseService } = createService();
    prisma.emailThreatFinding.findFirst.mockResolvedValue({
      id: 'finding-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      source_event_ref: 'evt-99',
      provider_verdict: 'PHISHING',
      threat_class: 'PHISHING',
      severity: 'CRITICAL',
      case_id: null,
      connection: { environment_id: 'prod', residency_code: 'eu-west-1' },
    });
    prisma.emailThreatFinding.update.mockResolvedValue({
      id: 'finding-1',
      case_id: 'case-101',
      status: 'CASE_OPENED',
    });

    const result = await service.promoteThreatToCase(
      tenantId,
      adminActor,
      'finding-1',
      {},
    );
    expect(caseService.createStandalone).toHaveBeenCalledTimes(1);
    expect(result.caseId).toBe('case-101');
  });

  it('blocks Phase 2 self-approval (T26), requires simulation (E13), and stays fail-closed (T18)', async () => {
    const { service, prisma } = createService();
    prisma.emailActionProposal.findFirst.mockResolvedValue({
      id: 'prop-1',
      tenant_id: tenantId,
      initiated_by: adminActor.userId,
      simulation_result: null,
      status: 'PROPOSED',
    });

    await expect(
      service.approveAction(tenantId, adminActor, 'prop-1', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.approveAction(tenantId, reviewerActor, 'prop-1', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.executeAction(tenantId, reviewerActor, 'prop-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('enforces bounded, manifest-scoped auditor grants (T09)', async () => {
    const { service, prisma } = createService();
    await expect(
      service.grantAuditorAccess(tenantId, adminActor, {
        auditorPrincipalId: 'auditor-1',
        expiresInHours: 500,
        manifestIds: ['man-1'],
      }),
    ).rejects.toThrow(BadRequestException);

    prisma.emailEvidenceManifest.updateMany.mockResolvedValue({ count: 1 });
    const granted = await service.grantAuditorAccess(tenantId, adminActor, {
      auditorPrincipalId: 'auditor-1',
      expiresInHours: 24,
      manifestIds: ['man-1'],
    });
    expect(granted.scopedRole).toBe('SECURITY_AUDITOR');
    expect(granted.manifestIds).toEqual(['man-1']);
    expect(prisma.emailEvidenceManifest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: tenantId, id: { in: ['man-1'] } },
      }),
    );
  });

  it('covers onboarding verify, sync, backfill validation, evidence, policy lifecycle, AI behaviour, actions, and privacy inventory', async () => {
    const {
      service,
      prisma,
      ingestClient,
      aiClient,
      actionClient,
      anchorClient,
      vault,
    } = createService();

    prisma.emailConnectionIntent.create.mockResolvedValue({
      id: 'int-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      requested_mode: 'READ_ONLY_TELEMETRY',
      oauth_state: 'state-123',
      requested_scopes: ['SecurityAlert.Read.All'],
      residency_code: 'eu-west-1',
      status: 'CONSENT_PENDING',
      expires_at: new Date(Date.now() + 60000),
    });
    const intent = await service.createConnectionIntent(tenantId, adminActor, {
      provider: 'MICROSOFT_365',
      displayName: 'M365 Defender',
      requestedScopes: ['SecurityAlert.Read.All'],
    });
    expect(intent.intentId).toBe('int-1');
    expect(intent.authorizationUrl).toContain('https://login.example/');
    expect(intent).not.toHaveProperty('oauthState');

    prisma.emailConnectionIntent.findFirst.mockResolvedValue({
      id: 'int-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      requested_mode: 'READ_ONLY_TELEMETRY',
      oauth_state: 'state-123',
      pkce_verifier_ref: 'sec-pkce',
      status: 'CONSENT_PENDING',
      requested_scopes: ['SecurityAlert.Read.All'],
      residency_code: 'eu-west-1',
      expires_at: new Date(Date.now() + 60000),
      verification_report: { displayName: 'M365 Defender' },
    });
    prisma.emailSourceConnection.create.mockResolvedValue({
      id: 'conn-1',
      provider: 'MICROSOFT_365',
      status: 'VALIDATING',
    });
    prisma.emailSourceConnection.update.mockResolvedValue({
      id: 'conn-1',
      provider: 'MICROSOFT_365',
      status: 'VALIDATING',
      credential_ref: 'sec-1',
    });
    prisma.emailConnectionIntent.update.mockResolvedValue({
      id: 'int-1',
      status: 'VERIFIED',
    });
    const verified = await service.handleOAuthCallback(tenantId, adminActor, {
      state: 'state-123',
      code: 'auth-code',
    });
    expect(verified.status).toBe('VERIFIED');
    // Never ACTIVE from the OAuth handshake alone (WF-03).
    expect(verified.connection?.status).toBe('VALIDATING');
    expect(verified.connection).not.toHaveProperty('credential_ref');
    expect(vault.reveal).toHaveBeenCalledWith(
      tenantId,
      'sec-pkce',
      'PKCE_VERIFIER',
    );

    prisma.emailSourceConnection.findFirst.mockResolvedValue({
      id: 'conn-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      status: 'ACTIVE',
      environment_id: 'prod',
      residency_code: 'eu-west-1',
      credential_ref: 'sec-1',
    });
    await service.getSourceCoverage(tenantId);
    await service.listConnectors(tenantId);
    await service.getSourceHealth(tenantId, 'conn-1');
    ingestClient.testEmailSource.mockResolvedValue({
      data: {
        status: 'HEALTHY',
        capabilityReport: {
          availableEventTypes: ['email.provider.alert.v1'],
          unavailableEventTypes: [],
          limitedCapability: false,
        },
      },
    });
    const tested = await service.testConnector(tenantId, adminActor, 'conn-1');
    expect(tested.passed).toBe(true);
    expect(ingestClient.testEmailSource).toHaveBeenCalledWith(
      tenantId,
      'conn-1',
      { accessToken: 'at-2' },
    );

    prisma.emailThreatFinding.upsert.mockResolvedValue({ id: 'f-1' });
    prisma.sourceCoverageWindow.create.mockResolvedValue({ id: 'w-1' });
    prisma.emailSourceConnection.update.mockResolvedValue({
      id: 'conn-1',
      status: 'REVOKED',
    });
    ingestClient.syncEmailSource.mockResolvedValueOnce({
      data: {
        status: 'RATE_LIMITED',
        normalizedRecords: [],
        expectedCount: null,
        gaps: [{ reason: 'PROVIDER_429_RATE_LIMITED' }],
      },
    });
    const rateLimited = await service.syncConnector(
      tenantId,
      adminActor,
      'conn-1',
    );
    expect(rateLimited.status).toBe('DEGRADED');
    // No provider total -> completeness cannot be asserted.
    expect(rateLimited.completenessGrade).toBe('UNKNOWN');

    ingestClient.syncEmailSource.mockResolvedValue({
      data: {
        status: 'SYNCED',
        expectedCount: 1,
        completenessGrade: 'COMPLETE',
        nextCursor: '2026-11-24T00:00:00Z',
        normalizedRecords: [
          {
            sourceEventRef: 'evt-1',
            severity: 'HIGH',
            providerVerdict: 'PHISHING',
            threatClass: 'PHISHING',
            subjectRef: 'hash-1',
          },
        ],
      },
    });
    prisma.sourceCoverageWindow.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'w-2',
        ...data,
      }),
    );
    const synced = await service.syncConnector(tenantId, adminActor, 'conn-1');
    expect(synced.completenessGrade).toBe('COMPLETE');
    expect(synced.ingestedCount).toBe(1);

    await expect(
      service.requestBackfill(tenantId, adminActor, 'conn-1', {
        windowStart: '2026-01-01T00:00:00Z',
        windowEnd: '2026-11-23T00:00:00Z',
        reason: 'Too wide',
      }),
    ).rejects.toThrow(BadRequestException);

    ingestClient.requestEmailBackfill.mockResolvedValue({
      data: { accepted: true },
    });
    await service.requestBackfill(tenantId, adminActor, 'conn-1', {
      windowStart: '2026-11-20T00:00:00Z',
      windowEnd: '2026-11-21T00:00:00Z',
      reason: 'Recover delayed events',
    });
    await service.listReconciliations(tenantId);

    prisma.emailThreatFinding.findFirst.mockResolvedValue({
      id: 'f-1',
      tenant_id: tenantId,
      provider: 'MICROSOFT_365',
      source_event_ref: 'evt-1',
      provider_verdict: 'PHISHING',
      threat_class: 'BEC',
      severity: 'HIGH',
      subject_ref: 'hash-1',
      version: 1,
    });
    prisma.emailThreatAdjudication.findFirst.mockResolvedValue(null);
    prisma.emailThreatAdjudication.create.mockResolvedValue({ id: 'adj-1' });
    prisma.emailThreatFinding.update.mockResolvedValue({
      id: 'f-1',
      status: 'CONFIRMED',
    });
    await service.recordAdjudication(tenantId, adminActor, 'f-1', {
      decision: 'CONFIRMED',
      rationale: 'Verified spoofing',
      idempotencyKey: 'k-1',
      expectedVersion: 1,
    });
    await service.getThreatDetail(tenantId, adminActor, 'f-1');
    aiClient.evaluateEmailFinding.mockResolvedValue({
      data: {
        detectorTier: 'DETERMINISTIC',
        abstained: false,
        confidenceScore: 0.9,
      },
    });
    prisma.emailDetectionDecision.create.mockResolvedValue({ id: 'dec-1' });
    await service.evaluateThreatWithAi(tenantId, adminActor, 'f-1', {
      lookalikeDomainDetected: true,
    });

    await service.getControlsCoverage(tenantId);
    anchorClient.anchorEmailManifest.mockResolvedValue({
      data: { merkleRoot: 'root-1', detachedChecksum: 'chk-1' },
    });
    prisma.emailEvidenceManifest.create.mockResolvedValue({ id: 'man-1' });
    await service.listEvidenceManifests(tenantId);
    await service.buildEvidenceExport(tenantId, adminActor, {
      timeStart: '2026-11-20T00:00:00Z',
      timeEnd: '2026-11-22T00:00:00Z',
    });
    prisma.emailEvidenceManifest.findFirst.mockResolvedValue({
      id: 'man-1',
      canonical_event_hashes: [],
      merkle_root: 'root-1',
      detached_checksum: 'chk-1',
    });
    anchorClient.verifyEmailManifest.mockResolvedValue({
      data: { verified: true, hasKnownGaps: false },
    });
    prisma.emailEvidenceManifest.update.mockResolvedValue({
      id: 'man-1',
      status: 'VERIFIED',
    });
    await service.verifyEvidenceManifest(tenantId, adminActor, 'man-1');

    prisma.emailPolicyVersion.findFirst.mockResolvedValue(null);
    prisma.emailPolicyVersion.create.mockResolvedValue({
      id: 'pol-1',
      policy_key: 'k',
      version: 1,
    });
    await service.listPolicies(tenantId);
    await service.draftPolicy(tenantId, adminActor, {
      policyKey: 'k',
      name: 'Policy',
      providerCoverage: ['MICROSOFT_365'],
      inputSources: ['alerts'],
      severityMapping: { bec: 'CRITICAL' },
      rationale: 'Baseline',
    });
    prisma.emailPolicyVersion.findFirst.mockResolvedValue({
      id: 'pol-1',
      policy_key: 'k',
      version: 1,
      status: 'APPROVED',
      authored_by: adminActor.userId,
      approved_by: reviewerActor.userId,
    });
    prisma.emailPolicyVersion.update.mockResolvedValue({
      id: 'pol-1',
      status: 'ACTIVE',
    });
    await service.activatePolicy(tenantId, reviewerActor, 'pol-1');
    await service.rollbackPolicy(tenantId, reviewerActor, 'pol-1');

    aiClient.benchmarkEmailDetections.mockResolvedValue({
      data: { totalEvaluated: 0 },
    });
    await service.getBehaviourOverview(tenantId);
    prisma.emailDetectionDecision.findFirst.mockResolvedValue({
      id: 'dec-1',
      version: 1,
    });
    prisma.emailDetectionDecision.update.mockResolvedValue({ id: 'dec-1' });
    await service.recordBehaviourLabel(tenantId, adminActor, {
      findingId: 'f-1',
      label: 'TRUE_POSITIVE',
    });
    await service.getAnalysisDetail(tenantId, 'dec-1');
    await service.decideAnalysis(tenantId, reviewerActor, 'dec-1', {
      decision: 'CONFIRMED',
      rationale: 'Confirmed',
      expectedVersion: 1,
    });

    prisma.emailActionProposal.create.mockResolvedValue({ id: 'prop-1' });
    await service.listActions(tenantId);
    await service.proposeAction(tenantId, adminActor, {
      provider: 'MICROSOFT_365',
      requestedAction: 'QUARANTINE_MESSAGE',
      targetRefs: ['msg-1'],
      consentScope: 'SecurityActions.ReadWrite.All',
    });
    prisma.emailActionProposal.findFirst.mockResolvedValue({
      id: 'prop-1',
      provider: 'MICROSOFT_365',
      requested_action: 'QUARANTINE_MESSAGE',
      target_refs: ['msg-1'],
      consent_scope: 'SecurityActions.ReadWrite.All',
      risk_class: 'R3',
      initiated_by: adminActor.userId,
    });
    actionClient.simulateEmailAction.mockResolvedValue({
      data: { simulated: true },
    });
    prisma.emailActionProposal.update.mockResolvedValue({ id: 'prop-1' });
    await service.simulateAction(tenantId, adminActor, 'prop-1');
    actionClient.rollbackEmailAction.mockResolvedValue({
      data: { status: 'COMPENSATING' },
    });
    await service.rollbackAction(tenantId, adminActor, 'prop-1', {
      reason: 'Undo',
    });

    await service.getSettingsAndGovernance(tenantId);
    await service.getPrivacyInventory(tenantId);
    await service.revokeAccess(tenantId, adminActor, {
      connectionId: 'conn-1',
      reason: 'Cleanup',
    });
  });
});
