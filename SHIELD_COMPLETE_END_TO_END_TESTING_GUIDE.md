# SHIELD COMPLETE END-TO-END TESTING GUIDE

**Platform:** ZoikoShield Enterprise Cyber Defense, AI Security Copilot & Cryptographic Assurance Platform  
**Document Version:** 1.0 (Complete End-to-End Implementation & QA Validation Handoff)  
**Target Audience:** QA Automation Engineers, Manual Security Testers, UAT Sign-Off Stakeholders, and Platform SREs  
**Core Invariant Verified:** *No AI decision, threat detection, compliance assertion, or containment action is represented as valid without tenant-scoped, attributable, cryptographically anchored evidence.*

---

# 1. Project Overview

ZoikoShield is a multi-tenant, sovereign-grade Security Operations (SecOps), AI Security Governance, Autonomous SOAR (R0–R4), and Cryptographic Evidence Assurance platform. It unifies real-time OCSF v1.1 telemetry ingestion, windowed/composite detection rules, incident and case management, governed AI Copilot investigations, 4-eyes policy & JIT privilege elevation, and RFC 6962 / RFC 3161 + ML-DSA-65 post-quantum Merkle ledger anchoring.

The platform provides three strictly separated role-based workspace experiences:
1. **Customer Workspace (`/customer/dashboard`)** — Executive View (CISO), SOC View (Security Analyst), and Account View (Data Retention, Legal Hold & Entitlements).
2. **Tenant Administrator Portal (`/admin/tenant`, `/tenant-management`)** — Data Residency & Subsystem Isolation Boundaries (G02), Connector Certification & Vault Lifecycle (G09), 7-Class Data Retention & Legal Hold (G08), and Tenant RBAC / Team Management.
3. **Platform Super-Admin Console (`/admin`, `/admin/platform-health`, `/admin/g1-gate`, `/admin/jit-elevation`)** — Multi-tenant emergency circuit breakers, non-destructive DR restore drills (G05), 8-member G1 Launch Gate ratification, and 2-party / 4-eyes JIT elevation quorum.

---

# 2. System Architecture Overview

ZoikoShield is architected as a modular monorepo with a Next.js App Router frontend and six specialized NestJS / TypeScript backend microservices backed by PostgreSQL 16 (with Row-Level Security), ClickHouse, Kafka, Redis, OpenSearch, and S3 Object Lock.

## Frontend Architecture (`frontend/`)
- **Framework:** Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS.
- **Layout & Route Isolation (`src/components/layout/AppShell.tsx`, `src/middleware.ts`):**
  - Enforces cookie-based authentication (`zoiko_auth`, `zoiko_shield_access_token`, `shield_access_token`).
  - Separates the Customer Shell (`CustomerSidebar.tsx` + `CustomerTopHeader.tsx`) from the Operator/Admin Shell (`Sidebar.tsx` + `TopHeader.tsx`).
  - Enforces client-side and middleware role guards preventing `SECURITY_ANALYST` and `AUDITOR` users from accessing `/admin/*` or `/tenant-management`.
- **Resilient Multi-Service Proxy (`src/app/api/v1/[...slug]/route.ts`):**
  - Routes `/api/v1/*` calls to the appropriate backend microservice (`:3001`–`:3005`) and provides deterministic provenance tracking (`DataProvenanceBadge`).
- **Browser Offline Cryptographic Verifier (`src/lib/forensic-verifier.ts`):**
  - Implements RFC 6962 §2.1 domain-separated SHA-256 Merkle tree hashing (`0x00` leaf prefix, `0x01` internal node prefix, power-of-two split) via WebCrypto (`crypto.subtle.digest`) plus `ZS-MERKLE-V1` backward compatibility.

## Backend Architecture (`backend/`)
- **`shield-core` (Port `:3001`):** Central Identity & Access Management (WebAuthn Passkeys, OIDC/SAML SSO), Cedar Policy Authorization Engine, Spec §13 JIT Break-Glass Elevation, Multi-Tenant Onboarding, Cases & Alerts API, Continuous Compliance Controls, Commercial Entitlements, and Notification / SMTP Email Dispatch Engine.
- **`shield-ingest` (Port `:3002`):** High-throughput OCSF v1.1 Telemetry Ingestion Gateway, HMAC-SHA256 Webhook Verification, Replay Nonce Cache, Per-Tenant Token-Bucket Rate Limiter, and Tier-A Windowed Detection Evaluator.
- **`shield-ai` (Port `:3003`):** Governed AI Security Copilot, Prompt-Injection Sanitizer (Model Armor), Grounded Citation Verifier, and Cryptographic Decision-Rights Envelopes.
- **`shield-action` (Port `:3004`):** Governed SOAR Containment Engine (R0–R4 Authority Tiers), Pre-Flight Blast-Radius Simulator, Dual-Custody Approval Quorum, and Emergency Circuit Breakers.
- **`shield-anchor` (Port `:3005`):** Immutable Evidence Ledger, RFC 6962 Merkle Tree Builder, ML-DSA-65 / Ed25519 Dual-Signature Witnessing, and RFC 3161 TSA Timestamping.
- **`verifier-cli` (Standalone Binary):** Zero-dependency air-gapped CLI verifier for sealed `.tar.gz` / JSON compliance audit packages.

---

# 3. User Roles and Permissions Matrix

| Role Identifier | Display Title | Primary Landing Route | Customer Workspace (`/customer/dashboard`) | Tenant Admin (`/admin/tenant`, `/tenant-management`, `/team`) | Super Admin (`/admin`, `/admin/platform-health`, `/admin/g1-gate`, `/admin/jit*`) | External Auditor (`/auditor`, `/verify-certificate`) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `SECURITY_ANALYST` | SOC Security Analyst | `/customer/dashboard` | Full Read/Write (Alerts, Cases, Triage, Copilot) | Denied (Redirected to `/customer/dashboard`) | Denied (Redirected to `/customer/dashboard`) | Read-Only Verifier |
| `TENANT_OWNER` | Tenant Administrator / CISO | `/customer/dashboard` or `/admin/tenant` | Full Read/Write (Executive, SOC, Account Views) | Full Read/Write (Residency, Connectors, Retention, Team) | Denied (Redirected to `/admin/tenant`) | Full Read/Export |
| `SUPER_ADMIN` | Platform Super-Admin | `/admin` | Authorized (via Workspace Switcher) | Authorized | Full Read/Write (Circuit Breakers, DR Drills, G1 Gate, JIT Quorum) | Full Read/Export |
| `AUDITOR` | External Compliance Auditor | `/auditor` | Scoped Read-Only | Denied (Redirected to `/customer/dashboard`) | Denied (Redirected to `/customer/dashboard`) | Full Read & Cryptographic Verification |

---

# 4. Complete Application Navigation Map

## 4.1 Public & Unauthenticated Routes
- `/login` — Work email & password authentication, WebAuthn Passkey sign-in, Microsoft/Google/Apple/Company SSO workspace discovery, and Forgot Password (`?view=reset`).
- `/register` — Self-service Organization Registration (with canonical Data Residency Region & bound Policy Pack) and Invitation Token Join tab.
- `/accept-invite` — Tenant Owner / Team Member invitation token activation gateway.
- `/verify-certificate` — Offline WebCrypto Audit Certificate & W3C Verifiable Credential verifier.
- `/trust` — Public Assurance & G01 Claim Registry Trust Center.
- `/help` — Platform Documentation & Operator Reference Guide.

## 4.2 Customer Workspace Navigation (`CustomerSidebar.tsx`)
1. **Command Center** (`/customer/dashboard`) — Executive View, SOC View, Account View.
2. **Security Overview** (`/risk/executive`) — Board-level cyber risk quantification & posture trends.
3. **Threats & Incidents** (`/alerts`) — Real-time security alerts queue, detail drawer, and case promotion.
4. **Exposure Management** (`/risk`) — Attack surface exposures, risk register, and compensating controls.
5. **Assets & Inventory** (`/assets`) — Monitored endpoints, cloud workloads, and identity directory.
6. **Vulnerabilities** (`/assessments`) — Continuous vulnerability & posture assessments.
7. **Detection & Response** (`/cases`) — Incident Case Workspace, timeline, evidence, notes, and SOAR response.
8. **Identity & Access** (`/team`) — Tenant member roster, RBAC role assignment, and pending invitations.
9. **Data Security** (`/evidence-operations`) — Cryptographic evidence vault, archival tiers, and legal holds.
10. **Cloud Security** (`/ingestion`) — OCSF v1.1 live telemetry pipeline and regional ingestion metrics.
11. **Compliance & Risk** (`/compliance`) — Regulatory framework posture (SOC 2, ISO 27001, DORA, NIS2, EU AI Act).
12. **Reports & Analytics** (`/audit`) — Sealed audit package generation and offline verification dossiers.
13. **Footer Links:** **Integrations** (`/connectors`) and **Settings** (`/settings`).

## 4.3 Operator, Tenant Admin & Super-Admin Navigation (`Sidebar.tsx`)
- **Overview:** `/customer/dashboard`, `/`, `/risk/executive`, `/copilot`, `/notifications`
- **Detect & Investigate:** `/alerts`, `/detections`, `/findings`, `/cases`, `/hunting`, `/operations/shift-handover`
- **Respond:** `/cases/incidents/command`, `/response-proposals`, `/playbooks`, `/actions`, `/red-team`, `/ir-retainer`
- **Assets & Data:** `/assets`, `/ingestion`, `/connectors`
- **Compliance & Governance:** `/compliance`, `/controls`, `/policies`, `/risk`, `/exceptions`, `/ai-governance`, `/sector-packs`
- **Evidence & Audit:** `/ledger`, `/evidence-operations`, `/audit`, `/auditor`, `/trust`
- **Tenant Administration (`TENANT_OWNER`, `SUPER_ADMIN`):** `/admin/tenant`, `/tenant-management`, `/team`, `/onboarding`, `/partner/fleet`, `/developer`, `/admin/export`
- **Super Admin (`SUPER_ADMIN` only):** `/admin`, `/admin/platform-health`, `/admin/jit-elevation`, `/admin/jit`, `/admin/email-templates`, `/admin/g1-gate`, `/admin/gtm-checklist`

---

# 5. End-to-End Shield Workflow

1. **Tenant Onboarding & Residency Binding (`/register` or `/onboarding`):**
   - Organization selects a canonical data residency region (`eu-west-1` Ireland, `eu-central-1` Frankfurt, `eu-west-2` London, `us-east-1` N. Virginia, `ap-south-1` Mumbai).
   - Platform automatically binds the regional compliance policy pack (e.g., `eu_gdpr_dora_nis2_ie` or `in_dpdp_certin_rbi_aps1`) and provisions tenant-isolated encryption keys and RLS boundaries.
2. **Connector Activation & Telemetry Ingestion (`/connectors` → `/ingestion`):**
   - Tenant Admin configures and tests a P0 Certified or P1 Preview connector (`POST /api/v1/connectors`, `POST /api/v1/connectors/:id/test`).
   - Telemetry events arrive at `shield-ingest`, are normalized to OCSF v1.1 (`POST /api/v1/ingestion`), and are evaluated against G07 Detection Rules.
3. **Alert Generation & Triage (`/alerts` & `/customer/dashboard`):**
   - Matching rules emit prioritized alerts (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) visible in `/alerts` and on the Customer Dashboard (`Recent Critical Alerts`).
   - Analyst cycles alert triage status (`NEW` → `TRIAGED` → `IN_PROGRESS` → `RESOLVED` via `PATCH /api/v1/alerts/:id/status`) or promotes the alert into a formal Incident Case (`POST /api/v1/alerts/:id/create-case`).
4. **Case Investigation & AI Copilot Analysis (`/cases`, `/cases/[caseId]`, `/copilot`):**
   - Analyst assigns the case, transitions lifecycle states (`OPEN` → `INVESTIGATING` → `CONTAINED` → `RESOLVED` → `CLOSED`, or `Reopen Case`), adds timestamped investigation notes (`POST /api/v1/cases/:id/comments`), and requests a grounded AI Copilot summary with cited evidence IDs.
5. **Governed SOAR Containment (`/response-proposals`, `/actions`):**
   - Analyst simulates blast radius and submits an R2/R3 containment action proposal.
   - Second authorized operator approves the dual-custody action before execution.
6. **Notification & Email Dispatch (`/notifications`, `/admin/email-templates`):**
   - Critical events trigger transactional emails (`ZS-EML-SEC-001`, `ZS-EML-IAM-001`) and in-app notifications.
   - Operators verify delivery status (`DELIVERED`, `ACKNOWLEDGED`, `FAILED`), acknowledge alerts, or mark all notifications as read.
7. **Cryptographic Ledger Sealing & Offline Audit Verification (`/ledger`, `/audit`, `/verify-certificate`):**
   - All case transitions, approvals, and evidence leaves are sealed into RFC 6962 Merkle epochs and verified offline in `/verify-certificate`.

---

# 6. Authentication and Session Testing

## 6.1 Key Capabilities Verified
- **Clean Login Form (`/login`):** No prefilled demo credentials or quick-launch bypass cards exist on the login screen.
- **Input Validation:** Submitting an empty or malformed email or empty password blocks submission and renders a clear validation alert.
- **Role-Based Redirection:**
  - `SUPER_ADMIN` redirects to `/admin`.
  - `AUDITOR` redirects to `/auditor`.
  - `admin@...` (`TENANT_OWNER`) redirects to `/admin/tenant`.
  - Customer/CISO/Analyst accounts redirect to `/customer/dashboard`.
- **Forgot Password Flow (`/login?view=reset`):** Dispatches reset challenge (`POST /api/v1/auth/forgot-password`) and displays confirmation banner.
- **Session Termination (`/login?logout=true`):** Clears `zoiko_auth`, `zoiko_shield_access_token`, `shield_access_token`, `zoiko_shield_tenant_id`, and `zoiko_shield_user_email` cookies and redirects unauthenticated deep-link access back to `/login?redirect=...`.

---

# 7. Dashboard Testing

## 7.1 Customer Dashboard (`/customer/dashboard`)
- **3 Workspace Mode Tabs:**
  - **Executive View:** Displays 4 primary KPI cards (`Security Posture`, `Critical Exposures`, `Protection Coverage`, `Active Incidents`), interactive KPI drilldown panel (`Remediate Coverage (+12 Assets)`), `Priority Actions` (with duplicate title prevention), `Threat Activity Overview` (`Last 24 hours` / `Last 7 days` / `Last 30 days`), `Top Threat Categories`, `Detection Coverage`, `Recent Critical Alerts` (with severity filter, search, and live `PATCH /api/v1/alerts/:id/status` cycling), and `Assurance & Compliance`.
  - **SOC View:** Displays active G07 launch-candidate detection rules (`ZS-DET-ID-001` through `ZS-DET-NET-006`), false-positive budgets, and live alert triage controls.
  - **Account View:** Displays the G08 7-Class Data Retention & Legal Hold schedule dynamically resolved from the active region's canonical policy pack (`eu_gdpr_dora_nis2_ie`, `in_dpdp_certin_rbi_aps1`, etc.).
- **Live Backend Sync & Provenance:** Connects to `/api/v1/alerts?limit=10` and `/api/v1/cases?limit=10`, displays `DataProvenanceBadge`, and provides a `Refresh` button.

## 7.2 Command Center Dashboard (`/`)
- Displays SecOps & Cryptographic Command Center KPIs (`UNRESOLVED ALERTS`, `OPEN INCIDENT CASES`, `MERKLE EPOCH HEAD`, `ACTIVE CONNECTORS`), live telemetry feed, and quick navigation.

## 7.3 Tenant Administrator Dashboard (`/admin/tenant`)
- Displays `Tenant Administration & Governance Control Plane`, `7 / 7 Boundaries Enforced` across PostgreSQL RLS, Kafka Topic ACLs, ClickHouse Row Policies, OpenSearch Index Aliases, Redis Key Prefixes, S3 Object Lock Prefixes, and KMS Envelope Keys, plus Connector Vault and 7-Class Retention controls.

## 7.4 Platform Super-Admin Dashboard (`/admin`)
- Displays `Multi-Tenant Administration & Platform Controls`, emergency break-glass circuit breakers (`AI INFERENCE CIRCUIT BREAKER`, `INGESTION PIPELINE THROTTLER`, `SOAR PLAYBOOK AUTONOMOUS FREEZE`), Commercial Offer Entitlement Matrix, and Real-Time Resource Quotas.

---

# 8. Customer View Testing

## 8.1 Verification Checklist
1. Log in as a Customer user (`TENANT_OWNER` or `SECURITY_ANALYST`) and navigate to `/customer/dashboard`.
2. Verify that `CustomerSidebar` displays the 12 customer-authorized navigation items (`Command Center`, `Security Overview`, `Threats & Incidents`, `Exposure Management`, `Assets & Inventory`, `Vulnerabilities`, `Detection & Response`, `Identity & Access`, `Data Security`, `Cloud Security`, `Compliance & Risk`, `Reports & Analytics`) plus `Integrations` and `Settings`.
3. Verify that `CustomerTopHeader` displays:
   - **Customer Workspace** selector (showing `Super Admin Dashboard` option ONLY if role is `SUPER_ADMIN`, and `Tenant Administrator Dashboard` ONLY if role is `TENANT_OWNER` or `SUPER_ADMIN`).
   - **Data Residency Region** selector (`EU (Ireland)`, `EU (Frankfurt)`, `UK (London)`, `US East (N. Virginia)`, `India (Mumbai)`), updating the bound policy pack and retention schedule immediately when changed.
   - **Global Search** input filtering `Recent Critical Alerts` and `Priority Actions` in real time.
   - **Notifications Bell** with unread badge count, `Mark all as read` button, and `Open Notification Ledger →` link.
4. Verify that a `SECURITY_ANALYST` attempting to navigate directly to `/admin` or `/admin/tenant` is automatically redirected to `/customer/dashboard`.

---

# 9. Administrator View Testing

## 9.1 Tenant Administrator (`/admin/tenant`, `/tenant-management`, `/team`)
1. Log in as `TENANT_OWNER` (`admin@acmeglobal.com`) and navigate to `/admin/tenant`.
2. Verify all 4 tabs (`Residency & Isolation (G02)`, `Connector Vault & mTLS (G09)`, `Retention & Legal Hold (G08)`, `RBAC & Approval Matrix (G04)`) render and switch cleanly.
3. Navigate to `/tenant-management` and `/team` to verify member roster, role assignment, and invitation creation (`POST /api/v1/invitations`).

## 9.2 Platform Super-Admin (`/admin`, `/admin/platform-health`, `/admin/g1-gate`, `/admin/jit-elevation`)
1. Log in as `SUPER_ADMIN` (`superadmin@zoikoshield.com`) and navigate to `/admin`.
2. Switch to the Live Console tab and click **Freeze Containment** on the SOAR Playbook Autonomous Freeze card. Verify the break-glass confirmation modal opens and executing it transitions the state to `FROZEN`.
3. Navigate to `/admin/platform-health`, switch to the Live Console tab, and click **Execute Restore Drill**. Verify a non-destructive scratch-schema restore drill executes (`POST /api/v1/observability/disaster-recovery/restore-drill`) and displays `RESTORE DRILL VERIFIED` with Merkle head alignment.
4. Navigate to `/admin/g1-gate`, switch to the Live Console tab, and click **Ratify Signature** for any of the 8 mandatory domain approvers (CEO, CTO, CISO, DPO, VP Engineering, AI Risk Lead, QA Lead, SRE Lead).
5. Navigate to `/admin/jit-elevation` and `/admin/jit` to verify 4-eyes / dual-custody JIT elevation request submission and WebAuthn passkey hardware step-up verification.

---

# 10. Module-by-Module Functional Testing

| Module | Route | Key Functional Operations Verified | Backing API Endpoints |
| :--- | :--- | :--- | :--- |
| **Customer Command Center** | `/customer/dashboard` | Executive/SOC/Account tabs, KPI drilldown, time window selector, Priority Action creation & duplicate check, live alert status cycling | `GET /api/v1/alerts`, `GET /api/v1/cases`, `PATCH /api/v1/alerts/:id/status` |
| **Detection & Alerts** | `/alerts` | Severity filtering, search, alert detail inspection (`Why It Fired`, OCSF factors), alert-to-case promotion | `GET /api/v1/alerts`, `GET /api/v1/alerts/:id/detail`, `POST /api/v1/alerts/:id/create-case` |
| **Detection Content** | `/detections` | G07 rule catalog inspection, Sigma/OCSF query logic, false-positive budget tracking | `GET /api/v1/detections` |
| **Cases & Triage** | `/cases`, `/cases/[caseId]` | Create New Case (`+ New Case`), filter (`All`, `Mine`, `Critical`), status transitions (`OPEN` → `CLOSED` + `Reopen Case`), analyst reassignment, investigation notes (`Save Note`) | `GET /api/v1/cases`, `POST /api/v1/cases`, `PATCH /api/v1/cases/:id`, `POST /api/v1/cases/:id/comments` |
| **Major Incident War Room** | `/cases/incidents/command` | Incident commander assignment, SLA response clocks, containment decision ledger | `GET /api/v1/cases` |
| **AI Security Copilot** | `/copilot` | Grounded investigation queries, Model Armor prompt-injection sanitization, cited evidence envelope verification | `POST /api/v1/ai/copilot/investigate` |
| **AI Governance** | `/ai-governance` | Grounding Gate Studio, AI Review Envelopes, drift monitoring, domain safety presets | `GET /api/v1/ai/governance` |
| **Response Proposals & SOAR** | `/response-proposals`, `/actions` | Pre-flight blast-radius simulation, R0–R4 authority tier validation, dual-custody approval/rejection | `GET /api/v1/actions`, `POST /api/v1/actions/:id/approve` |
| **Connectors & Ingestion** | `/connectors`, `/ingestion` | P0 GA / P1 Preview / Experimental catalog, connector provisioning, TLS 1.3 handshake test, enable/disable toggle, live OCSF event stream | `GET /api/v1/connectors`, `POST /api/v1/connectors`, `POST /api/v1/connectors/:id/test`, `POST /api/v1/connectors/:id/activate`, `POST /api/v1/connectors/:id/disable` |
| **Compliance & Controls** | `/compliance`, `/controls`, `/policies` | Continuous control matrix, 4-eyes Cedar policy staging & canary promotion, exception workflow | `GET /api/v1/controls`, `GET /api/v1/policies` |
| **Evidence Ledger & Verifier** | `/ledger`, `/audit`, `/verify-certificate` | Merkle inclusion proof verification via `shield-anchor`, sealed audit package export, browser WebCrypto RFC 6962 & W3C VC verification | `GET /api/v1/anchor/receipts/:epoch`, `POST /api/v1/anchor/verify-proof`, `GET /api/v1/auditor/workspace` |
| **Notifications & Email Studio** | `/notifications`, `/admin/email-templates` | 226 email template catalog, live HTML/plaintext preview, test email dispatch, per-item `Acknowledge`, `Mark All Read` | `GET /api/v1/notifications`, `POST /api/v1/notifications/templates/:id/send-test`, `POST /api/v1/notifications/:id/acknowledge`, `POST /api/v1/notifications/mark-all-read` |

---

# 11. Case and Incident Management Testing

1. Navigate to `/cases`.
2. **Create a Case:** Click **+ New Case** in the top-right header. Attempt to submit with an empty title first — verify the validation banner (`Validation error: Case title is required.`) prevents creation. Enter title `"Suspicious OAuth Token Grant on Production Tenant"`, select `CRITICAL (P1)`, select `Sarah Chen`, enter a description, and click **Create & Anchor Case**.
3. Verify the newly created case appears at the top of the **Case queue**, increments the **OPEN CASES** and **CRITICAL CASES** KPI counters, and is selected in the center detail pane.
4. **Reassign Analyst:** In the center metadata grid under **Assigned analyst**, use the dropdown to reassign the case from `Sarah Chen` to `Alex Kumar`. Verify the confirmation banner (`Case ... assigned to Alex Kumar`) appears and the timeline records the assignment event.
5. **Lifecycle Status Transitions:** In the **Persisted Case Lifecycle** bar, click through `OPEN` → `INVESTIGATING` → `CONTAINED` → `RESOLVED` → `CLOSED`. Verify each status change persists via `PATCH /api/v1/cases/:id`, updates the status badge, and updates the **OPEN CASES** KPI counter (decrementing when `CLOSED`).
6. **Reopen Closed Case:** While the case is `CLOSED`, click the **Reopen Case** button that appears in the lifecycle bar. Verify the case transitions back to `INVESTIGATING` with an audit timeline entry (`Case Reopened (CLOSED → INVESTIGATING)`).
7. **Investigation Notes:** Click **Add investigation note** in the right-hand **Case actions** card (or click the **notes** tab). Type `"Confirmed anomalous token grant from ASN 14061; revoking refresh tokens."` and click **Save Note**. Verify the note is persisted via `POST /api/v1/cases/:id/comments`.

---

# 12. Integration and API Testing

1. Navigate to `/connectors` and switch to the Live Console tab (`Open Operational Console`).
2. **Certification Tiers:** Verify every connector displays an explicit G09 certification badge (`P0 GA`, `P1 PREVIEW`, or `EXPERIMENTAL`) and that experimental connectors cannot be silently enabled as production GA feeds.
3. **Connection Handshake Test:** Click **Test Connection** on an active connector (`POST /api/v1/connectors/:id/test`). Verify latency, TLS 1.3 handshake (`TLS_1_3_ESTABLISHED`), and cipher suite (`TLS_AES_256_GCM_SHA384`) are returned and displayed.
4. **Enable / Disable Lifecycle:** Click **Disable** (`POST /api/v1/connectors/:id/disable`) and verify connector status updates to `DISABLED` / `DEGRADED`. Click **Activate** (`POST /api/v1/connectors/:id/activate`) and verify status returns to `ACTIVE` / `HEALTHY`.
5. **Failure Honesty:** Verify that when a backend endpoint returns an HTTP 4xx/5xx or network error, `ZoikoShieldApiClient` throws `ZoikoShieldApiError` and UI components render an explicit error alert or `UnavailableState` — never a fake success toast.

---

# 13. Email Workflow Testing

1. Navigate to `/admin/email-templates` (as `SUPER_ADMIN`).
2. Verify the **Production Email Template Studio** loads the 226 enterprise templates (e.g., `ZS-EML-TPL-001 v2.0`, `ZS-EML-IAM-001`, `ZS-EML-SEC-001`) with subject, category, and SHA-256 render hash.
3. Select a template, enter a recipient email address, and click **Send Test Dispatch** (`POST /api/v1/notifications/templates/:id/send-test`).
4. Verify:
   - The response includes `status: "DELIVERED"`, `deliveryId`, `renderHash`, and `deliveredAt`.
   - Navigating to `/notifications` shows the newly dispatched email at the top of the **Notifications & Acknowledgment Ledger** with channel `EMAIL (<recipient>)` and status `DELIVERED`.
   - If the backend rejects the dispatch, the delivery record is marked `FAILED` with error code `DISPATCH_REQUEST_REJECTED` (never fabricated as `DELIVERED`).

---

# 14. Notification Workflow Testing

1. **Header Notification Center (`TopHeader.tsx` & `CustomerTopHeader.tsx`):**
   - Click the Bell icon in the top header.
   - Verify active notifications and unread badge count are displayed.
   - In `CustomerTopHeader`, click **Mark all as read** — verify the red unread badge clears (`0`) and `POST /api/v1/notifications/mark-all-read` is invoked.
   - Click **Open Notification Ledger →** to navigate to `/notifications`.
2. **Full Notification Ledger (`/notifications`):**
   - Switch to the Live Console tab (`Open Operational Console`).
   - Click **Send Test Email** to open the Quick Dispatch modal, enter `qa.tester@acmeglobal.com`, select a template, and submit.
   - Verify the notification row appears with status `DELIVERED` and an **Acknowledge** button.
   - Click **Acknowledge** on an individual row (`POST /api/v1/notifications/:id/acknowledge`) and verify its badge transitions to `ACKNOWLEDGED`.
   - Click **Mark All Read** (`POST /api/v1/notifications/mark-all-read`) and verify all remaining rows transition to `ACKNOWLEDGED`.

---

# 15. Security and Access Control Testing

- **Authentication Gate (`middleware.ts` & `AppShell.tsx`):** All protected routes redirect unauthenticated requests to `/login?redirect=<path>`.
- **Role-Based Route Isolation (`AppShell.tsx` & `Sidebar.tsx`):**
  - `SECURITY_ANALYST` and `AUDITOR` users do not see the `Tenant Admin` switcher button in `Sidebar.tsx` and are redirected to `/customer/dashboard` if they navigate to `/admin/*` or `/tenant-management`.
  - `TENANT_OWNER` users can access `/admin/tenant` and `/tenant-management`, but are redirected to `/admin/tenant` if they attempt to access platform operator routes (`/admin`, `/admin/platform-health`, `/admin/g1-gate`, `/admin/jit*`).
- **Controller Access Contracts (`npm run access:check`):** 100% of `shield-core` controller operations declare explicit, non-contradictory auth & role contracts.
- **OpenAPI Security Coverage (`npm run swagger:check`):** 100% of customer and internal controller operations have explicit security contracts in `docs/swagger.yaml`.

---

# 16. Tenant Isolation Testing

- **Database Row-Level Security (G02):** Every tenant-scoped PostgreSQL table enforces `tenant_id = current_setting('app.current_tenant_id')` via `backend/prisma/access/access-policy.js`.
- **7-Subsystem Isolation Matrix (`/admin/tenant`):** Verifies isolation across PostgreSQL RLS, Kafka Topic ACLs, ClickHouse Row Policies, OpenSearch Index Aliases, Redis Key Prefixes, S3 Object Lock Prefixes, and KMS Envelope Keys.
- **Canonical Regional Policy Packs:** Selecting a tenant's Data Residency Region (`eu-west-1`, `eu-central-1`, `eu-west-2`, `us-east-1`, `ap-south-1`) deterministically binds the regional policy pack and statutory retention limits (`resolvePolicyPackForRegion`).

---

# 17. UI/UX Verification Checklist

- [x] **Clean Login Experience:** Removed prefilled demo role quick-launch cards from `/login`; clean work email, password with show/hide toggle, passkey button, and SSO workspace discovery.
- [x] **Removed Leftover Walkthrough Labels:** Removed all `(Step 1)` through `(Step 16 Finale)` labels from navigation buttons across `TopHeader.tsx` and all 16 workspace pages.
- [x] **Consistent Spacing & Typography:** Standardized card padding (`p-4` / `p-5`), header hierarchy (`h1` page title, `h2`/`h3` section titles), monospace telemetry badges, and responsive 12-column grids.
- [x] **Mandatory Operational UI States (G05/G11):** Verified `LoadingState`, `StaleState`, `UnavailableState` (with canonical `RTO Target: <= 60m` and `RPO Target: <= 15m`), and `DataProvenanceBadge` (`Live Data`, `Demo Sample`, `Cached Snapshot`).
- [x] **Grounded Terminology Compliance (`npm run check:ungrounded-terms`):** 0 ungrounded marketing or speculative hardware claims across all 1,773+ source files.

---

# 18. Detailed Test Cases Table

| Test Case ID | Module Name | Test Scenario | Preconditions | Steps | Expected Result | Actual Result | Status | Priority | Remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-SHIELD-001** | Authentication (`/login`) | Verify Login page renders cleanly without prefilled demo credentials or quick-launch bypass cards | User is logged out (`zoiko_auth` cookie cleared) | 1. Navigate to `/login`<br>2. Inspect email/password inputs and page footer | Email and password inputs are empty; no prefilled demo role cards (`Customer Dashboard`, `Admin Dashboard`, `Super Admin`) appear on `/login` | | Not Tested | P0 - Critical | Phase 2 §1 requirement |
| **TC-SHIELD-002** | Authentication (`/login`) | Validate client-side email and password validation on empty/invalid input | User is on `/login` | 1. Leave email blank or enter invalid email, click `Log in`<br>2. Enter valid email, leave password blank, click `Log in` | Form blocks API call and displays clear error alert (`Please enter a valid work email address.` / `Please enter your password.`) | | Not Tested | P0 - Critical | Negative validation test |
| **TC-SHIELD-003** | Authentication (`/login`) | Verify valid login and role-based redirection for Customer / Analyst user | User is on `/login` | 1. Enter `jane.doe@acmeglobal.com` and valid password<br>2. Click `Log in` | `POST /api/v1/auth/login` succeeds, session cookies are set, and browser redirects to `/customer/dashboard` | | Not Tested | P0 - Critical | Customer role redirect |
| **TC-SHIELD-004** | Authentication (`/login`) | Verify valid login and role-based redirection for Tenant Administrator | User is on `/login` | 1. Enter `admin@acmeglobal.com` and valid password<br>2. Click `Log in` | Authentication succeeds and browser redirects to `/admin/tenant` | | Not Tested | P0 - Critical | Tenant Admin redirect |
| **TC-SHIELD-005** | Authentication (`/login`) | Verify valid login and role-based redirection for Platform Super-Admin | User is on `/login` | 1. Sign in with `SUPER_ADMIN` account<br>2. Observe post-login route | Authentication succeeds and browser redirects to `/admin` | | Not Tested | P0 - Critical | Super-Admin redirect |
| **TC-SHIELD-006** | Authentication (`/login`) | Verify invalid credentials error handling | User is on `/login` | 1. Enter registered email with wrong password<br>2. Click `Log in` | API returns 401/error; error banner is displayed; user remains unauthenticated on `/login` | | Not Tested | P0 - Critical | Negative auth test |
| **TC-SHIELD-007** | Authentication (`/login?view=reset`) | Verify Forgot Password reset link dispatch | User is on `/login` | 1. Click `Forgot password?`<br>2. Enter `jane.doe@acmeglobal.com`<br>3. Click `Send reset link` | `POST /api/v1/auth/forgot-password` is called and success alert confirms reset link dispatch | | Not Tested | P1 - High | Password recovery |
| **TC-SHIELD-008** | Session & Middleware | Verify unauthenticated access to protected deep route redirects to `/login` | User is logged out | 1. Navigate directly to `/customer/dashboard` or `/cases` | Middleware intercepts request and redirects to `/login?redirect=%2Fcustomer%2Fdashboard` | | Not Tested | P0 - Critical | Route protection |
| **TC-SHIELD-009** | Session & Logout | Verify Logout clears all auth cookies and session state | User is logged in | 1. Click Sign Out in sidebar or top header | Cookies (`zoiko_auth`, `zoiko_shield_access_token`, `shield_access_token`) are cleared and user lands on `/login?logout=true` with sign-out banner | | Not Tested | P0 - Critical | Session termination |
| **TC-SHIELD-010** | Organization Registration (`/register`) | Verify self-service organization registration and residency policy pack binding | User is on `/register` | 1. Enter Org Name `Apex Cyber Defense`, Full Name, Email, Password (8+ chars)<br>2. Select region `ap-south-1` (India Mumbai)<br>3. Click `Create account` | Bound Policy Pack updates to `in_dpdp_certin_rbi_aps1`; submission provisions tenant and displays workspace receipt | | Not Tested | P1 - High | Onboarding & G02 residency |
| **TC-SHIELD-011** | Customer Dashboard (`/customer/dashboard`) | Verify Executive View KPI cards, Threat Activity Overview, and Assurance cards | Logged in as Customer (`TENANT_OWNER` or `SECURITY_ANALYST`) | 1. Navigate to `/customer/dashboard`<br>2. Inspect KPI cards and charts | `Security Posture`, `Critical Exposures`, `Protection Coverage`, `Active Incidents`, `Threat Activity Overview` (`247`/`18`/`5`), and `Assurance & Compliance` (`17 / 20 controls`) render accurately | | Not Tested | P0 - Critical | Executive View wireframe |
| **TC-SHIELD-012** | Customer Dashboard (`/customer/dashboard`) | Verify interactive KPI drilldown and coverage remediation | User is on `/customer/dashboard` | 1. Click `Security Posture` KPI card<br>2. Click `Remediate Coverage (+12 Assets)` in drilldown panel | Drilldown opens; clicking remediate increments Security Posture score (`78` → `79`) and monitored assets (`1,842` → `1,854`) | | Not Tested | P1 - High | Interactive KPI validation |
| **TC-SHIELD-013** | Customer Dashboard (`/customer/dashboard`) | Verify Threat Activity time window selector (`Last 24 hours` / `Last 7 days` / `Last 30 days`) | User is on `/customer/dashboard` | 1. Change `Threat Activity Time Window` dropdown to `Last 7 days` | Event count updates dynamically from `247` to `1684` (and `7140` for `Last 30 days`) | | Not Tested | P1 - High | Dynamic filter test |
| **TC-SHIELD-014** | Customer Dashboard (`/customer/dashboard`) | Verify Priority Action creation and duplicate title prevention | User is on `/customer/dashboard` | 1. Click `New Action`<br>2. Enter existing title `Review critical incident: Possible credential compromise`<br>3. Click `Add` | Duplicate submission is blocked and banner displays `Duplicate prevented: an identical priority action already exists.` | | Not Tested | P1 - High | Duplicate submission guard |
| **TC-SHIELD-015** | Customer Dashboard (`/customer/dashboard`) | Verify live Alert status cycling persists via `PATCH /api/v1/alerts/:id/status` | User is on `/customer/dashboard` | 1. Scroll to `Recent Critical Alerts`<br>2. Click status badge (`NEW`) on an alert row | Alert status cycles (`NEW` → `TRIAGED` → `IN_PROGRESS` → `RESOLVED`), calls `PATCH /api/v1/alerts/:id/status`, and updates KPI counters | | Not Tested | P0 - Critical | Live telemetry persistence |
| **TC-SHIELD-016** | Customer Dashboard (`/customer/dashboard`) | Verify switching between `Executive View`, `SOC View`, and `Account View` | User is on `/customer/dashboard` | 1. Click `SOC View` tab<br>2. Click `Account View` tab | `SOC View` renders G07 Scoped Detection Rules; `Account View` renders G08 7-Class Data Retention & Legal Hold Schedule | | Not Tested | P0 - Critical | Multi-persona customer tabs |
| **TC-SHIELD-017** | Customer vs Admin Isolation | Verify `SECURITY_ANALYST` cannot access `/admin` or `/admin/tenant` | Logged in as `SECURITY_ANALYST` | 1. Inspect `Sidebar` / `CustomerTopHeader`<br>2. Attempt to navigate to `/admin` or `/admin/tenant` | Admin portal links are hidden for `SECURITY_ANALYST`; direct URL navigation redirects back to `/customer/dashboard` | | Not Tested | P0 - Critical | Role isolation check |
| **TC-SHIELD-018** | Customer vs Admin Isolation | Verify `TENANT_OWNER` can access `/admin/tenant` but cannot access `/admin` (Super-Admin) | Logged in as `TENANT_OWNER` | 1. Navigate to `/admin/tenant` (allowed)<br>2. Navigate to `/admin` or `/admin/g1-gate` | `/admin/tenant` renders Tenant Admin Control Plane; navigating to `/admin` redirects `TENANT_OWNER` to `/admin/tenant` | | Not Tested | P0 - Critical | Privilege boundary check |
| **TC-SHIELD-019** | Tenant Admin (`/admin/tenant`) | Verify 7-Subsystem Tenant Residency & Isolation Boundary Evidence (G02) | Logged in as `TENANT_OWNER` or `SUPER_ADMIN` | 1. Navigate to `/admin/tenant`<br>2. Inspect Residency & Isolation tab | Displays `7 / 7 Boundaries Enforced` across PostgreSQL RLS, Kafka, ClickHouse, OpenSearch, Redis, S3, and KMS | | Not Tested | P1 - High | G02 tenant isolation |
| **TC-SHIELD-020** | Detection & Alerts (`/alerts`) | Verify Alerts stream filtering, detail drawer, and Alert-to-Case promotion | Logged in as Analyst or Admin | 1. Navigate to `/alerts`<br>2. Select an alert to inspect `Why It Fired` factors<br>3. Click Promote to Case | Alert detail shows rule match confidence & OCSF factors; promoting creates a linked case via `POST /api/v1/alerts/:id/create-case` | | Not Tested | P0 - Critical | Alert triage workflow |
| **TC-SHIELD-021** | Case Management (`/cases`) | Verify creating a new incident case and empty-title validation | User is on `/cases` | 1. Click `+ New Case`<br>2. Submit with empty title (verify error)<br>3. Enter title, select `CRITICAL (P1)`, click `Create & Anchor Case` | Empty title is rejected; valid submission calls `POST /api/v1/cases`, adds case to queue, and increments `OPEN CASES` & `CRITICAL CASES` KPIs | | Not Tested | P0 - Critical | Case creation & validation |
| **TC-SHIELD-022** | Case Management (`/cases`) | Verify case analyst assignment persists via `PATCH /api/v1/cases/:id` | User is on `/cases` with an active case selected | 1. Use `Reassign Case Analyst` dropdown under `Assigned analyst`<br>2. Select `Alex Kumar` | `PATCH /api/v1/cases/:id` persists new assignee, updates UI to `Alex Kumar`, and logs assignment in timeline | | Not Tested | P0 - Critical | Case assignment |
| **TC-SHIELD-023** | Case Management (`/cases`) | Verify case status transitions (`OPEN` → `INVESTIGATING` → `CONTAINED` → `RESOLVED` → `CLOSED`) and `Reopen Case` | User is on `/cases` | 1. Click status pills through `CLOSED`<br>2. Click `Reopen Case` button | Status changes persist via `PATCH /api/v1/cases/:id`; `OPEN CASES` count updates when closed; clicking `Reopen Case` transitions back to `INVESTIGATING` | | Not Tested | P0 - Critical | Full case lifecycle |
| **TC-SHIELD-024** | Case Management (`/cases`) | Verify adding an analyst investigation note persists via `POST /api/v1/cases/:id/comments` | User is on `/cases` | 1. Click `Add investigation note` (or `notes` tab)<br>2. Enter note text and click `Save Note` | Note is submitted via `POST /api/v1/cases/:id/comments`, confirmation banner appears, and timeline records the note | | Not Tested | P1 - High | Case comments & notes |
| **TC-SHIELD-025** | Case Detail (`/cases/[caseId]`) | Verify full Case Workspace tabs (`Overview & Timeline`, `Attack Path & Graph`, `Evidence Ledger`, `AI Investigation Copilot`, `SOAR Response Simulator`) | User is on `/cases/case-2026-auth-attack-01` | 1. Click through all 5 tabs<br>2. Inspect Evidence leaves and Merkle Epoch `#1043 (Sealed)` | All 5 tabs render without error; evidence hashes and AI summary hypotheses are displayed | | Not Tested | P1 - High | Deep case investigation |
| **TC-SHIELD-026** | Major Incident Command (`/cases/incidents/command`) | Verify W19 Incident Command War Room timeline and decision ledger | Logged in as Analyst or Admin | 1. Navigate to `/cases/incidents/command` | War room renders incident clocks, responder roster, and cryptographically anchored decision ledger | | Not Tested | P1 - High | W19 contract verification |
| **TC-SHIELD-027** | AI Security Copilot (`/copilot`) | Verify AI Copilot investigation prompt, Model Armor guard, and cited decision envelope | User is on `/copilot` | 1. Open Live Console tab<br>2. Submit an investigation prompt for active case | Response includes grounded evidence citations, confidence score, and explicit human-approval requirement (`requiresHumanApproval: true`) | | Not Tested | P1 - High | G10 AI safety & provenance |
| **TC-SHIELD-028** | Governed SOAR (`/actions`, `/response-proposals`) | Verify R0–R4 dual-custody containment action approval workflow | User is on `/actions` | 1. Open Live Console tab<br>2. Inspect pending R2/R3 containment action and simulation receipt | Displays blast-radius simulation receipt and enforces 2-party human approval before containment execution | | Not Tested | P0 - Critical | G04 SOAR safety |
| **TC-SHIELD-029** | Connectors (`/connectors`) | Verify connector catalog tiers (`P0 GA`, `P1 PREVIEW`, `EXPERIMENTAL`), connection test, and enable/disable | User is on `/connectors` | 1. Open Live Console tab<br>2. Click `Test Connection` on an active connector<br>3. Toggle `Disable` and `Activate` | Connection test verifies TLS 1.3 handshake (`18ms`); Disable/Activate updates connector status via backend API | | Not Tested | P0 - Critical | G09 connector lifecycle |
| **TC-SHIELD-030** | Email Studio (`/admin/email-templates`) | Verify 226 production email template catalog, preview, and test email dispatch | Logged in as `SUPER_ADMIN` on `/admin/email-templates` | 1. Select template `ZS-EML-TPL-001 v2.0`<br>2. Enter recipient email and click `Send Test Dispatch` | API dispatches email, returns `DELIVERED` status and SHA-256 render hash, and logs delivery in `/notifications` | | Not Tested | P0 - Critical | Phase 2 §7 email workflow |
| **TC-SHIELD-031** | Notifications (`/notifications`) | Verify notification delivery list, single-item `Acknowledge`, and `Mark All Read` | User is on `/notifications` | 1. Open Live Console tab<br>2. Click `Acknowledge` on an unread delivery<br>3. Click `Mark All Read` in header | Individual item flips to `ACKNOWLEDGED` via `POST /api/v1/notifications/:id/acknowledge`; `Mark All Read` updates all items via `POST /api/v1/notifications/mark-all-read` | | Not Tested | P0 - Critical | Phase 2 §8 notification workflow |
| **TC-SHIELD-032** | Evidence Ledger (`/ledger`) | Verify Merkle inclusion proof verification via `shield-anchor` (valid, invalid, and unreachable states) | User is on `/ledger` | 1. Open Live Console tab<br>2. Click `Verify Merkle Proof via shield-anchor` | Calls `/api/v1/anchor/verify-proof`; displays `Proof Cryptographically Valid` only when `valid: true`, and `Proof Invalid` when `valid: false` | | Not Tested | P0 - Critical | G06 Merkle proof integrity |
| **TC-SHIELD-033** | Certificate Verifier (`/verify-certificate`) | Verify browser WebCrypto RFC 6962 §2.1 & W3C Verifiable Credential offline verification | User is on `/verify-certificate` | 1. Click `Load Merkle Sample`<br>2. Click Verify Certificate<br>3. Tamper with `declaredMerkleRoot` and re-verify | Untampered sample verifies as `VERIFIED_COMPLIANT`; tampered root is immediately flagged as `TAMPER_DETECTED` | | Not Tested | P0 - Critical | G06 offline verification |
| **TC-SHIELD-034** | Super-Admin (`/admin`) | Verify Autonomous SOAR Emergency Freeze break-glass circuit breaker | Logged in as `SUPER_ADMIN` on `/admin` | 1. Open Live Console tab<br>2. Click `Freeze Containment`<br>3. Click `Confirm & Execute` in break-glass modal | Modal requires explicit confirmation; executing freezes autonomous SOAR playbooks and displays `Autonomous SOAR Containment Playbooks FROZEN` | | Not Tested | P1 - High | G04 emergency kill-switch |
| **TC-SHIELD-035** | Platform Health (`/admin/platform-health`) | Verify non-destructive Disaster Recovery Restore Drill execution | Logged in as `SUPER_ADMIN` on `/admin/platform-health` | 1. Open Live Console tab<br>2. Click `Execute Restore Drill` | Executes scratch-schema restore drill (`POST /api/v1/observability/disaster-recovery/restore-drill`) and displays `RESTORE DRILL VERIFIED` with 0 discrepancies | | Not Tested | P1 - High | G05 DR resilience |
| **TC-SHIELD-036** | G1 Launch Gate (`/admin/g1-gate`) | Verify 8-approver G1 Launch Gate cryptographic signature ratification | Logged in as `SUPER_ADMIN` on `/admin/g1-gate` | 1. Open Live Console tab<br>2. Click `Ratify Signature` on an approver card and submit | Opens ratification modal and records cryptographic sign-off for the stakeholder role | | Not Tested | P1 - High | G01/G12 launch governance |

---

# 19. API Endpoint Reference for Testers

| HTTP Method | Endpoint Path | Target Service | Purpose & Expected Response |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | `shield-core` | Authenticates email/password, sets session cookies, returns `{ token, role, tenantId, fullName }` |
| `POST` | `/api/v1/auth/logout` | `shield-core` | Terminates session and clears all authentication cookies |
| `POST` | `/api/v1/auth/register-org` | `shield-core` | Provisions new tenant organization with regional residency and bound policy pack |
| `POST` | `/api/v1/auth/forgot-password` | `shield-core` | Dispatches password reset link with RFC 3161 audit trail |
| `GET` | `/api/v1/alerts` | `shield-core` | Returns tenant-scoped security alerts (`NEW`, `TRIAGED`, `IN_PROGRESS`, `RESOLVED`) |
| `PATCH` | `/api/v1/alerts/:id/status` | `shield-core` | Persists alert triage status transition |
| `POST` | `/api/v1/alerts/:id/create-case` | `shield-core` | Promotes an alert into a formal incident case with initial timeline & evidence |
| `GET` | `/api/v1/cases` | `shield-core` | Returns tenant-scoped incident cases with timeline and evidence records |
| `POST` | `/api/v1/cases` | `shield-core` | Creates and anchors a new incident case (`OPEN`) |
| `PATCH` | `/api/v1/cases/:id` | `shield-core` | Updates case `status`, `assignee`, `severity`, or `resolutionSummary` (including reopening) |
| `POST` | `/api/v1/cases/:id/comments` | `shield-core` | Appends a timestamped analyst investigation note to the case timeline |
| `GET` | `/api/v1/connectors` | `shield-core` | Lists tenant connectors with G09 certification tiers (`P0_CERTIFIED`, `P1_PREVIEW`, `EXPERIMENTAL_UNCERTIFIED`) |
| `POST` | `/api/v1/connectors/:id/test` | `shield-core` | Verifies TLS 1.3 handshake and connector reachability |
| `POST` | `/api/v1/connectors/:id/activate` | `shield-core` | Enables connector telemetry ingestion |
| `POST` | `/api/v1/connectors/:id/disable` | `shield-core` | Disables connector telemetry ingestion |
| `GET` | `/api/v1/notifications` | `shield-core` | Lists notification and email deliveries with retry and acknowledgment status |
| `POST` | `/api/v1/notifications/templates/:id/send-test` | `shield-core` | Dispatches a test email notification and records SHA-256 render hash |
| `POST` | `/api/v1/notifications/:id/acknowledge` | `shield-core` | Records audited operator acknowledgment of a notification |
| `POST` | `/api/v1/notifications/mark-all-read` | `shield-core` | Marks all notifications in the tenant ledger as `ACKNOWLEDGED` |
| `GET` | `/api/v1/observability/readiness` | `shield-core` | Returns live health and readiness scores across all 6 backend services |
| `POST` | `/api/v1/observability/disaster-recovery/restore-drill` | `shield-core` | Executes non-destructive scratch-schema DR restore drill and reconciles Merkle heads |
| `POST` | `/api/v1/anchor/verify-proof` | `shield-anchor` | Verifies RFC 6962 Merkle inclusion proof against sealed epoch root |

---

# 20. Sample Test Data

## 20.1 Test Accounts by Role
- **Customer / CISO (`TENANT_OWNER`):** `ciso@acmeglobal.com` (Redirects to `/customer/dashboard`)
- **Tenant Administrator (`TENANT_OWNER`):** `admin@acmeglobal.com` (Redirects to `/admin/tenant`)
- **SOC Security Analyst (`SECURITY_ANALYST`):** `analyst@acmeglobal.com` (Redirects to `/customer/dashboard`; blocked from `/admin/*`)
- **Platform Super-Admin (`SUPER_ADMIN`):** `superadmin@zoikoshield.com` (Redirects to `/admin`)
- **External Compliance Auditor (`AUDITOR`):** `auditor@deloitte-assurance.com` (Redirects to `/auditor`)

## 20.2 Canonical Residency Regions & Winning Policy Packs
- `eu-west-1` (EU Ireland) → Country `IE` → Policy Pack `eu_gdpr_dora_nis2_ie`
- `eu-central-1` (EU Frankfurt) → Country `DE` → Policy Pack `eu_gdpr_dora_bsi_de`
- `eu-west-2` (UK London) → Country `GB` → Policy Pack `uk_gdpr_fca_ncsc_gb`
- `us-east-1` (US East N. Virginia) → Country `US` → Policy Pack `us_sec_hipaa_nist_use1`
- `ap-south-1` (India Mumbai) → Country `IN` → Policy Pack `in_dpdp_certin_rbi_aps1`

---

# 21. Database Verification Steps

When verifying against a live PostgreSQL 16 instance (`shield_core`):
1. **Verify Prisma Multi-Schema Synchronization:**
   ```bash
   cd backend
   npx prisma validate --schema=prisma/schemas
   ```
2. **Verify Row-Level Security (RLS) Policies:**
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
   FROM pg_policies
   WHERE schemaname = 'public';
   ```
   Confirm that tenant-scoped tables (`cases`, `alerts`, `evidence_records`, `connectors`, `notification_deliveries`) enforce `tenant_id = current_setting('app.current_tenant_id', true)`.
3. **Verify Case & Notification Persistence:**
   - After executing **TC-SHIELD-021** through **TC-SHIELD-024**, query `SELECT id, title, status, assignee, updated_at FROM cases ORDER BY updated_at DESC LIMIT 5;` to confirm status changes and assignments match the UI.
   - After executing **TC-SHIELD-030** and **TC-SHIELD-031**, query `SELECT id, event_id, channel, status, delivered_at FROM notification_deliveries ORDER BY created_at DESC LIMIT 5;`.

---

# 22. Email Testing Instructions

1. Configure SMTP environment variables in `backend/.env` (or use the built-in transactional relay in `/api/v1/notifications/templates/:id/send-test`):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM="ZoikoShield Security Operations <no-reply@zoikoshield.com>"`
2. Navigate to `/admin/email-templates` or `/notifications` (`Send Test Email`).
3. Trigger a test email for template `ZS-EML-SEC-001` (`Critical Credential Compromise Alert`) or `ZS-EML-IAM-001` (`Account Verification OTP`).
4. Verify:
   - Recipient address receives the formatted HTML/plaintext email with tenant-scoped metadata.
   - No internal stack traces, secret keys, or cross-tenant identifiers appear in the email body or headers.
   - Delivery status (`DELIVERED` or `FAILED`) and SHA-256 `renderHash` are recorded in `/notifications`.

---

# 23. Notification Testing Instructions

1. Test **In-App Bell Dropdown** in both `CustomerTopHeader` (`/customer/dashboard`) and `TopHeader` (`/`):
   - Verify unread badge counter displays the current unread count.
   - Click an alert notification item and verify it navigates directly to `/alerts` or `/cases`.
   - Click **Mark all as read** and verify the badge clears immediately.
2. Test **Full Notification & Acknowledgment Ledger (`/notifications`)**:
   - Switch to the Live Console tab.
   - Verify failed or dead-lettered notifications (`FAILED` / `DEAD_LETTERED`) are surfaced in the high-visibility warning banner above the delivery list.
   - Click **Acknowledge** on a `DELIVERED` row and verify it transitions to `ACKNOWLEDGED`.
   - Click **Mark All Read** and verify all rows transition to `ACKNOWLEDGED`.

---

# 24. Negative and Edge Case Testing

1. **Invalid / Tampered Cryptographic Proof (`/verify-certificate` & `/ledger`):**
   - Modify 1 hex character of `declaredMerkleRoot` in `/verify-certificate` → Verifier must report `TAMPER_DETECTED` and `merkleRootIntegrity: false`.
   - When `shield-anchor` returns `valid: false` or is unreachable in `/ledger` → UI must report `Proof Invalid` or `Verification could not be completed`, never `Proof Cryptographically Valid`.
2. **Failed WebAuthn Hardware Step-Up (`/admin/jit`):**
   - If `verifyJitStepUp` rejects with `Passkey signature verification failed`, the JIT elevation modal remains open, displays the error, and refuses to grant privilege elevation.
3. **Duplicate Priority Action Submission (`/customer/dashboard`):**
   - Entering a duplicate Priority Action title (case-insensitive) is blocked with a clear duplicate warning banner.
4. **Empty Case Creation / Note Submission (`/cases`):**
   - Clicking `Create & Anchor Case` with a blank title displays `Validation error: Case title is required.` and does not create an empty record.
5. **Cross-Role Unauthorized URL Entry:**
   - Logged in as `SECURITY_ANALYST`, manually entering `/admin`, `/admin/g1-gate`, or `/admin/tenant` redirects immediately to `/customer/dashboard`.

---

# 25. Regression Testing Checklist

Run the following automated verification gates before every release or deployment:

```bash
# 1. Frontend TypeScript Type-Check (Must exit 0)
cd frontend
./node_modules/.bin/tsc --noEmit

# 2. Frontend Vitest Unit & Integration Suite (16 suites, 129 tests)
./node_modules/.bin/vitest run

# 3. Backend Ungrounded Terminology CI Linter (Must report 0 violations across 1,773+ files)
cd ../backend
npm run check:ungrounded-terms

# 4. Backend OpenAPI / Swagger Security Contract Coverage Check
npm run swagger:check

# 5. Backend Public Capability & GTM Claims Integrity Check
npm run check:capability-claims

# 6. Backend Controller Access Contract Check
npm run access:check

# 7. Backend G1 Evidence Index Traceability Check
npm run check:evidence-index

# 8. Backend Capability & Baseline Jest Test Suites
npx jest --passWithNoTests --testPathPattern="capability|baseline"
```

---

# 26. Known Limitations / Environment Dependencies

1. **External Infrastructure Services in Local Sandbox:** Full production telemetry streaming and persistence use PostgreSQL 16, ClickHouse, Kafka, Redis, OpenSearch, and S3 Object Lock (`docker-compose.yml`). When running the Next.js frontend standalone without local Docker containers, the resilient proxy (`/api/v1/[...slug]/route.ts`) services requests with deterministic in-memory state and explicitly labels data provenance via `DataProvenanceBadge`.
2. **Hardware WebAuthn Passkeys (`navigator.credentials.get`):** Requires a browser environment with a platform authenticator (Windows Hello, Touch ID, or FIDO2 YubiKey) over `localhost` or HTTPS.
3. **Live SMTP Relay:** Actual external email delivery to third-party mailboxes requires valid `SMTP_*` credentials configured in `backend/.env`; otherwise dispatches are logged in the notification ledger with simulated transport metadata.

---

# 27. Bug Reporting Format for Testers

When filing a defect in GitHub Issues or Jira, use the following structured template:

```markdown
### [BUG] <Short Descriptive Title>
- **Test Case ID:** TC-SHIELD-XXX
- **Module & Route:** e.g., Case Workspace (`/cases`)
- **Logged-in Role & Tenant:** e.g., `SECURITY_ANALYST` (`tenant-bank-01`, Region `eu-west-1`)
- **Severity:** S0 (Blocker) | S1 (Critical) | S2 (Major) | S3 (Minor)
- **Preconditions:**
- **Steps to Reproduce:**
  1.
  2.
  3.
- **Expected Result:**
- **Actual Result:**
- **API Request / Response Status (from DevTools Network tab):**
- **Console Logs / Screenshot / Merkle Proof ID:**
```

---

# 28. Sign-Off Checklist

- [ ] **Authentication & Session Security:** Login, registration, passkey ceremony, logout, and unauthenticated route protection verified (`TC-SHIELD-001` – `TC-SHIELD-010`).
- [ ] **Customer Workspace (`/customer/dashboard`):** Executive View, SOC View, Account View, KPI drilldown, time window filters, and live alert status persistence verified (`TC-SHIELD-011` – `TC-SHIELD-016`).
- [ ] **Role & Tenant Isolation:** Customer vs. Tenant Admin vs. Platform Super-Admin route boundaries and 7-subsystem residency isolation verified (`TC-SHIELD-017` – `TC-SHIELD-019`).
- [ ] **Case & Incident Lifecycle (`/cases`, `/cases/[caseId]`):** Case creation, validation, assignment, status transitions (`OPEN` → `CLOSED`), reopening, and investigation notes verified (`TC-SHIELD-020` – `TC-SHIELD-026`).
- [ ] **AI Copilot, SOAR & Connectors:** Grounded AI citations, dual-custody SOAR approvals, and connector certification/handshake tests verified (`TC-SHIELD-027` – `TC-SHIELD-029`).
- [ ] **Email & Notification Workflows:** Template preview, test email dispatch, individual acknowledgment, and Mark All Read verified (`TC-SHIELD-030` – `TC-SHIELD-031`).
- [ ] **Cryptographic Ledger & DR Drills:** RFC 6962 Merkle verification, offline certificate tamper detection, SOAR freeze, DR restore drill, and G1 Gate sign-off verified (`TC-SHIELD-032` – `TC-SHIELD-036`).

---

# 29. Final QA Approval Table

| Stakeholder Role | Reviewer Name | Scope Verified | Status (`PENDING` / `APPROVED`) | Signature / Date |
| :--- | :--- | :--- | :---: | :--- |
| **QA Automation Lead** | | End-to-End Functional, Negative & Regression Suites (`TC-SHIELD-001` – `TC-SHIELD-036`) | `PENDING` | |
| **Security & Cryptography Lead** | | RBAC/Cedar Isolation, G02 Residency, G06 RFC 6962 Merkle Verifier | `PENDING` | |
| **Product & UI/UX Lead** | | Customer Dashboard, Tenant Admin Portal, Super-Admin Console & UI Consistency | `PENDING` | |
| **Site Reliability Engineering (SRE) Lead** | | CI/CD Workflows (`ci.yml`, `deploy-vm.yml`), G05 DR Restore Drills, Service Health | `PENDING` | |
| **Chief Information Security Officer (CISO)** | | G1 Launch Gate Final Production Release Ratification | `PENDING` | |

