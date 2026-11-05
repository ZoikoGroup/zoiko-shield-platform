# ZOIKOSHIELD PLATFORM: COMPLETE END-TO-END TESTING GUIDE & MANUAL QA RUNBOOK

**Target Audience:** QA Engineers, Manual Testers, Security Reviewers, and UAT Stakeholders  
**Document Version:** 3.0  
**Repository Branch:** `Aditya`  
**System Under Test:** ZoikoShield Enterprise Platform (Frontend `:3000` + Backend Microservices `:3001`–`:3005`)  

---

## TABLE OF CONTENTS

1. [QA Test Environment Setup & Execution Baseline](#1-qa-test-environment-setup--execution-baseline)
2. [Documented Test Accounts & Role Directory](#2-documented-test-accounts--role-directory)
3. [All 3 Customer Dashboards & 14 Sidebar Sections Testing Checklist](#3-all-3-customer-dashboards--14-sidebar-sections-testing-checklist)
4. [Step-by-Step Manual Test Cases (TC-001 to TC-030)](#4-step-by-step-manual-test-cases-tc-001-to-tc-030)
   - [Phase 1: Initial Application Access & Registration](#phase-1-initial-application-access--registration)
   - [Phase 2: Authentication, Passkeys & Session Resiliency](#phase-2-authentication-passkeys--session-resiliency)
   - [Phase 3: Customer Dashboard Views & 14 Sidebar Sections](#phase-3-customer-dashboard-views--14-sidebar-sections)
   - [Phase 4: SOC Alert Triage, Case Management & Incident War Room](#phase-4-soc-alert-triage-case-management--incident-war-room)
   - [Phase 5: Governed AI Security Copilot & Decision Review Envelopes](#phase-5-governed-ai-security-copilot--decision-review-envelopes)
   - [Phase 6: Autonomous SOAR Actions & Dual-Custody Approval Quorum](#phase-6-autonomous-soar-actions--dual-custody-approval-quorum)
   - [Phase 7: Merkle Evidence Ledger & Certificate Verification](#phase-7-merkle-evidence-ledger--certificate-verification)
   - [Phase 8: JIT Break-Glass Elevation & Separation of Duties](#phase-8-jit-break-glass-elevation--separation-of-duties)
   - [Phase 9: G1 Multi-Approver Release Gate Cockpit](#phase-9-g1-multi-approver-release-gate-cockpit)
   - [Phase 10: Platform Health & Non-Destructive Restore Drill](#phase-10-platform-health--non-destructive-restore-drill)
   - [Phase 11: Notification Lifecycle & Transactional Email Dispatches](#phase-11-notification-lifecycle--transactional-email-dispatches)
   - [Phase 12: Forensic Exports, Offline Verifier CLI & Audit Packages](#phase-12-forensic-exports-offline-verifier-cli--audit-packages)
5. [Role-Based Access Control (RBAC) & Tenant Isolation Test Matrix](#5-role-based-access-control-rbac--tenant-isolation-test-matrix)
6. [Automated CI Test Execution & Verification Commands](#6-automated-ci-test-execution--verification-commands)

---

## 1. QA TEST ENVIRONMENT SETUP & EXECUTION BASELINE

### 1.1 Local / Staging URLs
- **Frontend Web UI:** `http://localhost:3000` (or `https://app.zoikoshield.com` in deployed staging)
- **Backend API Gateway:** `http://localhost:3001` (proxied via `http://localhost:3000/api/v1/*`)
- **Swagger Interactive API Explorer:** `http://localhost:3001/api/docs`

### 1.2 Starting the Applications for Testing
```bash
# Terminal 1: Backend Database & Microservices
cd backend
npx prisma generate
npm run start:dev

# Terminal 2: Frontend App Router
cd frontend
npm run dev
```

---

## 2. DOCUMENTED TEST ACCOUNTS & ROLE DIRECTORY

The following pre-configured test credentials are supported across both live database environments and resilient client-side proxies:

| Email Address | Password | Role | Intended Workspace | Default Landing Page |
| :--- | :--- | :--- | :--- | :--- |
| `aditya@zoiko.com` | `Aditya@20045678` | `TENANT_OWNER` | Primary Evaluation Workspace | `/customer/dashboard` |
| `sarah.chen@acme.com` | `Shield@SecOps2026!` | `TENANT_OWNER` | Acme Financial Services | `/customer/dashboard` |
| `analyst@zoikoshield-demo.com`| `Shield@SecOps2026!` | `SECURITY_ANALYST`| Acme Financial Services | `/customer/dashboard` |
| `super.admin@zoikoshield.local`| `Admin2026!Platform` | `SUPER_ADMIN` | Platform Operations Cell | `/admin` |
| `elena.rostova@auditor.compliance`| `Auditor2026!Verify`| `AUDITOR` | External Audit Firm | `/auditor` |
| `manualtester2000@zoikoshield.corp`| `Password123!` | `SECURITY_ANALYST`| Global Test Tenant | `/customer/dashboard` |

> [!NOTE]
> All email addresses are case-insensitive. Testing with mixed case (e.g. `Aditya@zoiko.com` vs `aditya@zoiko.com`) is supported and verified.

---

## 3. ALL 3 CUSTOMER DASHBOARDS & 14 SIDEBAR SECTIONS TESTING CHECKLIST

### 3.1 Customer Dashboard View Switching Checklist
- [ ] **Executive View (`/customer/dashboard` -> Tab: "Executive View"):**
  - Verify Security Posture Gauge, Critical Exposures, Protection Coverage, and Active Incidents cards.
  - Verify clean/empty tenants display `0` / `"No data available"`, NOT hardcoded sample metrics like `78 / 100` or `92%`.
  - Verify Priority Actions list dynamically binds to real open cases.
- [ ] **SOC View (`/customer/dashboard` -> Tab: "SOC View"):**
  - Verify Alert Triage Pipeline (`NEW`, `TRIAGED`, `ESCALATED`).
  - Verify threat feed and active SOAR playbooks.
- [ ] **Account View (`/customer/dashboard` -> Tab: "Account View"):**
  - Verify 7-Class Data Retention policy statuses.
  - Verify cryptographic Merkle receipts summary.
  - Verify commercial plan tier and license status.

### 3.2 14 Customer Sidebar Navigation Sections Checklist
- [ ] **1. Security Overview (`/customer/security-overview`):** Remediations and posture summary.
- [ ] **2. Threats & Incidents (`/customer/threats-incidents`):** Case management and triage table.
- [ ] **3. Exposure Management (`/customer/exposure-management`):** Attack surface analysis.
- [ ] **4. Assets & Inventory (`/customer/assets-inventory`):** Discovered cloud and host assets.
- [ ] **5. Vulnerabilities (`/customer/vulnerabilities`):** CVE vulnerability register.
- [ ] **6. Detection & Response (`/customer/detection-response`):** Active OCSF detection rules.
- [ ] **7. Identity & Access (`/customer/identity-access`):** JIT sessions and privileged users.
- [ ] **8. Data Security (`/customer/data-security`):** Data residency and sensitive data discovery.
- [ ] **9. Cloud Security (`/customer/cloud-security`):** Multi-cloud connector postures.
- [ ] **10. Compliance & Risk (`/customer/compliance-risk`):** Automated regulatory framework evaluations.
- [ ] **11. Reports & Analytics (`/customer/reports-analytics`):** Sealed audit packages and exports.
- [ ] **12. Integrations (`/customer/integrations`):** Telemetry connector status.
- [ ] **13. Settings (`/customer/settings`):** Tenant workspace settings and session profile.
- [ ] **14. Return to Command Center (`/customer/dashboard`):** Seamless navigation back to main hub.

---

## 4. STEP-BY-STEP MANUAL TEST CASES (TC-001 TO TC-030)

### Phase 1: Initial Application Access & Registration

#### TC-001: Unauthenticated Route Protection & Gate Redirect
- **Module:** Session Middleware (`frontend/src/middleware.ts`)
- **Objective:** Verify unauthenticated users cannot access private dashboards.
- **Preconditions:** Clear all browser cookies and local storage.
- **Role Required:** None (Unauthenticated).
- **Navigation Path:** Open browser directly to `http://localhost:3000/customer/dashboard`.
- **Expected Frontend Result:** User is immediately intercepted and redirected to `http://localhost:3000/login?redirect=%2Fcustomer%2Fdashboard`.
- **Expected API Behavior:** No private `/api/v1/*` endpoints are called.
- **Pass/Fail Criteria:** PASS if redirected to `/login`; FAIL if any dashboard content renders.

#### TC-002: New Organization Self-Provisioning & Cell Registration
- **Module:** Self-Service Registration (`frontend/src/app/register/page.tsx`)
- **Objective:** Successfully register a new tenant workspace and verify automatic login.
- **Preconditions:** Unauthenticated.
- **Navigation Path:** Open `http://localhost:3000/register`.
- **Exact Inputs to Enter:**
  - Organization Name: `Apex Sentinel Group`
  - Workspace Slug: `apex-sentinel`
  - Full Name: `Test Administrator`
  - Work Email: `admin@apex-sentinel.io`
  - Password: `Password123!Secure`
  - Data Residency Region: `eu-west-1`
  - Compliance Packs: Check `SOC2_TYPE2` and `EU_AI_ACT`
- **Button to Click:** `"Create Workspace & Continue"`
- **Expected Frontend Result:**
  - Spinner appears on button with loading state.
  - Success receipt displays Sovereign Cell `eu-west-1`, Tenant ID, and HSM Attestation hash.
  - Automatically redirects to `/customer/dashboard`.
- **Expected API Behavior:** `POST /api/v1/auth/register-org` returns HTTP 201 with `{ success: true, tenant, session, token }`.
- **Expected Database Result:** New row in `tenant.tenants`, `identity.principals`, `identity.local_credentials`, and `authorization.tenant_memberships`.
- **Negative Test:** Try registering again with `admin@apex-sentinel.io`. Must return HTTP 409 Conflict with `"An account with this email address already exists"`.

---

### Phase 2: Authentication, Passkeys & Session Resiliency

#### TC-003: Login with Valid Credentials (Case-Insensitive Verification)
- **Module:** Authentication Gate (`frontend/src/app/login/page.tsx`)
- **Objective:** Sign in using mixed-case email and verify JWT cookie establishment.
- **Navigation Path:** `http://localhost:3000/login`.
- **Exact Inputs to Enter:**
  - Work email: `Aditya@zoiko.com` (note uppercase `A`)
  - Password: `Aditya@20045678`
- **Button to Click:** `"Sign in with Email"`
- **Expected Frontend Result:** Button shows loading spinner; page redirects to `/customer/dashboard`; header displays `"Aditya"` and workspace name.
- **Expected API Behavior:** `POST /api/v1/auth/login` returns HTTP 200 with cookies `zoiko_auth=true` and `zoiko_shield_access_token`.
- **Pass/Fail Criteria:** PASS if redirected into dashboard without errors.

#### TC-004: Invalid Credentials Rejection & Anti-Enumeration
- **Module:** Authentication Gate (`frontend/src/app/login/page.tsx`)
- **Objective:** Verify wrong password returns uniform safe error message without leaking account existence.
- **Navigation Path:** `http://localhost:3000/login`.
- **Exact Inputs to Enter:**
  - Work email: `Aditya@zoiko.com`
  - Password: `WrongPassword999!`
- **Button to Click:** `"Sign in with Email"`
- **Expected Frontend Result:** Red alert banner appears: `"Invalid credentials"`.
- **Expected API Behavior:** `POST /api/v1/auth/login` returns HTTP 401 Unauthorized (`{"statusCode": 401, "message": "Invalid credentials"}`).
- **Pass/Fail Criteria:** PASS if 401 is displayed cleanly and user is not logged in.

#### TC-005: Logout and Immediate Re-login Resiliency
- **Module:** Session Lifecycle & Persistent Store (`frontend/src/lib/api-client.ts`)
- **Objective:** Verify user can log out and immediately log back in without encountering 401 errors.
- **Navigation Path:** While logged in as `Aditya@zoiko.com`, click profile avatar in top header -> click `"Sign Out"`.
- **Expected Frontend Result:** Redirected to `/login?logout=true`. Cookies `zoiko_auth` and `shield_access_token` are cleared.
- **Re-login Action:** Enter `Aditya@zoiko.com` and `Aditya@20045678` -> click `"Sign in with Email"`.
- **Expected Result:** Immediate successful login into `/customer/dashboard`.

---

### Phase 3: Customer Dashboard Views & 14 Sidebar Sections

#### TC-006: Executive View Zero Mock Data Integrity
- **Module:** Customer Dashboard (`frontend/src/components/customer/CustomerDashboardView.tsx`)
- **Objective:** Ensure clean database tenants show 0 / empty states, not hardcoded mock numbers.
- **Login Account:** `admin@apex-sentinel.io` (newly created clean tenant).
- **Navigation Path:** `/customer/dashboard`.
- **What to Inspect:**
  - Security Posture Gauge: Must display `0` (or computed passing control ratio), not hardcoded `78 / 100`.
  - Active Incidents: Must display `0`, not `5`.
  - Priority Actions: Must display `"No priority actions required at this time."`
  - Critical Alerts Table: Must display `"No critical alerts reported for this workspace"`.
- **Pass/Fail Criteria:** PASS if zero synthetic sample records appear.

#### TC-007: Complete Sidebar Traversal (Sections 1 through 14)
- **Module:** Customer Workspace Router (`frontend/src/components/customer/CustomerWorkspaceViews.tsx`)
- **Objective:** Click every single sidebar link and verify view rendering without errors or missing pages.
- **Execution Steps:**
  1. Click *"Security Overview"* -> Verifies `/customer/security-overview`.
  2. Click *"Threats & Incidents"* -> Verifies `/customer/threats-incidents`.
  3. Click *"Exposure Management"* -> Verifies `/customer/exposure-management`.
  4. Click *"Assets & Inventory"* -> Verifies `/customer/assets-inventory`.
  5. Click *"Vulnerabilities"* -> Verifies `/customer/vulnerabilities`.
  6. Click *"Detection & Response"* -> Verifies `/customer/detection-response`.
  7. Click *"Identity & Access"* -> Verifies `/customer/identity-access`.
  8. Click *"Data Security"* -> Verifies `/customer/data-security`.
  9. Click *"Cloud Security"* -> Verifies `/customer/cloud-security`.
  10. Click *"Compliance & Risk"* -> Verifies `/customer/compliance-risk`.
  11. Click *"Reports & Analytics"* -> Verifies `/customer/reports-analytics`.
  12. Click *"Integrations"* -> Verifies `/customer/integrations`.
  13. Click *"Settings"* -> Verifies `/customer/settings`.
  14. Click *"Command Center"* -> Returns to `/customer/dashboard`.
- **Pass/Fail Criteria:** PASS if all 14 views load with HTTP 200 and zero unhandled exceptions.

---

### Phase 4: SOC Alert Triage, Case Management & Incident War Room

#### TC-008: Real-Time Alert Triage & Status Transition
- **Module:** SOC Alert Console (`frontend/src/app/alerts/page.tsx`)
- **Objective:** Triage an alert and verify state machine update in database.
- **Login Account:** `analyst@zoikoshield-demo.com` (`SECURITY_ANALYST`).
- **Navigation Path:** `/alerts`.
- **Execution Steps:**
  1. Click on the first alert in the queue (e.g. `alt-2026-auth-01`).
  2. Slide-over drawer opens showing OCSF finding details and MITRE technique.
  3. In the drawer status dropdown, select `"TRIAGED"`.
  4. Click `"Save Status"`.
- **Expected Frontend Result:** Alert badge updates from blue `NEW` to amber `TRIAGED`; notification toast confirms `"Alert updated"`.
- **Expected API Behavior:** `PATCH /api/v1/alerts/alt-2026-auth-01` returns HTTP 200 with updated record.
- **Expected Database Result:** `alert.alerts.status` changes to `'TRIAGED'`.

#### TC-009: Promote Alert to Major Investigation Case
- **Module:** Incident Management (`frontend/src/app/cases/page.tsx`)
- **Objective:** Escalate an alert into a full case investigation.
- **Navigation Path:** `/alerts/[alertId]` drawer -> click `"Escalate to Major Incident"`.
- **Modal Inputs:**
  - Case Title: `Investigate Unauthorized Kerberos TGS Request Chain`
  - Severity: `CRITICAL`
  - Assigned Lead: `analyst@zoikoshield-demo.com`
- **Button to Click:** `"Create Investigation Case"`
- **Expected Result:** Redirected to `/cases/case-2026-***`; timeline tab initializes with alert details.

---

### Phase 5: Governed AI Security Copilot & Decision Review Envelopes

#### TC-010: Copilot Attack Path Synthesis with Spec §16.1 Envelope
- **Module:** AI Copilot (`frontend/src/app/copilot/page.tsx`)
- **Objective:** Run an AI investigation query and verify all 10 mandatory fields in Decision Review Envelope.
- **Navigation Path:** `/copilot`.
- **Exact Input:** In the chat prompt box, type:
  `Analyze lateral movement vectors for case-2026-auth-attack-01 and propose host isolation blast radius.`
- **Button to Click:** `"Generate Decision Envelope"` (or Enter)
- **Expected Frontend Result:**
  - Model Armor gateway verifies prompt.
  - Spec §16.1 Envelope renders containing:
    1. Hypothesis
    2. Confidence Score
    3. Blast Radius Assessment
    4. MITRE Technique (`T1021.002`)
    5. Grounded Citations (OCSF Event IDs)
    6. Recommended Playbook
    7. Estimated Execution Duration
    8. Authority Tier (`R2`)
    9. Rollback Feasibility (`YES`)
    10. Mandatory Operator Attributable Rationale Field
- **Attributable Sign-Off:** Enter rationale: `"Verified beaconing telemetry correlates with unapproved IP"`. Click `"Accept & Record Decision"`.
- **Expected Ledger Result:** Cryptographic hash of decision envelope is anchored to `shield-anchor`.

---

### Phase 6: Autonomous SOAR Actions & Dual-Custody Approval Quorum

#### TC-011: SOAR Playbook Execution with Dual-Custody (4-Eyes) Quorum
- **Module:** SOAR Containment (`frontend/src/app/actions/page.tsx`)
- **Objective:** Execute an R3 destructive containment action and verify approval quorum.
- **Login Account:** `analyst@zoikoshield-demo.com` (First Operator).
- **Navigation Path:** `/actions`.
- **Action Selected:** `PB-302: Network Isolation & Session Eviction (Target: host-finance-db01)`.
- **Button to Click:** `"Propose Containment"`
- **Expected Result:** Action status becomes `PENDING_APPROVAL (1 of 2 signatures)`.
- **Second Operator Approval:**
  - Log out and log in as `sarah.chen@acme.com` (`TENANT_OWNER`).
  - Navigate to `/actions` -> click `"Review Pending Approvals"`.
  - Enter rationale: `"Approved per CISO incident ticket #849"` -> click `"Sign & Execute"`.
- **Expected Result:** Action status updates to `EXECUTED`; blast radius confirmation receipt is generated.

---

### Phase 7: Merkle Evidence Ledger & Certificate Verification

#### TC-012: Offline WebCrypto Merkle Inclusion Proof Verification
- **Module:** Forensic Verifier (`frontend/src/app/verify-certificate/page.tsx`)
- **Objective:** Verify cryptographic integrity of an audit certificate without network connectivity.
- **Navigation Path:** `/verify-certificate`.
- **Inputs to Enter:**
  - Paste Sample Receipt JSON (from `/ledger`):
    ```json
    {
      "leafHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "rootHash": "857b28c85a49800a7fa4f001ef03517c5a0833a925f619b05f66185871f3ab8d",
      "epoch": 1042,
      "proof": ["0x00...", "0x01..."]
    }
    ```
- **Button to Click:** `"Verify Merkle Inclusion Proof"`
- **Expected Result:** Green shield banner renders: `"CRYPTOGRAPHICALLY VALID: Document mathematically anchored to Epoch 1042 Merkle Root"`.

---

### Phase 8: JIT Break-Glass Elevation & Separation of Duties

#### TC-013: JIT Break-Glass Elevation with Hardware Passkey Step-Up
- **Module:** JIT Privileged Elevation (`frontend/src/app/admin/jit-elevation/page.tsx`)
- **Objective:** Request emergency privilege elevation and verify WebAuthn step-up requirement.
- **Login Account:** `analyst@zoikoshield-demo.com`.
- **Navigation Path:** `/admin/jit-elevation`.
- **Button to Click:** `"Request JIT Break-Glass Elevation"`.
- **Modal Inputs:**
  - Elevation Role: `SUPER_ADMIN_BREAKGLASS`
  - Duration: `60` minutes
  - Reason: `P1 Outage: Remediating core database replication lock`
- **Button to Click:** `"Submit Elevation Request & Authenticate with Passkey"`
- **Expected Result:** WebAuthn hardware prompt triggers; on completion, elevation ticket enters quorum approval queue.

---

### Phase 9: G1 Multi-Approver Release Gate Cockpit

#### TC-014: G1 Launch Gate 8-Domain Ratification
- **Module:** Platform Launch Gate (`frontend/src/app/admin/g1-gate/page.tsx`)
- **Objective:** Verify all 8 canonical domain approvers must ratify a production release bundle.
- **Login Account:** `super.admin@zoikoshield.local` (`SUPER_ADMIN`).
- **Navigation Path:** `/admin/g1-gate`.
- **What to Inspect:**
  - Verify all 8 canonical domains are rendered:
    1. Lead Security Architect
    2. Principal Cryptographer
    3. Compliance & Governance Lead
    4. Head of Legal & Privacy
    5. SRE & Infrastructure Lead
    6. Lead Frontend Architect
    7. AI Safety & Ethics Officer
    8. Independent QA Director
- **Pass/Fail Criteria:** PASS if initial status is fail-closed (`BLOCKED`); updates to `RELEASE CANDIDATE READY` only when all 8 approve.

---

### Phase 10: Platform Health & Non-Destructive Restore Drill

#### TC-015: Trigger Non-Destructive DR Restore Drill (Spec §26 / G05)
- **Module:** Platform Readiness (`frontend/src/app/admin/platform-health/page.tsx`)
- **Objective:** Execute an on-demand disaster recovery drill and verify attestation receipt.
- **Login Account:** `super.admin@zoikoshield.local`.
- **Navigation Path:** `/admin/platform-health`.
- **Button to Click:** `"Execute Non-Destructive Restore Drill"`
- **Expected Frontend Result:**
  - Real-time progress bar steps through: `Snapshot Verification` → `Ephemeral Target Provisioning` → `Schema Rehydration` → `Data Integrity Verification` → `Tear Down`.
  - Verified Drill Receipt modal renders with timestamp, snapshot hash, and zero downtime confirmation.
- **Expected API Behavior:** `POST /api/v1/dr/restore-drill` returns HTTP 200 with `{ drillId, verified: true, durationMs }`.

---

### Phase 11: Notification Lifecycle & Transactional Email Dispatches

#### TC-016: Trigger and Verify Notification Delivery
- **Module:** Notification Center (`frontend/src/app/notifications/page.tsx`)
- **Objective:** Trigger an event and verify the dispatch is recorded in `notification.deliveries`.
- **Navigation Path:** Click notification bell icon in top right header.
- **Expected Frontend Result:** Slide-out drawer lists real dispatches with timestamp, event ID (`ZS-EML-*`), recipient, and status (`ACKNOWLEDGED`).
- **Negative Test:** On empty workspaces, verify message: `"No data available — 0 active notifications for this tenant."`

---

### Phase 12: Forensic Exports, Offline Verifier CLI & Audit Packages

#### TC-017: Sealed Audit Package Compilation & Air-Gapped CLI Verification
- **Module:** Audit Packages (`frontend/src/app/audit/page.tsx`)
- **Objective:** Generate a sealed compliance audit archive and verify it using `verifier-cli`.
- **Navigation Path:** `/audit` -> click `"Compile Sealed Audit Package"`.
- **Inputs:** Date range: Last 30 Days; Framework: `SOC2_TYPE2`.
- **Button to Click:** `"Generate & Download Package (.tar.gz)"`
- **CLI Verification Command:**
  ```bash
  cd backend
  npm run audit:package:verify
  ```
- **Expected CLI Output:**
  ```
  [x] Parsing Sealed Audit Package...
  [x] Verifying RFC 6962 Merkle Root... VALID
  [x] Verifying Post-Quantum ML-DSA-65 Signature... VALID
  [x] Verifying OCSF Event Chain Hash Integrity... 100% MATCH
  SUCCESS: Audit Package is authentic and unmodified.
  ```

---

## 5. ROLE-BASED ACCESS CONTROL (RBAC) & TENANT ISOLATION TEST MATRIX

| Test Scenario | `SECURITY_ANALYST` | `TENANT_OWNER` | `SUPER_ADMIN` | `AUDITOR` |
| :--- | :---: | :---: | :---: | :---: |
| Access `/customer/dashboard` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW (Read-Only)** |
| Triage Alerts (`/alerts`) | **ALLOW** | **ALLOW** | **ALLOW** | **DENIED** |
| Access Tenant Admin (`/admin/tenant`) | **REDIRECT** | **ALLOW** | **ALLOW** | **REDIRECT** |
| Access Platform Health (`/admin/platform-health`) | **REDIRECT** | **REDIRECT** | **ALLOW** | **REDIRECT** |
| Execute R3 Containment (`/actions`) | **DENIED** | **ALLOW (Quorum)** | **ALLOW** | **DENIED** |
| Access External Audit Portal (`/auditor`) | **REDIRECT** | **ALLOW** | **ALLOW** | **ALLOW** |
| Direct API access without Tenant Header | **400 Bad Request**| **400 Bad Request**| **400 Bad Request**| **400 Bad Request**|
| Cross-Tenant Query (`x-tenant-id: other-tenant`) | **403 Forbidden** | **403 Forbidden** | **Scoped Access** | **403 Forbidden** |

---

## 6. AUTOMATED CI TEST EXECUTION & VERIFICATION COMMANDS

Testers and developers can run the complete automated test harness locally:

```bash
# 1. Full Frontend Vitest Test Suites (149 of 149 tests)
cd frontend
npx vitest run --maxWorkers=2

# 2. Frontend Static Type-Checking
cd frontend
npx tsc --noEmit

# 3. Backend Database Access Policy & Cross-Module Isolation Tests
cd backend
npx jest apps/shield-core/test/database-access-policy.spec.ts

# 4. Ungrounded Terminology Static CI Linter
cd backend
npm run check:ungrounded-terms

# 5. Public Capability Claims & Connector Governance Check
cd backend
npm run check:capability-claims

# 6. Controller Access Contracts & Swagger Alignment
cd backend
npm run access:check
npm run swagger:check

# 7. G1 Release Evidence Index Check
cd backend
npm run check:evidence-index
```

