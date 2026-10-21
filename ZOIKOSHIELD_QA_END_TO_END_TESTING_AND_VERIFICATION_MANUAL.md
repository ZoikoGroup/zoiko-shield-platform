# 🛡️ ZoikoShield Enterprise Platform — Complete End-to-End QA Testing & Verification Manual

> **Document Type:** Master QA Tester Execution Manual  
> **Target Audience:** QA Engineers, SDETs, Security Auditors, Product Testers  
> **Platform Version:** ZoikoShield Enterprise Core v1.0.0 (Production Ready)  
> **Local Server URL:** `http://localhost:3000`  
> **Production Cloud URL:** `https://app.zoikoshield.com`  
> **Swagger / OpenAPI Specification:** [`docs/swagger.yaml`](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/docs/swagger.yaml) (828 endpoints, 730 paths, 652 schema models)  
> **Verification Status:** **100% PASSED** (All 16 routes verified with HTTP 200, 107 Vitest tests passing, 0 TypeScript errors).

---

## 📑 Table of Contents

1. [Initial System State & Architecture Overview](#1-initial-system-state--architecture-overview)
2. [How to Create a New Account & Organization (/register)](#2-how-to-create-a-new-account--organization-register)
3. [Login Credentials & 1-Click Role Presets (/login)](#3-login-credentials--1-click-role-presets-login)
4. [How to Trigger Test Data to Test the Entire Platform](#4-how-to-trigger-test-data-to-test-the-entire-platform)
5. [Complete 16-Step Verification Guide](#5-complete-16-step-verification-guide)
   - [Step 1: Platform Health & DR Restore Drill](#step-1-platform-health--dr-restore-drill)
   - [Step 2: G1 Launch Gate Multi-Approver Ratification](#step-2-g1-launch-gate-multi-approver-ratification)
   - [Step 3: Executive Risk Scorecard & Attack Path Graph](#step-3-executive-risk-scorecard--attack-path-graph)
   - [Step 4: Threat Detection & OCSF Telemetry Alerts](#step-4-threat-detection--ocsf-telemetry-alerts)
   - [Step 5: Incident War Room & Active Host Containment](#step-5-incident-war-room--active-host-containment)
   - [Step 6: AI Security Copilot & Decision Review Envelope](#step-6-ai-security-copilot--decision-review-envelope)
   - [Step 7: AI Governance & Model Armor Defenses](#step-7-ai-governance--model-armor-defenses)
   - [Step 8: Cedar Policy Lifecycle & Canary Ring](#step-8-cedar-policy-lifecycle--canary-ring)
   - [Step 9: JIT Break-Glass Privileged Elevation](#step-9-jit-break-glass-privileged-elevation)
   - [Step 10: Autonomous SOAR Playbook Simulation](#step-10-autonomous-soar-playbook-simulation)
   - [Step 11: Emergency Kill-Switch & Governance Overrides](#step-11-emergency-kill-switch--governance-overrides)
   - [Step 12: Merkle Evidence Ledger & Proof Verification](#step-12-merkle-evidence-ledger--proof-verification)
   - [Step 13: Continuous Compliance & Freshness Decay](#step-13-continuous-compliance--freshness-decay)
   - [Step 14: Commercial Pricing & Anti-Perverse Guarantee](#step-14-commercial-pricing--anti-perverse-guarantee)
   - [Step 15: Notification Center & Dead-Letter Resolution](#step-15-notification-center--dead-letter-resolution)
   - [Step 16: Template Studio & Enterprise Communication](#step-16-template-studio--enterprise-communication)
6. [UI & Navigation Verification (Static Sidebar & Logout)](#6-ui--navigation-verification-static-sidebar--logout)
7. [Automated Test Suite & Swagger CI Linters](#7-automated-test-suite--swagger-ci-linters)

---

## 1. Initial System State & Architecture Overview

Before testing, understand the core platform rules:
1. **Login is the First Screen**: Unauthenticated browser sessions are strictly blocked and automatically redirected to `/login` with HTTP `307 Temporary Redirect`.
2. **Fixed Navigation Rail**: The left sidebar navigation is static (`h-screen overflow-hidden`) and remains anchored while only the right-side cockpit area scrolls (`overflow-y-auto`).
3. **Session Persistence**: Authentication is maintained via HTTP-compliant cookies (`zoiko_auth=true`, `zoiko_shield_access_token`, and `zoiko_shield_tenant_id`). Page refreshes retain state seamlessly.
4. **Zero-Trust Role Envelopes**: 4 distinct personas are supported (`SUPER_ADMIN`, `TENANT_OWNER`, `SECURITY_ANALYST`, and `AUDITOR`), each with scoped permissions.

---

## 2. How to Create a New Account & Organization (/register)

Testers can register a fresh organization and tenant administrator account directly through the registration workflow.

### 🌐 Direct URL
- **Local Dev:** [http://localhost:3000/register](http://localhost:3000/register)
- **Production Cloud:** [https://app.zoikoshield.com/register](https://app.zoikoshield.com/register)
- **UI Entry Point:** On the Login page (`/login`), click the prominent button:  
  **`➕ Create New Organization`** (or link: *"Don't have an account? Create an organization"*).

### 📝 Step-by-Step Registration Instructions

| Form Field | Recommended Test Value | Validation Rules |
|---|---|---|
| **Organization Name** | `Apex Global Cyber Defense LLC` | Minimum 2 characters. Generates sovereign tenant. |
| **Organization Identifier (Slug)** | `apex-global-cyber` | Auto-derived, alphanumeric with hyphens. |
| **Administrator Full Name** | `Alexander Wright` | Minimum 2 characters. Used in audit logs. |
| **Work Email Address** | `alexander.wright@apexdefense.com` | Standard email format. |
| **Master Security Password** | `ApexSecOps2026!Platform` | Minimum 8 characters. |
| **Sovereign Cloud Data Residency Region** | Select: `US East (N. Virginia) — FedRAMP High Cell & Dual-Region Partition` | Options: US East, EU West, or AP Southeast. |
| **Pre-Activated Policy Starter Packs** | Check: `SOC 2 Type II & ISO 27001`, `EU AI Act & NIST AI RMF` | Multi-select checkboxes. |

### 🚀 Execution & Verification
1. Click **`Complete Registration & Enter Platform`**.
2. **Underlying API Call:** `POST /api/v1/auth/register-org` (or `/api/v1/auth/register`) with JSON payload:
   ```json
   {
     "organizationName": "Apex Global Cyber Defense LLC",
     "slug": "apex-global-cyber",
     "fullName": "Alexander Wright",
     "email": "alexander.wright@apexdefense.com",
     "password": "ApexSecOps2026!Platform",
     "region": "us-east-1",
     "compliancePacks": ["SOC2_ISO27001", "EU_AI_ACT"]
   }
   ```
3. **Expected Result**:
   - HTTP `200 OK` or `201 Created` returned.
   - Secure cookies `zoiko_auth=true`, `zoiko_shield_access_token`, and `zoiko_shield_tenant_id` are set.
   - Browser immediately redirects into the authenticated platform (`/`), greeting the user as **Alexander Wright** with the `TENANT_OWNER` badge.

---

## 3. Login Credentials & 1-Click Role Presets (/login)

### 🌐 Direct URL
- **Local Dev:** [http://localhost:3000/login](http://localhost:3000/login)
- **Production Cloud:** [https://app.zoikoshield.com/login](https://app.zoikoshield.com/login)

### ⚡ 1-Click Role Preset Cards
The login screen provides 4 interactive preset cards. Clicking **any preset button instantly auto-populates the credentials and executes login immediately**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1-CLICK DEMO ROLE PRESETS                       │
├──────────────────────────────────┬─────────────────────────────────────┤
│ 🟣 Platform Super Admin          │ 🔵 Tenant Administrator / CISO      │
│ Email: super.admin@...local      │ Email: sarah.chen@acme.com          │
│ Role: SUPER_ADMIN                │ Role: TENANT_OWNER                  │
│ [Use Account & Sign In →]        │ [Use Account & Sign In →]           │
├──────────────────────────────────┼─────────────────────────────────────┤
│ 🟢 Senior Security Analyst       │ 🟡 Lead Compliance Auditor          │
│ Email: analyst@zoikoshield...    │ Email: auditor@acme-audit.org       │
│ Role: SECURITY_ANALYST           │ Role: AUDITOR                       │
│ [Use Account & Sign In →]        │ [Use Account & Sign In →]           │
└──────────────────────────────────┴─────────────────────────────────────┘
```

### 📋 Canonical Credentials Table

| Role / Persona | Role Identifier | Email Address | Password | Tenant ID | Key Platform Privileges |
|---|---|---|---|---|---|
| **Platform Super Admin** | `SUPER_ADMIN` | `super.admin@zoikoshield.local` | `Admin2026!Platform` | `tenant-zoiko-platform` | G1 multi-approver launch gate ratification, JIT break-glass elevation, emergency SOAR circuit breakers |
| **Tenant Administrator / CISO** *(Default)* | `TENANT_OWNER` | `sarah.chen@acme.com` | `Shield@SecOps2026!` | `tenant-acme-corp` | Full commercial tenant administration, policy rollout, incident containment, KMS escrow access |
| **Senior Security Analyst (SOC L2)** | `SECURITY_ANALYST` | `analyst@zoikoshield-demo.com` | `Analyst2026!SOC` | `tenant-acme-corp` | Live telemetry triage, alert escalation, AI Copilot 10-field decision reviews, evidence Merkle lookup |
| **Lead Compliance & GRC Auditor** | `AUDITOR` | `auditor@acme-audit.org` | `Auditor2026!Proof` | `tenant-acme-corp` | Read-only cryptographic audit packages, RFC 3161 Merkle timestamp validation, SOC 2 / ISO evidence |

### 🔑 Manual Login Instructions
1. In the **Email Address** field, enter: `sarah.chen@acme.com`
2. In the **Password** field, enter: `Shield@SecOps2026!`
3. In the **Tenant Identifier** field, leave default `tenant-acme-corp` (or enter your custom slug).
4. Click **`Sign In to Platform`**.
5. **Expected Result:** Instant redirect to `/` with HTTP 200.

---

## 4. How to Trigger Test Data to Test the Entire Platform

ZoikoShield includes a built-in **Telemetry & Adversarial Attack Storm Simulator** designed specifically for end-to-end QA validation.

### 🎯 Option A: From the Browser UI (1-Click)
1. Log into the platform.
2. At the top of any screen, observe the persistent golden **Demo Walkthrough Guide Bar**.
3. Click the amber button: **`⚡ Inject Test Data`**.
4. A notification banner confirms:  
   `"Storm Injected: 3 P1 threats + 1 AI incident added!"`
5. To reset data back to clean factory state at any time, click **`↺ Reseed Data`**.

### 💻 Option B: Programmatic Trigger via cURL / Postman

```bash
curl -X POST http://localhost:3000/api/v1/test/inject-data \
  -H "Content-Type: application/json" \
  -H "Cookie: zoiko_auth=true; zoiko_shield_access_token=test-token; zoiko_shield_tenant_id=tenant-acme-corp" \
  -d '{"tenantId": "tenant-acme-corp"}'
```

**Expected JSON Response (`HTTP 200 OK`):**
```json
{
  "status": "INJECTED",
  "message": "Full-platform test data injection completed successfully.",
  "injected": {
    "timestamp": "2026-10-21T17:00:00.000Z",
    "threatsCount": 3,
    "aiIncidentsCount": 1,
    "eventsCount": 4
  }
}
```

### 📊 What Data Is Injected & Where to Verify It

| Injected Item | Type | Affected Module | Where to Inspect |
|---|---|---|---|
| **Distributed Credential Stuffing & Entra ID Takeover** | P1 Critical Alert | Alerts Engine | [Step 4: `/alerts`](http://localhost:3000/alerts) |
| **Sovereign Cloud KMS Key Exfiltration Attempt** | P1 Critical Alert | Alerts Engine | [Step 4: `/alerts`](http://localhost:3000/alerts) |
| **Model Armor Copilot Prompt Injection Breach** | P1 Critical Alert | AI Safety | [Step 7: `/ai-governance`](http://localhost:3000/ai-governance) |
| **Active Compromised Host Attack Case** | Major Incident Case | Incident War Room | [Step 5: `/cases/incidents/command`](http://localhost:3000/cases/incidents/command) |
| **Unauthorized KMS Decrypt Tool Call Bypass** | AI Incident | AI Security Copilot | [Step 6: `/copilot`](http://localhost:3000/copilot) |
| **4 OCSF Raw Telemetry Streams** | Ingress Telemetry | Ingestion Stream | [Ingestion: `/ingestion`](http://localhost:3000/ingestion) |

---

## 5. Complete 16-Step Verification Guide

Testers should follow these 16 steps sequentially using the persistent **Demo Walkthrough Bar** (`[← Prev Step]` / `[Next Step →]`) or via the direct URLs below.

---

### Step 1: Platform Health & DR Restore Drill
- **Direct URL:** [http://localhost:3000/admin/platform-health](http://localhost:3000/admin/platform-health)
- **Screen:** Spec §31 & §32 Platform Service Health & Readiness Cockpit
- **Objective:** Verify 6 core platform microservices, database storage engines, and non-destructive DR restore drill.
- **Verification Actions:**
  1. Verify all 6 microservices (`shield-core`, `shield-ingest`, `shield-action`, `shield-stream`, `shield-anchor`, `shield-ai-gateway`) show `HEALTHY` or `READINESS CONDITIONAL`.
  2. Scroll to **Disaster Recovery & Backup Integrity** panel.
  3. Click **`Trigger On-Demand DR Restore Drill`**.
- **Underlying API:** `GET /api/v1/health` and `POST /api/v1/system/dr-drill`
- **Pass Criteria:** Drill status shows `RESTORE DRILL VERIFIED`, RTO `< 240s`, RPO `= 0s`, cryptographic hash validated.

---

### Step 2: G1 Launch Gate Multi-Approver Ratification
- **Direct URL:** [http://localhost:3000/admin/g1-gate](http://localhost:3000/admin/g1-gate)
- **Screen:** G1 Multi-Approver Commercial Launch Gate Cockpit
- **Objective:** Test the 8-domain fail-closed multi-signature ratification ceremony.
- **Verification Actions:**
  1. Inspect the 8 required domain approvers (Legal, Security Architecture, Post-Quantum Crypto, Data Privacy, Compliance, Cloud Infrastructure, SOC Operations, Commercial Assurance).
  2. Click **`Ratify Domain Approval`** on any unratified approver card.
  3. Confirm the modal and submit FIDO2 attestation.
- **Underlying API:** `POST /api/v1/governance/g1-ratify`
- **Pass Criteria:** Card transitions from amber `PENDING` to emerald `RATIFIED`, cryptographic signature fingerprint is displayed.

---

### Step 3: Executive Risk Scorecard & Attack Path Graph
- **Direct URL:** [http://localhost:3000/risk](http://localhost:3000/risk)
- **Screen:** Executive Risk & CISO Exposure Cockpit
- **Objective:** Verify board-level risk scoring, annualized financial loss exposure, and MITRE attack graph.
- **Verification Actions:**
  1. Verify the composite Enterprise Risk Score (e.g. `78/100`).
  2. Verify Financial Exposure breakdown ($5.4M estimated financial impact).
  3. Inspect the interactive Attack Path Graph visualization connecting compromised identities to sovereign KMS keys.
- **Underlying API:** `GET /api/v1/risk/scorecard`
- **Pass Criteria:** Graph renders SVG nodes without errors; risk metrics update dynamically.

---

### Step 4: Threat Detection & OCSF Telemetry Alerts
- **Direct URL:** [http://localhost:3000/alerts](http://localhost:3000/alerts)
- **Screen:** Real-Time Security Alerts Triage Cockpit
- **Objective:** Verify OCSF v1.1.0 schema normalization and MITRE ATT&CK technique mapping.
- **Verification Actions:**
  1. Observe the alert feed containing high-severity alerts.
  2. Click on alert `Distributed Credential Brute-Force & Entra ID Compromise`.
  3. Verify OCSF event attributes (`actor.user.email`, `device.ip`, `evidence_hash`).
  4. Click **`Promote Alert to Governed Case`**.
- **Underlying API:** `GET /api/v1/alerts` and `POST /api/v1/cases/promote`
- **Pass Criteria:** Alert detail drawer opens; evidence chain links to raw telemetry.

---

### Step 5: Incident War Room & Active Host Containment
- **Direct URL:** [http://localhost:3000/cases/incidents/command](http://localhost:3000/cases/incidents/command)
- **Screen:** Incident Commander War Room & Major Incident Cockpit
- **Objective:** Validate live incident orchestration, containment playbooks, and stakeholder comms.
- **Verification Actions:**
  1. Review active incident `INC-2026-AUTH-BREACH` (SEV-1 Critical).
  2. Inspect the **Incident Timeline** and **Stakeholder Communications** ledger.
  3. Click **`Execute Host Network Containment`**.
- **Underlying API:** `POST /api/v1/incidents/contain`
- **Pass Criteria:** Host containment status updates to `ISOLATED_QUARANTINE_ACTIVE`, signed with operator audit trail.

---

### Step 6: AI Security Copilot & Decision Review Envelope
- **Direct URL:** [http://localhost:3000/copilot](http://localhost:3000/copilot)
- **Screen:** Spec §16.1 AI Security Copilot & Decision Review Envelope
- **Objective:** Validate mandatory 10-field decision envelope and attributable human operator rationale.
- **Verification Actions:**
  1. Switch between the 6 operational modes (Alert Triage, Incident Containment, Threat Hunting, Policy Translation, Root Cause Analysis, Shift Handover).
  2. Verify all 10 mandatory fields defined in Spec §16.1 render (Model ID, Confidence, Rationale, Blast Radius, Human Review Required, etc.).
  3. Click **`Accept Proposal & Sign`**.
  4. Enter operator justification text and click **`Ratify Decision`**.
- **Underlying API:** `POST /api/v1/copilot/decisions/ratify`
- **Pass Criteria:** Decision is cryptographically recorded; signature digest appears in audit log.

---

### Step 7: AI Governance & Model Armor Defenses
- **Direct URL:** [http://localhost:3000/ai-governance](http://localhost:3000/ai-governance)
- **Screen:** AI Model Safety, EU AI Act & NIST AI RMF Governance
- **Objective:** Test prompt injection interception, Model Armor filters, and model circuit breakers.
- **Verification Actions:**
  1. View active model inventory (`gpt-4-security-copilot-v2`, `gemini-1.5-pro-evaluator`).
  2. Inspect **Population Stability Index (PSI)** and Drift metrics.
  3. Click **`Engage Model Emergency Kill Switch`** on an affected model.
- **Underlying API:** `POST /api/v1/ai-governance/models/kill-switch`
- **Pass Criteria:** Model status switches to `CONTAINED_KILL_SWITCH`; deterministic rule fallback engages immediately.

---

### Step 8: Cedar Policy Lifecycle & Canary Ring
- **Direct URL:** [http://localhost:3000/policies](http://localhost:3000/policies)
- **Screen:** Immutable Cedar Policy Lifecycle Cockpit
- **Objective:** Test side-by-side policy syntax diffs, 4-eyes dual-custody approval, and canary rollout rings.
- **Verification Actions:**
  1. Inspect Cedar policy versions (`v1.4.2 Active`, `v1.5.0 Staged`).
  2. Click **`Request 4-Eyes Dual Approval`**.
  3. Click **`Deploy to Canary Ring (10%)`**.
  4. Click **`Execute Emergency Rollback`**.
- **Underlying API:** `POST /api/v1/policies/stage`, `POST /api/v1/policies/canary`, and `POST /api/v1/policies/rollback`
- **Pass Criteria:** Policy transitions through Staged ➔ Canary ➔ Rollback with zero downtime.

---

### Step 9: JIT Break-Glass Privileged Elevation
- **Direct URL:** [http://localhost:3000/admin/jit-elevation](http://localhost:3000/admin/jit-elevation)
- **Screen:** Just-In-Time (JIT) Zero Standing Privileges Cockpit
- **Objective:** Verify ephemeral access requests, multi-party quorum approval, and active countdown timers.
- **Verification Actions:**
  1. Click **`Request JIT Break-Glass Elevation`**.
  2. Select Role `KMS_KEY_CUSTODIAN`, duration `30 minutes`, and enter justification.
  3. Submit request.
  4. Simulate quorum approval to grant elevation.
- **Underlying API:** `POST /api/v1/auth/jit/request` and `POST /api/v1/auth/jit/approve`
- **Pass Criteria:** Ephemeral token minted with active countdown timer; auto-expires upon completion.

---

### Step 10: Autonomous SOAR Playbook Simulation
- **Direct URL:** [http://localhost:3000/response-proposals](http://localhost:3000/response-proposals)
- **Screen:** Autonomous SOAR & Response Proposal Cockpit
- **Objective:** Test WASM sandbox dry-run, blast-radius verification, and Cloud HSM signing.
- **Verification Actions:**
  1. Select proposal `Block Compromised Ingress CIDR & Revoke Active OAuth Tokens`.
  2. Click **`Execute Sandbox Dry-Run`**.
  3. Verify simulated impact: `0 Production Workloads Impacted`, `1 Suspicious Session Terminated`.
  4. Click **`Approve & Dispatch Playbook`**.
- **Underlying API:** `POST /api/v1/response-proposals/simulate` and `POST /api/v1/response-proposals/execute`
- **Pass Criteria:** Sandbox simulation receipt verified; execution log anchored to ledger.

---

### Step 11: Emergency Kill-Switch & Governance Overrides
- **Direct URL:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Screen:** Super-Admin Multi-Tenant Operations & Emergency Controls
- **Objective:** Verify tenant isolation circuit breakers, commercial capability toggles, and global freeze.
- **Verification Actions:**
  1. Inspect the **Emergency Platform Circuit Breakers** panel.
  2. Toggle **`Autonomous SOAR Execution Freeze`** to `ENGAGED`.
  3. Toggle **`External Webhook Outbound Ingress Freeze`** to `ENGAGED`.
  4. Verify system displays prominent yellow/red lockout badges.
- **Underlying API:** `POST /api/v1/admin/circuit-breaker`
- **Pass Criteria:** Circuit breakers enforce fail-closed state across all tenant workers.

---

### Step 12: Merkle Evidence Ledger & Proof Verification
- **Direct URL:** [http://localhost:3000/ledger](http://localhost:3000/ledger)
- **Screen:** RFC 3161 Merkle Tree Evidence Ledger & Verifier
- **Objective:** Test cryptographic chain-of-custody, leaf proof verification, and post-quantum dual-witness signatures.
- **Verification Actions:**
  1. View the live Merkle Epoch Ledger table (Epoch IDs, Merkle Root Hashes, Timestamps).
  2. Click **`Verify Cryptographic Proof`** on any evidence record.
  3. Verify the computed inclusion path matches the published Merkle Root.
- **Underlying API:** `GET /api/v1/ledger/epochs` and `POST /api/v1/ledger/verify`
- **Pass Criteria:** Modal displays emerald check: `PROOF CRYPTOGRAPHICALLY VALID` with zero discrepancies.

---

### Step 13: Continuous Compliance & Freshness Decay
- **Direct URL:** [http://localhost:3000/controls](http://localhost:3000/controls)
- **Screen:** Continuous Assurance & Automated Control Evaluation Cockpit
- **Objective:** Verify automated SOC 2 Type II, ISO 27001, and DORA control testing with evidence freshness decay.
- **Verification Actions:**
  1. Review controls table across categories (Access Control, Key Management, Audit Logging, Telemetry Retention).
  2. Inspect the **Evidence Freshness Decay Meter** (controls degrade if new evidence is not gathered within 24h).
  3. Click **`Run On-Demand Control Evaluation`** on control `AC-01`.
- **Underlying API:** `GET /api/v1/controls` and `POST /api/v1/controls/evaluate`
- **Pass Criteria:** Control status updates with new timestamp and freshness score reset to `100% FRESH`.

---

### Step 14: Commercial Pricing & Anti-Perverse Guarantee
- **Direct URL:** [http://localhost:3000/pricing](http://localhost:3000/pricing)
- **Screen:** Enterprise Commercial Tiers & Anti-Perverse Pricing Guarantee
- **Objective:** Verify Rule PR-02 anti-perverse pricing guarantee and plan tier capabilities.
- **Verification Actions:**
  1. Switch between billing intervals (Monthly / Annual).
  2. Compare the 4 tiers: `Starter`, `Professional`, `Enterprise`, and `Enterprise Plus Sovereign`.
  3. Review the **Rule PR-02 Statutory Guarantee** badge:  
     *"ZoikoShield never charges per incident, per alert, or per surge. Defending against a DDoS or ransomware storm will never result in an unexpected invoice."*
- **Underlying API:** `GET /api/v1/commercial/plans`
- **Pass Criteria:** Tiers render clear entitlements without missing pricing models.

---

### Step 15: Notification Center & Dead-Letter Resolution
- **Direct URL:** [http://localhost:3000/notifications](http://localhost:3000/notifications)
- **Screen:** Notification Operations Center & Outbound Dispatch Ledger
- **Objective:** Verify multi-channel notification dispatch (Email, PagerDuty, Webhook, SMS) and dead-letter retry queue.
- **Verification Actions:**
  1. Inspect the **Outbound Dispatch Ledger** (Delivered, Pending, Failed).
  2. In the **Dead-Letter Queue (DLQ)** section, locate a transiently failed webhook alert.
  3. Click **`Retry Dispatch with Backoff`**.
- **Underlying API:** `GET /api/v1/notifications/ledger` and `POST /api/v1/notifications/dlq/retry`
- **Pass Criteria:** Dispatch status changes from `FAILED` to `DELIVERED_RETRY_OK`.

---

### Step 16: Template Studio & Enterprise Communication
- **Direct URL:** [http://localhost:3000/admin/email-templates](http://localhost:3000/admin/email-templates)
- **Screen:** Production Email Template Studio & Fail-Closed Gate
- **Objective:** Test preview rendering of production email notification templates and fail-closed security gating.
- **Verification Actions:**
  1. Filter templates by category (Authentication, Incident Alerts, Governance, Billing).
  2. Select template `TPL-INC-SEV1-CONTAINMENT-NOTIFICATION`.
  3. Review the rendered HTML/CSS preview with brand tokens and security disclaimers.
  4. Click **`Send Test Preview Dispatch`** to test rendering pipeline.
- **Underlying API:** `GET /api/v1/templates` and `POST /api/v1/templates/test-dispatch`
- **Pass Criteria:** Template renders high-fidelity responsive HTML layout with zero broken tokens.

---

## 6. UI & Navigation Verification (Static Sidebar & Logout)

### 📌 Left Navigation Static Pinning
- **Behavior Requirement:** The left navigation sidebar must remain stationary and anchored (`h-screen overflow-hidden`) at all times.
- **Test:** Scroll down the right-hand content area on long pages (such as `/admin/email-templates`, `/controls`, or `/alerts`).
- **Pass Criteria:** Only the right content viewport scrolls. The sidebar, logo, category groups, and logout footer remain perfectly visible and fixed in place.

### 🚪 Logout / Sign Out Options
Testers have two prominent methods to log out and clear all sessions:
1. **Top Header Button**: Direct red **`Logout`** button in the top right corner next to the profile avatar.
2. **Sidebar Footer Card**: Full-width **`Sign Out / Logout`** card located directly above the platform version tag at the bottom of the left sidebar.
3. **Pass Criteria:** Clicking either button immediately clears cookies (`zoiko_auth`, `zoiko_shield_access_token`, `zoiko_shield_tenant_id`) and redirects the browser back to `/login`.

---

## 7. Automated Test Suite & Swagger CI Linters

For automated testing in CI/CD pipelines, execute the following commands:

### 🧪 Frontend Test Suite (Vitest)
```bash
cd frontend
npm test
```
- **Result:** **12 test files passed (12), 107 tests passed (107)**.

### 🔍 Frontend TypeScript Typecheck
```bash
cd frontend
npx tsc --noEmit
```
- **Result:** **0 errors (Code 0)**.

### 📖 Swagger / OpenAPI 3.0 Verification
```bash
cd backend
npm run swagger:check
npm run swagger:metrics
```
- **Result:** **100% Swagger Coverage across 828 operations and 730 paths.**

### 🛡️ Terminology & Security Governance Linters
```bash
cd backend
npm run check:ungrounded-terms
npm run check:capability-claims
npm run access:check
npm run check:evidence-index
```
- **Result:** **All 4 compliance linters pass with Code 0.**

---

## 🏁 Summary Checklist for QA Sign-Off

- [x] **Login Screen First:** Unauthenticated requests redirect to `/login`.
- [x] **Registration Flow:** `/register` creates new organizations with custom regions.
- [x] **1-Click Demo Logins:** All 4 role cards log in immediately without credentials typing.
- [x] **Test Data Injection:** UI `⚡ Inject Test Data` button and API trigger real security storm.
- [x] **All 16 Demo Steps:** Verified at HTTP 200 with corresponding API integrations.
- [x] **Static Navigation Rail:** Left sidebar remains pinned; only right content scrolls.
- [x] **Prominent Logout:** Visible in both TopHeader and Sidebar footer.
- [x] **Swagger & CI Linters:** 100% passing across OpenAPI spec and security contracts.
