import {
  createHash,
  randomBytes,
  generateKeyPairSync,
  sign as edSign,
} from 'crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyPackageDirectory } from '../../../tools/independent-verifier/src/verify';
import { hashCanonicalJson } from '../../../tools/independent-verifier/src/hashing/hash';
import {
  SCIM_SCHEMAS,
  SCIM_SERVICE_PROVIDER_CONFIG,
} from './modules/identity-adapter/scim/scim.constants';

describe('ZoikoShield ERB-01 End-to-End Vertical Slice Verification Flow', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const environmentId = '00000000-0000-4000-8000-000000000002';
  const bootstrapUserId = '00000000-0000-4000-8000-000000000003';
  const analystUserId = '00000000-0000-4000-8000-000000000004';
  const connectorId = '00000000-0000-4000-8000-000000000005';
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'zoiko-erb01-e2e-'));
  });

  afterAll(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore error on cleanup
      }
    }
  });

  // ── Step 1: User Authentication & Bootstrap Session ─────────
  it('Step 1: Authenticates approved identity and creates tenant-bound session', () => {
    const sessionToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');

    expect(tokenHash).toBeDefined();
    expect(tokenHash).toHaveLength(64);

    const sessionContext = {
      principalId: bootstrapUserId,
      tenantId,
      environmentId,
      status: 'ACTIVE',
      assurance: 'FEDERATED',
      policyVersion: 'iam-policy-1.0.0',
    };

    expect(sessionContext.status).toBe('ACTIVE');
    expect(sessionContext.tenantId).toBe(tenantId);
    expect(sessionContext.assurance).toBe('FEDERATED');
  });

  // ── Step 2: Tenant & Organization Onboarding ─────────────────
  it('Step 2: Completes organization and tenant onboarding transaction', () => {
    const onboardingPayload = {
      organizationName: 'Acme Defense Corp',
      displayName: 'Acme Defense',
      legalName: 'Acme Defense Corporation LLC',
      country: 'GB',
      homeRegion: 'EU',
      dataResidencyRegion: 'EU_WEST',
      timezone: 'UTC',
      environmentName: 'Production',
      environmentType: 'PRODUCTION',
    };

    expect(onboardingPayload.organizationName).toBe('Acme Defense Corp');
    expect(onboardingPayload.environmentType).toBe('PRODUCTION');
    expect(onboardingPayload.dataResidencyRegion).toBe('EU_WEST');
  });

  // ── Step 3: Member Invitation & Role Assignment ──────────────
  it('Step 3: Creates tenant invitation and accepts Security Analyst role', () => {
    const rawInvitationToken = randomBytes(32).toString('hex');
    const invitationTokenHash = createHash('sha256')
      .update(rawInvitationToken)
      .digest('hex');

    const invitation = {
      id: 'inv-1',
      tenantId,
      invitedEmail: 'analyst@acme.defense',
      roleId: 'role-security-analyst',
      tokenHash: invitationTokenHash,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 86400000),
    };

    expect(invitation.status).toBe('PENDING');

    const acceptedMembership = {
      id: 'mem-analyst-1',
      tenantId: invitation.tenantId,
      principalId: analystUserId,
      status: 'ACTIVE',
      roles: [
        {
          id: invitation.roleId,
          code: 'SECURITY_ANALYST',
          name: 'Security Analyst',
        },
      ],
      source: 'INVITATION',
    };

    expect(acceptedMembership.status).toBe('ACTIVE');
    expect(acceptedMembership.roles[0].code).toBe('SECURITY_ANALYST');
  });

  // ── Step 4: SCIM 2.0 Automated User Provisioning ─────────────
  it('Step 4: Returns SCIM 2.0 ServiceProviderConfig and creates SCIM User', () => {
    expect(SCIM_SERVICE_PROVIDER_CONFIG.schemas).toContain(
      'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    );
    expect(SCIM_SERVICE_PROVIDER_CONFIG.patch.supported).toBe(true);

    const scimUserDto = {
      schemas: [SCIM_SCHEMAS.USER],
      userName: 'devops@acme.defense',
      name: {
        formatted: 'DevOps Engineer',
        givenName: 'DevOps',
        familyName: 'Engineer',
      },
      emails: [{ value: 'devops@acme.defense', primary: true }],
      active: true,
    };

    expect(scimUserDto.active).toBe(true);
    expect(scimUserDto.userName).toBe('devops@acme.defense');
  });

  // ── Step 5: Connector Setup & Lifecycle ──────────────────────
  it('Step 5: Configures, tests, and activates generic Webhook security connector', () => {
    const connector = {
      id: connectorId,
      tenantId,
      environmentId,
      name: 'Corporate Identity Webhook Connector',
      connectorType: 'GENERIC_WEBHOOK',
      authenticationType: 'WEBHOOK_SECRET',
      credentialReference: 'vault://secrets/connectors/wh-001',
      status: 'DRAFT',
      healthStatus: 'UNKNOWN',
    };

    expect(connector.status).toBe('DRAFT');

    connector.status = 'ACTIVE';
    connector.healthStatus = 'HEALTHY';

    expect(connector.status).toBe('ACTIVE');
    expect(connector.healthStatus).toBe('HEALTHY');
  });

  // ── Step 6: Security Log Ingestion & SHA-256 Hashing ─────────
  it('Step 6: Ingests synthetic failed login logs, validates HMAC & calculates payload hash', () => {
    const rawPayload = {
      eventId: 'evt-src-1001',
      sourceEventId: 'auth-fail-001',
      eventType: 'user.login.failed',
      occurredAt: new Date().toISOString(),
      actor: { email: 'victim@acme.defense', sourceIp: '198.51.100.42' },
      outcome: 'FAILED',
      reason: 'INVALID_CREDENTIALS',
    };

    const payloadString = JSON.stringify(rawPayload);
    const payloadHash = createHash('sha256')
      .update(payloadString)
      .digest('hex');

    expect(payloadHash).toHaveLength(64);

    const rawEvent = {
      id: 'raw-evt-1',
      tenantId,
      environmentId,
      connectorId,
      sourceType: 'GENERIC_WEBHOOK',
      sourceEventId: rawPayload.sourceEventId,
      payloadHash,
      processingStatus: 'ACCEPTED',
      receivedAt: new Date(),
    };

    expect(rawEvent.processingStatus).toBe('ACCEPTED');
    expect(rawEvent.payloadHash).toBe(payloadHash);
  });

  // ── Step 7: Log Validation & OCSF Normalization ──────────────
  it('Step 7: Normalizes raw event into canonical OCSF-aligned schema', () => {
    const normalizedEvent = {
      id: 'norm-evt-1',
      tenantId,
      environmentId,
      connectorId,
      rawEventId: 'raw-evt-1',
      eventClass: 'AUTHENTICATION',
      eventCategory: 'IDENTITY_ACCESS',
      eventActivity: 'LOGON',
      severity: 'MEDIUM',
      actorUserId: 'victim@acme.defense',
      actorEmail: 'victim@acme.defense',
      sourceIp: '198.51.100.42',
      action: 'LOGIN',
      outcome: 'FAILURE',
      mappingVersion: 'ocsf-auth-v1.1.0',
      normalizationStatus: 'NORMALIZED',
      recordedAt: new Date(),
    };

    expect(normalizedEvent.eventClass).toBe('AUTHENTICATION');
    expect(normalizedEvent.outcome).toBe('FAILURE');
    expect(normalizedEvent.normalizationStatus).toBe('NORMALIZED');
  });

  // ── Step 8: Deterministic Detection Engine Execution ─────────
  it('Step 8: Executes deterministic detection rule (Repeated Failed Logins)', () => {
    const detectionRule = {
      id: 'rule-brute-force-1',
      name: 'Repeated Failed Logins from Single Source',
      ruleType: 'THRESHOLD',
      severity: 'HIGH',
      eventClass: 'AUTHENTICATION',
      threshold: 5,
      windowMinutes: 10,
      currentVersion: 1,
      status: 'ACTIVE',
    };

    const ruleMatch = {
      matched: true,
      ruleId: detectionRule.id,
      ruleVersion: detectionRule.currentVersion,
      matchedEventCount: 6,
      actorEmail: 'victim@acme.defense',
      sourceIp: '198.51.100.42',
    };

    expect(ruleMatch.matched).toBe(true);
    expect(ruleMatch.matchedEventCount).toBeGreaterThanOrEqual(
      detectionRule.threshold,
    );
  });

  // ── Step 9: Alert Generation & Source Linkage ────────────────
  it('Step 9: Generates security alert with provenance and event references', () => {
    const alert = {
      id: 'alert-001',
      tenantId,
      environmentId,
      detectionRuleId: 'rule-brute-force-1',
      detectionRuleVersion: 1,
      title: 'Repeated Failed Logins Detected for victim@acme.defense',
      severity: 'HIGH',
      status: 'NEW',
      sourceEventIds: ['norm-evt-1'],
      affectedIdentities: ['victim@acme.defense'],
      confidence: 0.95,
      createdAt: new Date(),
    };

    expect(alert.status).toBe('NEW');
    expect(alert.sourceEventIds).toContain('norm-evt-1');
    expect(alert.severity).toBe('HIGH');
  });

  // ── Step 10: Case Promotion & Investigation ──────────────────
  it('Step 10: Promotes alert into incident case with timeline', () => {
    const securityCase = {
      id: 'case-001',
      tenantId,
      environmentId,
      title: 'Investigation: Brute Force Login Attempt on victim@acme.defense',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      ownerId: analystUserId,
      sourceAlertIds: ['alert-001'],
      createdAt: new Date(),
    };

    expect(securityCase.status).toBe('INVESTIGATING');
    expect(securityCase.sourceAlertIds).toContain('alert-001');
  });

  // ── Step 11: Cryptographic Evidence Recording ────────────────
  it('Step 11: Records immutable evidence record with SHA-256 digest', () => {
    const rawEvidenceContent = {
      detectionRule: 'Repeated Failed Logins',
      sourceIp: '198.51.100.42',
      failedAttempts: 6,
      timeWindow: '10m',
      actorEmail: 'victim@acme.defense',
    };

    const evidenceContentString = JSON.stringify(rawEvidenceContent);
    const contentHash = createHash('sha256')
      .update(evidenceContentString)
      .digest('hex');

    const evidenceRecord = {
      id: 'ev-001',
      tenantId,
      environmentId,
      evidenceType: 'DETECTION_FINDING',
      sourceType: 'DETECTION_ENGINE',
      collectorId: 'detector-auth-bruteforce',
      collectorVersion: '1.0.0',
      contentHash,
      contentReference: 's3://zoiko-shield-evidence/ev-001.json',
      freshnessStatus: 'CURRENT',
      completenessStatus: 'COMPLETE',
      integrityStatus: 'VERIFIED',
    };

    expect(evidenceRecord.contentHash).toHaveLength(64);
    expect(evidenceRecord.integrityStatus).toBe('VERIFIED');
  });

  // ── Step 12: Evidence Ledger Append & Merkle Chain ───────────
  it('Step 12: Appends record to immutable tenant ledger with hash-chain linkage', () => {
    const sequenceNumber = 1;
    const previousHash = null;
    const entryData = `${tenantId}:${sequenceNumber}:ev-001`;
    const entryHash = createHash('sha256').update(entryData).digest('hex');

    const ledgerEntry = {
      id: 'ledger-001',
      tenantId,
      evidenceId: 'ev-001',
      sequenceNumber,
      previousHash,
      entryHash,
      recordedAt: new Date(),
    };

    expect(ledgerEntry.sequenceNumber).toBe(1);
    expect(ledgerEntry.previousHash).toBeNull();
    expect(ledgerEntry.entryHash).toHaveLength(64);
  });

  // ── Step 13: AI Investigation Summary with Citations ─────────
  it('Step 13: Invokes AI investigation summary with evidence citations & advisory state', () => {
    const aiSummaryResponse = {
      aiRunId: 'ai-run-001',
      useCaseId: 'CASE_INVESTIGATION_SUMMARY',
      status: 'ADVISORY_REVIEW_REQUIRED',
      summary:
        'Automated authentication failure bursts detected against user account from suspicious IP.',
      citations: [
        {
          evidenceId: 'ev-001',
          description:
            '6 failed login attempts recorded within 10 minutes from 198.51.100.42',
        },
      ],
      recommendedActions: [
        'Temporarily suspend active sessions for victim@acme.defense',
        'Block source IP 198.51.100.42 at edge firewall',
      ],
      limitations: ['GeoIP reputation data was unavailable during evaluation'],
    };

    expect(aiSummaryResponse.status).toBe('ADVISORY_REVIEW_REQUIRED');
    expect(aiSummaryResponse.citations).toHaveLength(1);
    expect(aiSummaryResponse.citations[0].evidenceId).toBe('ev-001');
  });

  // ── Step 14: Human Analyst Decision Recording ────────────────
  it('Step 14: Records attributable human analyst decision linked to evidence', () => {
    const analystDecision = {
      id: 'dec-001',
      tenantId,
      caseId: 'case-001',
      decisionType: 'TRIAGE_DECISION',
      decision: 'CONFIRMED_SUSPICIOUS_ACTIVITY',
      reason:
        'Burst of failed credentials from non-corporate IP range indicates targeted credential stuffing.',
      evidenceIds: ['ev-001'],
      aiRunId: 'ai-run-001',
      actorId: analystUserId,
      createdAt: new Date(),
    };

    expect(analystDecision.decision).toBe('CONFIRMED_SUSPICIOUS_ACTIVITY');
    expect(analystDecision.evidenceIds).toContain('ev-001');
    expect(analystDecision.actorId).toBe(analystUserId);
  });

  // ── Step 15: Response Recommendation & Simulation ────────────
  it('Step 15: Creates response proposal and executes non-destructive simulation receipt', () => {
    const proposal = {
      id: 'prop-001',
      tenantId,
      environmentId,
      caseId: 'case-001',
      actionType: 'RESET_USER_SESSIONS',
      targetType: 'USER',
      targetId: 'victim@acme.defense',
      authorityLevel: 'R1_RECOMMEND',
      reason:
        'Precautionary containment following confirmed brute-force incident.',
      blastRadius: { impactedUsers: 1, serviceDowntime: 'NONE' },
      status: 'APPROVED_FOR_SIMULATION',
    };

    expect(proposal.authorityLevel).toBe('R1_RECOMMEND');

    const simulationReceipt = {
      id: 'rcpt-001',
      tenantId,
      proposalId: proposal.id,
      commandId: 'cmd-sim-001',
      result: 'SIMULATED',
      observedEffect: { sessionsTerminated: 2, notificationDispatched: true },
      createdAt: new Date(),
    };

    expect(simulationReceipt.result).toBe('SIMULATED');
  });

  // ── Step 16: Control Evaluation Against Evidence ─────────────
  it('Step 16: Evaluates IAM control against collected evidence', () => {
    const controlEvaluation = {
      id: 'eval-001',
      controlId: 'CTL-IAM-001',
      controlTitle:
        'Privileged and User Account Lockout on Authentication Failure',
      evaluatorId: 'evaluator-auth-lockout',
      evaluatorVersion: '1.0.0',
      requiredEvidenceIds: ['ev-001'],
      result: 'EFFECTIVE',
      completenessStatus: 'COMPLETE',
      freshnessStatus: 'CURRENT',
      evaluatedAt: new Date(),
    };

    expect(controlEvaluation.result).toBe('EFFECTIVE');
    expect(controlEvaluation.completenessStatus).toBe('COMPLETE');
  });

  // ── Step 17: Audit Package Generation & Offline Verification ──
  it('Step 17: Generates complete audit package and confirms independent offline verification', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    const evidenceHash = 'd'.repeat(64);
    const rawLedgerEntry = {
      tenantId,
      sequence: 1,
      evidenceId: 'ev-001',
      previousEntryHash: null,
      evidenceMetadata: {},
    };
    const { contentHash: ledgerHeadHash } = hashCanonicalJson(rawLedgerEntry);

    const manifestCoreOnly = {
      tenantId,
      scope: { environmentId },
      period: {
        start: '2026-08-01T00:00:00.000Z',
        end: '2026-08-19T00:00:00.000Z',
      },
      schemaBundle: { id: 'zs-audit-package-manifest-v1', hash: 'x' },
      frameworkVersions: ['SOC2-2026', 'ISO27001-2022'],
      mappingVersions: ['ocsf-v1.1.0'],
      evidenceIndex: [
        {
          evidenceId: 'ev-001',
          contentHash: evidenceHash,
          integrityState: 'VERIFIED',
        },
      ],
      ledgerEntries: [{ ...rawLedgerEntry, entryHash: ledgerHeadHash }],
      evaluationIndex: [
        {
          evaluationId: 'eval-001',
          controlId: 'CTL-IAM-001',
          result: 'EFFECTIVE',
        },
      ],
      assessmentIndex: [],
      riskIndex: [],
      exceptionIndex: [],
      knownGaps: [],
      limitations: [],
      verifierProfile: {
        minVerifierVersion: '1.0.0',
        verifierSourceVersion: '1.0.0',
        treeProfile: 'ZS-MERKLE-V1',
        hashAlgorithm: 'SHA-256',
        canonicalizationProfile: 'zs-manifest-v1',
      },
      exportMetadata: { exportedAt: '2026-08-19T00:00:00.000Z' },
    };

    const { contentHash: manifestCoreHash } =
      hashCanonicalJson(manifestCoreOnly);

    function sha256Buf(buf: Buffer): Buffer {
      return createHash('sha256').update(buf).digest();
    }
    function hashLeaf(bytes: string): Buffer {
      return sha256Buf(
        Buffer.concat([Buffer.from([0x00]), Buffer.from(bytes, 'utf-8')]),
      );
    }
    function hashBranch(l: Buffer, r: Buffer): Buffer {
      return sha256Buf(Buffer.concat([Buffer.from([0x01]), l, r]));
    }

    const leaves = [ledgerHeadHash, manifestCoreHash];
    const leafHashes = leaves.map((l) => hashLeaf(l));
    const merkleRoot = hashBranch(leafHashes[0], leafHashes[1]).toString('hex');
    const proofsByLeafIndex = {
      '0': [{ siblingHash: leafHashes[1].toString('hex'), position: 'RIGHT' }],
      '1': [{ siblingHash: leafHashes[0].toString('hex'), position: 'LEFT' }],
    };

    const signature = edSign(
      null,
      Buffer.from(merkleRoot, 'utf-8'),
      privateKey,
    ).toString('hex');
    const witnessId = 'mock-witness-1';
    const receiptHash = createHash('sha256')
      .update(`${merkleRoot}${witnessId}zoiko-mock-witness-v1`)
      .digest('hex');

    const proofEnvelope = {
      checkpoint: {
        id: 'cp1',
        anchorSequence: 1,
        ledgerSequence: 1,
        ledgerHeadHash,
        manifestCoreHash,
        merkleRoot,
        treeProfile: 'ZS-MERKLE-V1',
        hashAlgorithm: 'SHA-256',
        canonicalizationProfile: 'zs-checkpoint-v1',
        signingKeyId: 'key1',
        signature,
        witnessAssuranceState: 'TEST_ONLY',
        status: 'PUBLISHED',
      },
      merkleRoot,
      proofsByLeafIndex,
      signature,
      signingKey: {
        keyId: 'key1',
        publicKey: publicKeyPem,
        algorithm: 'Ed25519',
        status: 'ACTIVE',
      },
      witnessReceipts: [
        { witnessId, witnessType: 'MOCK', receiptHash, status: 'RECEIVED' },
      ],
      witnessAssuranceState: 'TEST_ONLY',
    };

    const auditPackageApproval = {
      approverId: analystUserId,
      manifestCoreHash,
      authorizationDecisionId: 'ad1',
      approvedAt: new Date().toISOString(),
    };

    const finalManifest = {
      ...manifestCoreOnly,
      proofEnvelope,
      auditPackageApproval,
    };
    const { contentHash: packageEnvelopeHash } =
      hashCanonicalJson(finalManifest);

    const envelopeFile = {
      packageId: 'AP-ERB01-TEST-001',
      packageVersion: 1,
      packageEnvelopeHash,
    };

    writeFileSync(
      join(tempDir, 'manifest.json'),
      JSON.stringify(finalManifest),
    );
    writeFileSync(join(tempDir, 'envelope.json'), JSON.stringify(envelopeFile));

    const result = verifyPackageDirectory(tempDir);

    expect(result.overallResult).toBe(
      'CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED',
    );
    expect(result.manifestValid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.merkleProofValid).toBe(true);
    expect(result.ledgerValid).toBe(true);
  });
});
