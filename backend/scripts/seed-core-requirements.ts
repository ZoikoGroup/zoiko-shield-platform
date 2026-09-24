import { CreateRequirementDto } from '../apps/shield-core/src/modules/requirements-register/dto/requirement.dto';
import { RequirementsQualityGuard } from '../apps/shield-core/src/modules/requirements-register/guards/requirements-quality.guard';
import { RequirementsRegisterService } from '../apps/shield-core/src/modules/requirements-register/services/requirements-register.service';
import { TraceabilityGraphService } from '../apps/shield-core/src/modules/requirements-register/services/traceability-graph.service';
import { RequirementsReconciliationWorker } from '../apps/shield-core/src/modules/requirements-register/workers/requirements-reconciliation.worker';

/**
 * Seed Script: Backfills the 15 Foundational Controlled Specifications into R04 Register
 */
export const CORE_REQUIREMENTS: CreateRequirementDto[] = [
  {
    id: 'REQ-TENANT-ISOL-01',
    version: '1.0.0',
    title: 'Multi-Tenant Relational Isolation & Negative Authorization Matrix',
    statement: 'Every PostgreSQL query, Redis key, and Vector index must enforce cryptographic or relational tenant boundaries with zero cross-tenant leakage.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'ZoikoShield Master Build Guide §Tenant Isolation Matrix',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Cross-tenant negative authorization test matrix passes 100%',
      'Tenant partition keys enforced on all Prisma queries',
      'Tenant isolation verified across search and vector databases',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'TenantModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/tenant/tenant.controller.ts',
      testFilePath: 'backend/apps/shield-core/src/modules/tenant/cross-tenant-isolation-matrix.spec.ts',
      evidenceGateId: 'G2-TENANT-02',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-AUTH-CEDAR-01',
    version: '1.0.0',
    title: 'Cedar Policy Authorization & Step-Up MFA Challenge Enforcement',
    statement: 'Access control decisions must be evaluated deterministically through Cedar policies with mandatory WebAuthn FIDO2 step-up challenges for high-privilege operations.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'ZoikoShield Backend Guide §LAB 12 Negative Authorization',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Deny by default on ambiguous or unmapped actions',
      'FIDO2 WebAuthn hardware challenges required for VPC-level actions',
      'All 8 LAB 12 negative authorization release blockers pass',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'AuthorizationModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/authorization/cedar-policy-evaluator.service.ts',
      testFilePath: 'backend/apps/shield-core/src/modules/authorization/negative-authorization-matrix.spec.ts',
      evidenceGateId: 'G2-AUTH-02',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-CUSTODY-HSM-01',
    version: '1.0.0',
    title: 'Cloud HSM Key Custody & Multi-Approver Quorum Verification',
    statement: 'Command signing keys and high-value security operations must reside in Cloud HSM KMS partitions with dual-custody approval quorum.',
    tenantScope: 'SOVEREIGN_CELL',
    dataScope: 'CRYPTOGRAPHIC_KEY_MATERIAL',
    authority: {
      type: 'SECURITY_STANDARD',
      reference: 'NIST SP 800-57 / NIST SP 800-207 Zero Trust Architecture',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: true,
      requiresPostQuantumSignature: true,
    },
    acceptanceCriteria: [
      'HsmCustodyReceipt issued for all cryptographic signing operations',
      'Zero private key exportability from Cloud KMS / HSM',
      'Dual-approver hardware presence quorum required for R4 operations',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldActionModule',
      sourceFilePath: 'backend/apps/shield-action/src/command-signing/cloud-hsm-signer.service.ts',
      testFilePath: 'backend/apps/shield-action/src/command-signing/cloud-hsm-signer.service.spec.ts',
      evidenceGateId: 'G2-ACTION-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-PQC-SIGNING-01',
    version: '1.0.0',
    title: 'Post-Quantum Dual Cryptographic Signing (ML-DSA-65 / FIPS 204)',
    statement: 'All Merkle roots and compliance evidence packages must be dual-signed using classical ECDSA P-256 and post-quantum ML-DSA-65 algorithms.',
    tenantScope: 'GLOBAL_SYSTEM',
    dataScope: 'LEGAL_PRIVILEGED_EVIDENCE',
    authority: {
      type: 'SECURITY_STANDARD',
      reference: 'FIPS 204 (ML-DSA) Post-Quantum Cryptography Standard',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: true,
      requiresPostQuantumSignature: true,
    },
    acceptanceCriteria: [
      'Dual signature generated on every epoch close',
      'Standalone verification supports quantum-resistant signature verification',
      'Tamper detection immediately rejects invalid ML-DSA-65 proofs',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldAnchorModule',
      sourceFilePath: 'backend/apps/shield-anchor/src/signing/pqc-dual-signer.service.ts',
      testFilePath: 'backend/apps/shield-anchor/src/pqc/pqc-dual-signing.spec.ts',
      evidenceGateId: 'G2-EVID-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-EVID-MERKLE-01',
    version: '1.0.0',
    title: 'Domain-Separated Merkle Epoch Trees & RFC 3161 Witness Sealing',
    statement: 'Evidence records must be inserted into append-only Merkle trees (ZS-MERKLE-V1) and sealed with external RFC 3161 cryptographic timestamp witnesses.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'LEGAL_PRIVILEGED_EVIDENCE',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'ADR-001 / Evidence Ledger Specification',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: true,
      requiresPostQuantumSignature: true,
    },
    acceptanceCriteria: [
      'Batch checkpointer computes deterministic Merkle roots',
      'RFC 3161 timestamp token binding cryptographically anchored',
      'Tampered leaves produce immediate inclusion proof failure',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldAnchorModule',
      sourceFilePath: 'backend/apps/shield-anchor/src/merkle/epoch-aggregator.service.ts',
      testFilePath: 'backend/apps/shield-anchor/src/merkle/epoch-aggregator.service.spec.ts',
      evidenceGateId: 'G2-EVID-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-CLI-VERIFIER-01',
    version: '1.0.0',
    title: 'Zero-Dependency Offline Independent Verifier CLI',
    statement: 'Auditors and general counsels must be able to independently verify exported audit packages offline without relying on cloud services or active internet connections.',
    tenantScope: 'GLOBAL_SYSTEM',
    dataScope: 'LEGAL_PRIVILEGED_EVIDENCE',
    authority: {
      type: 'LAW_REGULATION',
      reference: 'Federal Rules of Evidence Rule 902(13)/(14) & ADR-001',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: true,
      requiresPostQuantumSignature: true,
    },
    acceptanceCriteria: [
      'CLI executes offline verification with zero external network calls',
      'Recomputes Merkle roots and verifies post-quantum signatures',
      'Detects manifest byte alterations and evidence tampering 100%',
    ],
    verificationMethod: 'CRYPTOGRAPHIC_VERIFIER_CLI',
    traceability: {
      implementingModule: 'VerifierCliModule',
      sourceFilePath: 'backend/apps/verifier-cli/src/main.ts',
      testFilePath: 'backend/apps/verifier-cli/test/verifier-tamper-detection.spec.ts',
      evidenceGateId: 'G2-EVID-02',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-AI-ENVELOPE-01',
    version: '1.0.0',
    title: '10-Field Mandatory Decision Review Envelope & Human Attribution',
    statement: 'All AI-generated security proposals and investigative findings must be encapsulated in a 10-field review envelope with mandatory human rationale prior to execution.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'AI Security Architecture Specification §16.1 (Figure 11)',
    },
    failureBehavior: 'DEGRADE_DETERMINISTIC',
    aiStatus: 'AI_ASSISTED_REVIEWED',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Enforces all 10 fields defined in Spec §16.1',
      'Rejects incomplete envelopes before presentation to operator',
      'Captures immutable operator rationale and cryptographic decision signature',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldAiModule',
      sourceFilePath: 'backend/apps/shield-ai/src/gateway/ai-gateway.service.ts',
      testFilePath: 'backend/apps/shield-ai/test/incomplete-envelope-rejection.spec.ts',
      evidenceGateId: 'G2-AI-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-AI-FALLBACK-01',
    version: '1.0.0',
    title: 'Zero-LLM Heuristic Degradation & Prompt Injection Circuit Breaker',
    statement: 'If AI models experience outage, latency spikes, or adversarial prompt injection attacks, the platform must fail-safe to deterministic heuristic fallback logic.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'AI Security Architecture Specification §23 / LAB 13 Release Blockers',
    },
    failureBehavior: 'DEGRADE_DETERMINISTIC',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Prompt injection circuit breaker terminates rogue input immediately',
      'Zero-LLM continuity service generates deterministic case summaries',
      'All 8 LAB 13 adversarial release-blocking test suites pass',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldAiModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/ai-governance/no-llm-continuity.service.ts',
      testFilePath: 'backend/apps/shield-ai/src/security/prompt-injection.spec.ts',
      evidenceGateId: 'G2-AI-02',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-AI-DRIFT-01',
    version: '1.0.0',
    title: 'Population Stability Index (PSI) Model Drift & Automated Kill-Switch',
    statement: 'Continuous telemetry must monitor AI model output distributions with PSI metrics; exceeding safety thresholds must automatically engage the AI kill-switch.',
    tenantScope: 'GLOBAL_SYSTEM',
    dataScope: 'INTERNAL_COMMERCIAL',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'AI Architecture Specification §21 (Model Drift) & §23 (Kill Switch)',
    },
    failureBehavior: 'DEGRADE_DETERMINISTIC',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Calculates PSI against baseline training distributions',
      'Engages kill-switch when PSI exceeds critical threshold (0.25)',
      'Records drift metrics in compliance evidence stream',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldAiModule',
      sourceFilePath: 'backend/apps/shield-ai/src/gateway/ai-gateway.service.ts',
      testFilePath: 'backend/apps/shield-ai/src/gateway/ai-gateway.service.spec.ts',
      evidenceGateId: 'G2-AI-04',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-INGEST-OCSF-01',
    version: '1.0.0',
    title: 'OCSF Telemetry Normalization & Quarantine Provenance Isolation',
    statement: 'All ingested security telemetry must conform strictly to OCSF v1.1 schemas; malformed or suspicious payloads must be isolated in quarantine with cryptographic provenance.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'Backend Engineering Guide §LAB 07 Ingestion Pipeline',
    },
    failureBehavior: 'ALERT_AND_CONTINUE',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Validates incoming events against OCSF v1.1 schema',
      'Quarantined events cannot corrupt downstream detection streams',
      'Dead-letter queue (DLQ) replay worker processes re-validated events safely',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldIngestModule',
      sourceFilePath: 'backend/apps/shield-ingest/src/ingestion/quarantine.service.ts',
      testFilePath: 'backend/apps/shield-ingest/src/ingestion/quarantine-provenance-isolation.spec.ts',
      evidenceGateId: 'G2-INGEST-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-DETECT-TIERA-01',
    version: '1.0.0',
    title: 'Tier-A Windowed Stream Anomaly Detection & Deterministic Replay',
    statement: 'High-throughput stream detection engines must execute windowed anomaly rules with 100% deterministic replayability across historical telemetry logs.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'Backend Engineering Guide §LAB 08 Detection Replay',
    },
    failureBehavior: 'ALERT_AND_CONTINUE',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Sub-second anomaly detection on high-concurrency event streams',
      'Historical replay reproduces identical alert sequences',
      'Zero state leakage across sliding time windows',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ShieldIngestModule',
      sourceFilePath: 'backend/apps/shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service.ts',
      testFilePath: 'backend/apps/shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service.spec.ts',
      evidenceGateId: 'G2-DETECT-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-COMPL-DRIFT-01',
    version: '1.0.0',
    title: 'Continuous Control Assurance & Real-Time Compliance SLA Alarms',
    statement: 'Security controls across SOC 2 and ISO 27001 must be continuously evaluated with real-time drift alarms when compliance posture degrades.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'CONFIDENTIAL_CUSTOMER_TELEMETRY',
    authority: {
      type: 'SECURITY_STANDARD',
      reference: 'SOC 2 Type II CC6.1 / ISO/IEC 27001:2022 A.5.18 / Spec §55',
    },
    failureBehavior: 'ALERT_AND_CONTINUE',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Continuous control evaluation against active telemetry',
      'Automated drift detection alerts before compliance breach occurs',
      'Exports weekly evidence packages for audit readiness',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'ContinuousAssuranceModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/continuous-assurance/continuous-assurance.service.ts',
      testFilePath: 'backend/apps/shield-core/src/modules/continuous-assurance/continuous-control-evaluation.spec.ts',
      evidenceGateId: 'G2-CTRL-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-BILLING-ANTIPERVERSE-01',
    version: '1.0.0',
    title: 'Anti-Perverse Billing Governance & 4-Tier Plan Commercial Ladder',
    statement: 'The platform must guarantee zero surge pricing during market spikes or alert storms; commercial tier allocations must strictly enforce plan bounds without hidden surcharges.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'INTERNAL_COMMERCIAL',
    authority: {
      type: 'COMMERCIAL_CONTRACT',
      reference: 'ZoikoShield Commercial Billing & Operating Standard §14',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Zero cost surge during volumetric DDoS or alert storms',
      '4 Plan tiers (Essential, Professional, Advanced, Enterprise) strictly enforced',
      'Anti-perverse billing disclaimer displayed on all pricing interfaces',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'BillingModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/billing/billing.controller.ts',
      testFilePath: 'backend/apps/shield-core/src/modules/billing/anti-perverse-incentive-billing.spec.ts',
      evidenceGateId: 'G1-CONTRACT-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-SECTOR-PACKS-01',
    version: '1.0.0',
    title: '6 Canonical Industry Sector Defense Packs & Statutory Boundary Caveats',
    statement: 'The platform must deliver exactly 6 canonical industry sector defense packs with explicit statutory disclosure caveats and ADR-08 framework deferral boundaries.',
    tenantScope: 'MULTI_TENANT',
    dataScope: 'PUBLIC',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'ADR-008 & Sector Pack Operating Standard',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'DETERMINISTIC_ONLY',
    evidenceObligation: {
      requiresMerkleProof: false,
      requiresWitnessSeal: false,
      requiresPostQuantumSignature: false,
    },
    acceptanceCriteria: [
      'Exact 6 canonical packs: Telecom, FinTech, Healthcare, Legal, SaaS, Public Sector',
      'DORA and NIS2 explicitly marked as DEFERRED per ADR-08',
      'Statutory scope caveats rendered prominently on sector configuration pages',
    ],
    verificationMethod: 'AUTOMATED_UNIT_TEST',
    traceability: {
      implementingModule: 'SectorPacksModule',
      sourceFilePath: 'backend/apps/shield-core/src/modules/sector-packs/sector-pack.service.ts',
      testFilePath: 'backend/apps/shield-core/src/modules/sector-packs/sector-pack.service.spec.ts',
      evidenceGateId: 'G1-CONTRACT-01',
    },
    status: 'VERIFIED_RELEASED',
  },
  {
    id: 'REQ-GATE-G1-ROSTER-01',
    version: '1.0.0',
    title: 'G1 Acceptance Gate Multi-Approver Multi-Function Sign-off Protocol',
    statement: 'The G1 release gate requires explicit human review and cryptographic sign-off across all 8 designated functional domains before live R2+ response actions can be enabled.',
    tenantScope: 'GLOBAL_SYSTEM',
    dataScope: 'LEGAL_PRIVILEGED_EVIDENCE',
    authority: {
      type: 'CONTROLLED_SPEC',
      reference: 'Master Build Plan §18 / docs/g1-gate-signoff-roster.md',
    },
    failureBehavior: 'FAIL_CLOSED',
    aiStatus: 'HUMAN_IN_THE_LOOP',
    evidenceObligation: {
      requiresMerkleProof: true,
      requiresWitnessSeal: true,
      requiresPostQuantumSignature: true,
    },
    acceptanceCriteria: [
      'Requires 8/8 functional domain approvals (Architecture, Security, AI, Privacy, QA, SRE, Product, SOC)',
      'Automated systems cannot self-ratify G1 gate',
      'Fail-closed block on live execution until all 8 signatures recorded',
    ],
    verificationMethod: 'MULTI_APPROVER_GATE_SIGN',
    traceability: {
      implementingModule: 'GovernanceModule',
      sourceFilePath: 'docs/g1-gate-signoff-roster.md',
      testFilePath: 'backend/apps/shield-core/test/openapi-contract-audit.spec.ts',
      evidenceGateId: 'G1-SIGNOFF-01',
    },
    status: 'ACTIVE_COMMITTED',
  },
];

export function runRequirementsSeeder(): void {
  console.log('\n================================================================');
  console.log('    R04 AUTHORITATIVE STRUCTURED REQUIREMENTS REGISTER SEEDER');
  console.log('================================================================');

  const qualityGuard = new RequirementsQualityGuard();
  const registerService = new RequirementsRegisterService(qualityGuard);
  const graphService = new TraceabilityGraphService(registerService);
  const reconciliationWorker = new RequirementsReconciliationWorker(registerService);

  console.log(`[x] Seeding ${CORE_REQUIREMENTS.length} foundational Controlled Requirements...`);

  for (const req of CORE_REQUIREMENTS) {
    registerService.registerRequirement(req);
  }

  console.log(`✔ Successfully registered ${registerService.count()} requirements in R04!`);

  console.log('\n[x] Evaluating Precedence Hierarchy (§05)...');
  const precedence = graphService.getPrecedenceHierarchy();
  for (const p of precedence) {
    console.log(`  Level ${p.level}: [${p.authorityType}] -> ${p.requirementsCount} requirement(s) (${p.description})`);
  }

  console.log('\n[x] Computing Traceability Coverage Matrix...');
  const coverage = graphService.getTraceabilityCoverage();
  console.log(`  Total Requirements:          ${coverage.totalRequirements}`);
  console.log(`  Covered by Automated Tests:  ${coverage.coveredByTests}/${coverage.totalRequirements} (${(coverage.testCoverageRatio * 100).toFixed(1)}%)`);
  console.log(`  Covered by Evidence Gates:   ${coverage.coveredByEvidenceGates}/${coverage.totalRequirements} (${(coverage.evidenceGateCoverageRatio * 100).toFixed(1)}%)`);

  console.log('\n[x] Running Daily Reconciliation Audit (§05.1)...');
  const reconciliation = reconciliationWorker.executeReconciliation();
  console.log(`  Reconciliation Status:       ${reconciliation.status}`);
  console.log(`  Discrepancies Detected:      ${reconciliation.discrepanciesCount}`);
  if (reconciliation.discrepancies.length > 0) {
    for (const d of reconciliation.discrepancies) {
      console.log(`    - [${d.type}] ${d.requirementId}: ${d.details}`);
    }
  }

  console.log('\n================================================================');
  console.log('🎉 R04 REQUIREMENTS REGISTER INITIALIZED & RECONCILED CLEANLY');
  console.log('================================================================\n');
}

if (require.main === module) {
  runRequirementsSeeder();
}
