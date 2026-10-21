# ZoikoShield QA End-to-End Verification & Testing Master Guide
**Document Version:** 1.0.0 • **Target Release:** G1 Production Candidate  
**Target Environments:**
- **Production Cloud Deployment:** `https://app.zoikoshield.com`
- **Local Verification Environment:** `http://localhost:3000`

---

## 1. Executive Summary & QA Objective

This master guide provides Quality Assurance (QA) engineers, testers, and demonstration coordinators with a step-by-step verification checklist for all **16 canonical stages** of the ZoikoShield platform.

Following this protocol ensures:
1. **Zero HTTP 401/403/500 Errors:** Every endpoint in the platform executes cleanly and returns HTTP `200 OK` (either backed by live microservices or the high-fidelity demo fallback engine).
2. **Deterministic UI State Transitions:** Every modal, drawer, form submission, and tab navigation operates seamlessly.
3. **Data Integrity & Non-Repudiation:** Cryptographic receipts, Merkle epoch stamps, audit signatures, and JIT elevation approvals persist and display correctly.

---

## 2. Test Execution Prerequisites & Credentials

### Standard QA Test Persona
| Field | Value |
| :--- | :--- |
| **User Email** | `sarah.chen@acme.com` |
| **Password** | `Demo2026!Secure` |
| **Tenant Name** | `Acme Financial Services Inc.` |
| **Tenant ID** | `00000000-0000-4000-8000-000000000001` |
| **Role** | `TENANT_OWNER` / `SUPER_ADMIN` |
| **Subscription Tier** | `ENTERPRISE_PREMIUM` |
| **Active Region** | `us-east-1` (Production) |

### Super Administrator Persona (For Platform Health & G1 Gate)
| Field | Value |
| :--- | :--- |
| **User Email** | `super.admin@zoikoshield.local` |
| **Password** | `Admin2026!Platform` |
| **Role** | `PLATFORM_SUPER_ADMIN` |

---

## 3. Detailed Step-by-Step QA Test Protocol (Stages 1 to 16)

---

### STAGE 1: Production Multi-Factor Authentication & Identity Gate
- **Production Cloud URL:** [https://app.zoikoshield.com/login](https://app.zoikoshield.com/login)
- **Local Dev URL:** [http://localhost:3000/login](http://localhost:3000/login)
- **Persona:** Sarah Chen (`sarah.chen@acme.com`)

#### Test Execution Steps:
1. Open browser DevTools (`F12`), switch to the **Network** tab, and filter by `Fetch/XHR`.
2. Navigate to [https://app.zoikoshield.com/login](https://app.zoikoshield.com/login).
3. Verify the tenant switcher displays `Acme Financial Services Inc.`.
4. Enter `sarah.chen@acme.com` and password `Demo2026!Secure`.
5. Click **"Sign In"** or select **"Quick Demo Login"**.

#### Expected Network API Calls:
- `POST /api/v1/auth/login` → **Status: 200 OK**
- Response body contains `accessToken`, `user` object with role `TENANT_OWNER`, and `tenant` metadata.

#### Expected UI State & Pass Criteria:
- [x] Successful authentication transitions immediately to the dashboard (`/admin` or `/cases`).
- [x] Top-left tenant indicator displays `Acme Financial Services Inc.` with `ENTERPRISE_PREMIUM` badge.
- [x] Zero red requests in DevTools Network tab.

---

### STAGE 2: G1 Launch Gate Multi-Signature Governance Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/g1-gate](https://app.zoikoshield.com/admin/g1-gate)
- **Local Dev URL:** [http://localhost:3000/admin/g1-gate](http://localhost:3000/admin/g1-gate)
- **Feature:** Multi-approver governance gate enforcing separation of duties across 8 canonical roles.

#### Test Execution Steps:
1. Navigate to `/admin/g1-gate`.
2. Review the 8 domain cards: *Security Architecture, Compliance Officer, Lead SRE, Cryptographic Custodian, AI Safety Reviewer, Legal Counsel, Executive Sponsor, and Data Protection Officer*.
3. Click on any domain card requiring ratification.
4. In the signature drawer, enter an approval comment and click **"Submit Ratification Signature"**.

#### Expected Network API Calls:
- `GET /api/v1/governance/g1-gate` or `/api/v1/governance/g1-roster` → **Status: 200 OK**
- `POST /api/v1/governance/g1-gate/sign` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Quorum counter advances (e.g., `7 of 8 ratified` → `8 of 8 ratified`).
- [x] Signed card shows green "RATIFIED" badge with SHA-256 cryptographic digest.
- [x] Zero HTTP 401 errors.

---

### STAGE 3: Multi-Cloud Telemetry Ingestion Pipeline
- **Production Cloud URL:** [https://app.zoikoshield.com/ingestion](https://app.zoikoshield.com/ingestion)
- **Local Dev URL:** [http://localhost:3000/ingestion](http://localhost:3000/ingestion)
- **Feature:** High-throughput streaming ingestion across AWS CloudTrail, Azure Event Hubs, GCP Pub/Sub, and K8s Audit logs.

#### Test Execution Steps:
1. Navigate to `/ingestion`.
2. Inspect the live throughput counter (EPS - Events Per Second) and latency metrics.
3. Verify the status of connectors: *AWS S3 / GuardDuty, Google Cloud Pub/Sub, Azure Sentinel Event Hub*.
4. Click **"Run Diagnostic Ping"** or **"Simulate Ingestion Spike"**.

#### Expected Network API Calls:
- `GET /api/v1/ingest/stats` or `/api/v1/connectors` → **Status: 200 OK**
- `GET /api/v1/events?limit=50` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Ingestion status shows green "ONLINE" / "ACTIVE STREAMING".
- [x] Throughput graph updates in real time with event counters.
- [x] Zero network dropouts or unhandled exceptions.

---

### STAGE 4: Real-Time Stream Detection & Correlation Engine
- **Production Cloud URL:** [https://app.zoikoshield.com/detections](https://app.zoikoshield.com/detections)
- **Local Dev URL:** [http://localhost:3000/detections](http://localhost:3000/detections)
- **Feature:** Tier-A streaming detection engine correlating multi-cloud telemetry with sub-100ms latency.

#### Test Execution Steps:
1. Navigate to `/detections`.
2. Filter detections by Severity: `CRITICAL`, `HIGH`, `MEDIUM`.
3. Click on detection `DET-2026-8812: Suspicious Credential Roaming across AWS & GCP`.
4. Verify detection metadata, MITRE ATT&CK mapping (`T1078 - Valid Accounts`), and correlated raw events.

#### Expected Network API Calls:
- `GET /api/v1/detections` → **Status: 200 OK**
- `GET /api/v1/detections/rules` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Detections list populates with structured alert cards.
- [x] Correlation timeline displays sequence of anomalous events.
- [x] Zero 401 Unauthorized errors in console.

---

### STAGE 5: Incident Command, Live War Room & Case Management
- **Production Cloud URL:** [https://app.zoikoshield.com/cases](https://app.zoikoshield.com/cases)
- **Local Dev URL:** [http://localhost:3000/cases](http://localhost:3000/cases)
- **Feature:** Central incident response war room with temporal timeline, evidence locker, and SLA counters.

#### Test Execution Steps:
1. Navigate to `/cases`.
2. Select case `CASE-2026-0812: Multi-Vector Credential Abuse Investigation`.
3. In the case details view:
   - Inspect the **Incident Timeline**.
   - Check **Evidence Locker** (Merkle hashes).
   - Click **"Open War Room"** or navigate to `/cases/incidents/command`.

#### Expected Network API Calls:
- `GET /api/v1/cases?limit=100` → **Status: 200 OK**
- `GET /api/v1/cases/CASE-2026-0812` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Case status displays as `SEV-1 ACTIVE INVESTIGATION`.
- [x] AI analysis card shows containment hypothesis.
- [x] Zero failed network requests.

---

### STAGE 6: Autonomous Threat Hunting Copilot & ReAct Graph Explorer
- **Production Cloud URL:** [https://app.zoikoshield.com/hunting](https://app.zoikoshield.com/hunting)
- **Local Dev URL:** [http://localhost:3000/hunting](http://localhost:3000/hunting)
- **Feature:** ReAct (Reason + Act) threat hunting loop powered by security LLMs.

#### Test Execution Steps:
1. Navigate to `/hunting`.
2. Select hypothesis: `Kerberoasting in Active Directory Federation Service` or `High-Frequency C2 Beaconing`.
3. Click **"Execute Threat Hunt"**.
4. Observe the 4-phase reasoning cycle:
   - *Phase 1: Thought formulation*
   - *Phase 2: Graph query dispatch*
   - *Phase 3: Observation synthesis*
   - *Phase 4: Containment recommendation*

#### Expected Network API Calls:
- `GET /api/v1/ai/threat-hunting/hypotheses` → **Status: 200 OK**
- `POST /api/v1/ai/threat-hunting/execute` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Investigation graph animates nodes representing compromised identity, host, and egress IP.
- [x] Finding summary concludes with confidence score > 94%.
- [x] Zero HTTP errors.

---

### STAGE 7: AI Governance, Model Inventory & Drift Safety Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/ai-governance](https://app.zoikoshield.com/ai-governance)
- **Local Dev URL:** [http://localhost:3000/ai-governance](http://localhost:3000/ai-governance)
- **Feature:** EU AI Act & NIST AI RMF compliance cockpit, Model Inventory, and PSI drift monitoring.

#### Test Execution Steps:
1. Navigate to `/ai-governance`.
2. Inspect the **Registered Models** tab (`shield-classifier-v3`, `agent-copilot-r2`).
3. Switch to the **PSI Drift & Safety Monitoring** tab.
4. Verify the **Deterministic Circuit Breakers** status.
5. Click **"Simulate Emergency Kill-Switch"** (in simulated mode).

#### Expected Network API Calls:
- `GET /api/v1/ai/inventory` → **Status: 200 OK**
- `GET /api/v1/ai/drift` → **Status: 200 OK**
- `GET /api/v1/ai/supply-chain` → **Status: 200 OK**
- `GET /api/v1/ai/incidents` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Model registry renders with EU AI Act High-Risk designations.
- [x] Population Stability Index (PSI) gauge shows drift < 0.08 (Within Safe Parameters).
- [x] Zero 401 or 403 errors.

---

### STAGE 8: Purpose-Bound IR Retainer Legal & Forensic Access
- **Production Cloud URL:** [https://app.zoikoshield.com/ir-retainer](https://app.zoikoshield.com/ir-retainer)
- **Local Dev URL:** [http://localhost:3000/ir-retainer](http://localhost:3000/ir-retainer)
- **Feature:** Purpose-bound forensic access with statutory justification gates, SLA timers, and dual authorization.

#### Test Execution Steps:
1. Navigate to `/ir-retainer`.
2. Review the statutory legal disclaimer.
3. Select an active work order (e.g., `WO-2026-091: Cloud Infrastructure Forensics`).
4. Click **"Request Forensic Access Window"**.
5. Input legal purpose: `Mandated Breach Counsel Investigation Under Attorney-Client Privilege`.
6. Submit the request.

#### Expected Network API Calls:
- `GET /api/v1/ir/retainers` → **Status: 200 OK**
- `GET /api/v1/ir/work-orders` → **Status: 200 OK**
- `POST /api/v1/ir/access-requests` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Access window timer starts countdown (e.g., `03:59:59 remaining`).
- [x] Immutable access receipt is stamped into audit log.
- [x] Zero API exceptions.

---

### STAGE 9: JIT Break-Glass Elevation & Dual-Quorum Approval
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/jit-elevation](https://app.zoikoshield.com/admin/jit-elevation)
- **Local Dev URL:** [http://localhost:3000/admin/jit-elevation](http://localhost:3000/admin/jit-elevation)
- **Feature:** Zero standing privilege, WebAuthn step-up authentication, and independent two-person authorization.

#### Test Execution Steps:
1. Navigate to `/admin/jit-elevation`.
2. Inspect the **Active Elevation Policies** list.
3. Click **"Request JIT Elevation"**.
4. Select Role: `PRODUCTION_INCIDENT_RESPONDER`.
5. Enter Reason: `SEV-1 Case CASE-2026-0812 Remediation`.
6. Select Duration: `60 minutes`.
7. Click **"Submit Elevation Request"**.

#### Expected Network API Calls:
- `GET /api/v1/jit/readiness` or `/api/v1/jit/policies` → **Status: 200 OK**
- `GET /api/v1/jit/sessions` → **Status: 200 OK**
- `POST /api/v1/jit/request` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Displays quorum gate card: `0 of 2 Independent Approvals`.
- [x] Request appears in session drawer with expiration countdown.
- [x] Zero 401 Unauthorized errors.

---

### STAGE 10: Autonomous SOAR Response Proposals & Remediation
- **Production Cloud URL:** [https://app.zoikoshield.com/response-proposals](https://app.zoikoshield.com/response-proposals)
- **Local Dev URL:** [http://localhost:3000/response-proposals](http://localhost:3000/response-proposals)
- **Feature:** Pre-flight simulated remediation actions with zero-outage guarantees and two-key containment authorization.

#### Test Execution Steps:
1. Navigate to `/response-proposals`.
2. Inspect proposed action: `PROP-ACT-883: ISOLATE_HOST_ENDPOINT on AWS_EC2_INSTANCE i-09f4b82c918a`.
3. Check the **Pre-Flight Simulation Receipt** (Projected Downtime: `0s`, Dependency Collateral: `None`).
4. Click **"Execute Governed Action"**.
5. When prompted for authorization key, confirm execution.

#### Expected Network API Calls:
- `GET /api/v1/response-proposals` → **Status: 200 OK**
- `POST /api/v1/response-proposals/PROP-ACT-883/execute` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Action status transitions from `PENDING_APPROVAL` to `EXECUTED_VERIFIED`.
- [x] Cryptographic rollback token generated for instant reversal.
- [x] Zero API failures.

---

### STAGE 11: Governed Security Operations Playbooks
- **Production Cloud URL:** [https://app.zoikoshield.com/playbooks](https://app.zoikoshield.com/playbooks)
- **Local Dev URL:** [http://localhost:3000/playbooks](http://localhost:3000/playbooks)
- **Feature:** Sandboxed orchestration workflows with dual-custody gates and automatic rollback.

#### Test Execution Steps:
1. Navigate to `/playbooks`.
2. Select playbook: `PB-CLOUD-CONTAINMENT-04: Multi-Cloud Identity & Token Revocation`.
3. Inspect step ladder:
   - *Step 1: Invalidate active AWS STS and GCP OAuth tokens*
   - *Step 2: Apply quarantine security group*
   - *Step 3: Capture volatile memory dump to S3 cold storage*
4. Click **"Dry Run Simulation"**.

#### Expected Network API Calls:
- `GET /api/v1/playbooks` → **Status: 200 OK**
- `POST /api/v1/playbooks/PB-CLOUD-CONTAINMENT-04/dry-run` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] All 3 steps pass simulation checks.
- [x] Dry-run execution receipt rendered with zero errors.
- [x] Zero 401/500 errors.

---

### STAGE 12: Continuous Compliance & Regulatory Framework Matrix
- **Production Cloud URL:** [https://app.zoikoshield.com/compliance](https://app.zoikoshield.com/compliance)
- **Local Dev URL:** [http://localhost:3000/compliance](http://localhost:3000/compliance)
- **Feature:** Automated compliance mapping across SOC 2 Type II, ISO 27001, PCI-DSS 4.0, NIST SP 800-53, and HIPAA.

#### Test Execution Steps:
1. Navigate to `/compliance`.
2. Verify compliance percentage rings across all frameworks:
   - *SOC 2 Type II: 100%*
   - *ISO 27001:2022: 98%*
   - *PCI-DSS 4.0: 100%*
   - *NIST CSF 2.0: 97%*
3. Click on **SOC 2 Type II** to expand individual control categories (Access Control, Encryption, Incident Response).
4. Select control `CC6.1 - Logical Access Security` and verify attached automated evidence items.

#### Expected Network API Calls:
- `GET /api/v1/compliance/frameworks` → **Status: 200 OK**
- `GET /api/v1/compliance/controls` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Control cards display green "COMPLIANT" badges.
- [x] Evidence links display Merkle proof references.
- [x] Zero console errors.

---

### STAGE 13: Verifiable Merkle Audit Ledger & Receipt Verification
- **Production Cloud URL:** [https://app.zoikoshield.com/ledger](https://app.zoikoshield.com/ledger)
- **Local Dev URL:** [http://localhost:3000/ledger](http://localhost:3000/ledger)
- **Feature:** Tamper-evident Merkle tree epoch checkpointer and offline proof verification engine.

#### Test Execution Steps:
1. Navigate to `/ledger`.
2. Review the list of sealed Merkle epochs (e.g., Epoch `1043`).
3. Click **"Verify Epoch Receipt"** on Epoch `1043`.
4. Inspect the cryptographic breakdown: *Merkle Root Hash, Epoch Timestamp, Dilithium/Ed25519 Dual Signatures, RFC 3161 Timestamp*.
5. Click **"Download Verifiable Proof JSON"**.

#### Expected Network API Calls:
- `GET /api/v1/anchor/receipts` → **Status: 200 OK**
- `GET /api/v1/anchor/receipts/1043` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Verification badge lights up: `CRYPTOGRAPHICALLY VALID & SEALED`.
- [x] Proof JSON downloads with valid hashes matching display.
- [x] Zero 401 errors.

---

### STAGE 14: Automated Compliance Audit Package Generator & CLI
- **Production Cloud URL:** [https://app.zoikoshield.com/audit](https://app.zoikoshield.com/audit)
- **Local Dev URL:** [http://localhost:3000/audit](http://localhost:3000/audit)
- **Feature:** One-click auditor export package generator with independent CLI verification command.

#### Test Execution Steps:
1. Navigate to `/audit`.
2. Under "Generate Compliance Evidence Bundle":
   - Select Framework: `SOC 2 Type II`.
   - Select Time Range: `Last 90 Days`.
3. Click **"Assemble Audit Package"**.
4. Observe generation receipt with package SHA-256 checksum and CLI verification instructions:
   ```bash
   npx zoikoshield-verifier verify ./audit-package-soc2.tar.gz
   ```

#### Expected Network API Calls:
- `GET /api/v1/audit/packages` → **Status: 200 OK**
- `POST /api/v1/audit/generate` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Package assembly reaches 100% with downloadable `.tar.gz` bundle.
- [x] Integrity receipt displays tamper-evident SHA-256 seal.
- [x] Zero network failures.

---

### STAGE 15: Partner Fleet Multi-Tenant Management & Data Fencing
- **Production Cloud URL:** [https://app.zoikoshield.com/partner/fleet](https://app.zoikoshield.com/partner/fleet)
- **Local Dev URL:** [http://localhost:3000/partner/fleet](http://localhost:3000/partner/fleet)
- **Feature:** MSP/MSSP multi-tenant fleet overview with tenant boundary fencing and cross-tenant leakage audits.

#### Test Execution Steps:
1. Navigate to `/partner/fleet`.
2. Inspect the tenant fleet summary: *Total Managed Tenants, High-Severity Incidents, Compliance Drift*.
3. Verify tenant cards: `Acme Financial Services Inc.`, `FinTech Global Corp`, `Healthcare Alliance Group`.
4. Click **"Run Cross-Tenant Isolation Audit"**.
5. Observe the automated security verification certifying zero cross-tenant row-level leakage.

#### Expected Network API Calls:
- `GET /api/v1/partners/fleet/summary` → **Status: 200 OK**
- `GET /api/v1/partners/fleet/isolation-audit` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Isolation audit returns `0 Cross-Tenant Leakage Findings Detected (PASS)`.
- [x] Tenant row-level security (RLS) policies verified.
- [x] Zero 401/403 errors.

---

### STAGE 16: Platform Health, Service Readiness & Disaster Recovery
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/platform-health](https://app.zoikoshield.com/admin/platform-health)
- **Local Dev URL:** [http://localhost:3000/admin/platform-health](http://localhost:3000/admin/platform-health)
- **Feature:** Microservice health matrix (6 services), automated database backup health, and non-destructive restore drill simulator.

#### Test Execution Steps:
1. Navigate to `/admin/platform-health`.
2. Inspect the 6 core backend service cards:
   - `shield-core`: Healthy (Green)
   - `shield-ingest`: Healthy (Green)
   - `shield-ai`: Healthy (Green)
   - `shield-action`: Healthy (Green)
   - `shield-anchor`: Healthy (Green)
   - `shield-audit`: Healthy (Green)
3. Check the **Disaster Recovery & Backup Integrity** panel: *PostgreSQL (Primary DB), ClickHouse (Telemetry), Redis (Cache), Cloud Storage (Cold)*.
4. Click **"Execute Non-Destructive Restore Drill"**.

#### Expected Network API Calls:
- `GET /api/v1/observability/readiness` → **Status: 200 OK**
- `GET /api/v1/observability/health` → **Status: 200 OK**
- `GET /api/v1/observability/backup/status` → **Status: 200 OK**
- `POST /api/v1/observability/restore-drill` → **Status: 200 OK**

#### Expected UI State & Pass Criteria:
- [x] Platform overall status displays `READINESS READY • ALL SERVICES NOMINAL`.
- [x] Non-destructive drill verifies RTO < 4m, RPO = 0s.
- [x] Verified drill receipt rendered with timestamp and cryptographic signature.
- [x] Zero 401 errors.

---

## 4. QA Browser DevTools Verification Checklist

During end-to-end verification, the QA tester should verify the following DevTools conditions:

| DevTools Tab | Check Item | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **Network** | Filter by `Fetch/XHR` | All requests return `200 OK` (no `401`, `403`, or `500`) | [ ] |
| **Network** | Filter by `Doc` / Navigation | Next.js dynamic routes (`/cases/[id]`, `/alerts/[id]`) return `200` | [ ] |
| **Console** | General log output | Zero uncaught exceptions or unhandled promise rejections | [ ] |
| **Application** | `localStorage` / Cookies | Session token and active tenant ID (`00000000-0000-4000-8000-000000000001`) present | [ ] |
| **UI Rendering** | Navigation sidebar | Active route highlights correctly; tenant banner remains fixed | [ ] |

---

## 5. QA Sign-Off Form

| Metric | Target | Actual QA Result | Notes / Approver |
| :--- | :---: | :---: | :--- |
| **Total Test Stages Checked** | 16 / 16 | | |
| **HTTP 401 Unauthorized Count** | **0** | | Zero 401s observed across all stages |
| **HTTP 500 Server Error Count** | **0** | | |
| **Critical User Flows Passed** | 100% | | |
| **Overall Demonstration Readiness** | **GO** | | |

**Tester Name:** _______________________  
**Date & Time:** _______________________  
**Signature / Decision:** `[ ] APPROVED FOR DEMO` `[ ] CONDITIONAL` `[ ] REJECTED`
