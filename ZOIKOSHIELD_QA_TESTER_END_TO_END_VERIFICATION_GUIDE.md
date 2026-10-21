# ZoikoShield Platform — QA Tester Master Verification Guide
**Target Release:** Production G1 Release Candidate • **Document Version:** 2.0.0  
**Deployed Production Platform:** `https://app.zoikoshield.com`  
**Local Development Gateway:** `http://localhost:3000`

---

## 1. Architectural Architecture & Key Requirements

This guide addresses all tester requirements for the ZoikoShield Enterprise Platform:
1. **Login Must Be the First Screen:** When opening the platform root URL (`/`), unauthenticated users see only `/login`. Direct access to protected URLs enforces authentication and redirects to `/login?redirect=...`. Public authentication pages render without the authenticated sidebar.
2. **Proper Login and Account-Creation Flow:** Features professional branding, show/hide password toggle, forgot-password recovery with RFC 3161 proof, 4 pre-configured demo roles, self-service evaluation tenant registration (`/register`), and invitation-token acceptance (`/accept-invite`).
3. **Stable Left-Side Navigation:** Sidebar stays fixed and persistent on the left across all authenticated pages. Selecting navigation items updates only the right-side content without remounting or jumping. Active menu items are highlighted.
4. **Only Right-Side Content Changes:** Two-part layout (`<AppShell>`) where the left sidebar is rendered once around protected routes while the right-side workspace updates smoothly.
5. **Realistic End-to-End Test Data & Demo Credentials:** Complete seeded accounts for 4 distinct roles, reproducible test scenarios, and reseed commands.

---

## 2. Authorized Demo Login Credentials

The platform provides 4 pre-configured demo personas mapped directly to the application's Cedar authorization policies and role hierarchy:

| Role Title | Email Credential | Password | Default Tenant ID | Primary Permissions & Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Super Admin** | `super.admin@zoikoshield.local` | `Admin2026!Platform` | `tenant-zoiko-platform` | Cross-tenant administration, G1 launch gate ratification, global emergency freeze, microservices health inspection |
| **Tenant Administrator / CISO** | `sarah.chen@acme.com` | `Demo2026!Secure` | `tenant-acme-corp` | Tenant provisioning, team membership, Cedar policy ring approval, connector wizard, full SOAR authority |
| **Senior Security Analyst** | `marcus.vance@acme.com` | `Analyst2026!SecOps` | `tenant-acme-corp` | Threat hunting, SOC alert queue triage, P1 incident command war room, ReAct investigative copilot |
| **Read-Only Compliance Auditor** | `elena.rostova@auditor.compliance` | `Auditor2026!Verify` | `tenant-acme-corp` | Read-only compliance controls evaluation, RFC 3161 Merkle evidence verification, sealed audit package inspection |

> [!NOTE]
> **1-Click Quick Authentication:** On the `/login` page, the **"DEMO TESTER ACCOUNTS"** section allows testers to click any of the 4 roles to instantly autofill and sign in with one click.

---

## 3. Account Creation & Onboarding Flow

ZoikoShield implements a dual-path onboarding model enforcing Zero-Trust separation of duties:

### Path A: Self-Service Evaluation Tenant Registration (`/register`)
- **Direct URL:** `https://app.zoikoshield.com/register`
- **Use Case:** An evaluator or prospective enterprise customer registering a new isolated organization.
- **Onboarding Steps:**
  1. Navigate to `/register` and select the **"New Evaluation Tenant"** tab.
  2. Enter **Organization Name** (e.g., `Apex Cyber Defense`). The tenant slug is automatically derived (e.g., `apex-cyber-defense`).
  3. Enter **Primary Administrator Name** and corporate **Work Email**.
  4. Enter a secure **Password** (min 8 characters). Use the Eye icon to toggle visibility.
  5. Select **Sovereign Cloud Data Residency Region** (`us-east-1`, `eu-west-1`, or `ap-southeast-1`).
  6. Select pre-activated **Compliance Packs** (SOC 2, ISO 27001, EU AI Act, DORA).
  7. Click **"Provision Evaluation Tenant & Issue Session"**.
  8. An isolated tenant boundary is provisioned, the registrant is assigned as `TENANT_OWNER`, and authenticated cookies (`zoiko_auth=true`) are issued. The user is redirected to the platform dashboard.

### Path B: Invitation-Based Onboarding (`/accept-invite`)
- **Direct URL:** `https://app.zoikoshield.com/accept-invite`
- **Use Case:** An analyst or operator joining an existing corporate tenant.
- **Security Rule:** To prevent unauthorized self-promotion, operators cannot arbitrarily assign themselves roles in an existing tenant. A `TENANT_OWNER` must issue an invitation token from **Team & Access** (`/team`).
- **Onboarding Steps:**
  1. Open the invitation link from corporate email or navigate to `/register` → **"Join with Invitation Token"**.
  2. Input the token (e.g., `inv-tok-99214-f89a`).
  3. Review the tenant profile, assigned role (`SECURITY_ANALYST` or `AUDITOR`), and the cryptographically hashed Access Disclosure Terms.
  4. Check **"I acknowledge and accept the statutory terms"** and complete FIDO2 Passkey enrollment.
  5. Click **"Activate Tenancy & Complete Onboarding"**.

---

## 4. Test Data Initialization, Reseed & Reset Procedures

### Resetting Client Session (Browser)
To reset the frontend session back to an unauthenticated state:
1. Click the **"Sign Out"** button in the left sidebar footer or Top Header profile dropdown.
2. All cookies (`zoiko_auth`, `zoiko_shield_access_token`, `zoiko_shield_tenant_id`) and localStorage state will be cleared.
3. The platform immediately redirects to `/login?logout=true`.

### Reseeding Backend Test Scenarios (CLI)
When running against the local or sandbox backend:
```bash
# 1. Seed or reseed the platform super-admin account
npm run seed:platform-admin --prefix backend -- super.admin@zoikoshield.local Admin2026!Platform

# 2. Seed a dedicated development tenant with owner credentials
npm run seed:dev-tenant --prefix backend -- --owner sarah.chen@acme.com --password Demo2026!Secure

# 3. Simulate continuous SOC alerts, telemetry events, and case progression
npm run simulate:soc --prefix backend

# 4. Trigger the full 15-step ERB-01 MVP verification demonstration runner
npm run demo:erb01:full --prefix backend
```

---

## 5. End-to-End 16-Step Verification Checklist

Run through the platform sequentially to verify all 16 operational stages:

| Stage # | Stage Name | Route URL | Target Role | Key Verification Checks |
| :---: | :--- | :--- | :--- | :--- |
| **0** | **Authentication Gate** | `/login` | Unauthenticated | Unauthenticated visits to `/` redirect to `/login`. Password show/hide works. 4 demo accounts available. |
| **1** | **Platform Service Health** | `/admin/platform-health` | Platform Admin | All 6 microservices healthy. Trigger on-demand DR non-destructive restore drill. |
| **2** | **G1 Launch Gate Protocol** | `/admin/g1-gate` | Platform Admin | 8 domain stakeholders rendered. Ratify launch gate with cryptographic signature. |
| **3** | **Executive Risk Exposure** | `/risk` | Tenant Admin | Financial Value-at-Risk ($2.4M), attack path graphs, and cyber insurance posture. |
| **4** | **Detection & Alerts Queue** | `/alerts` | Security Analyst | OCSF normalized telemetry stream. Filter critical P1 alerts and triage alerts into cases. |
| **5** | **Incident Command War Room** | `/cases/incidents/command` | Security Analyst | Active incident war room clock, host containment action, and decision ledger. |
| **6** | **AI Security Copilot** | `/copilot` | Security Analyst | Spec §16.1 10-field decision review envelope. Accept/modify AI recommendations with operator signature. |
| **7** | **AI Governance & Safety** | `/ai-governance` | Tenant Admin | NIST AI RMF / EU AI Act compliance. Model Armor filters and emergency kill-switch engagement. |
| **8** | **Cedar Policy Lifecycle** | `/policies` | Tenant Admin | Side-by-side Cedar YAML diff. 4-eyes dual-custody approval and canary rollout percentage slider. |
| **9** | **JIT Elevation Quorum** | `/admin/jit-elevation` | Platform Admin | Privileged access request with 2-party signatory quorum and step-up challenge. |
| **10** | **Autonomous SOAR Sandboxing** | `/response-proposals` | Security Analyst | WASM dry-run simulation of response proposals with 0-blast-radius execution receipt. |
| **11** | **Circuit Breakers & Controls** | `/admin` | Platform Admin | Super-admin emergency kill-switches, tenant capability toggles, and commercial offer matrix. |
| **12** | **RFC 3161 Merkle Evidence Ledger** | `/ledger` | Auditor | Immutable Merkle tree proof explorer with FIPS 204 post-quantum signature verification. |
| **13** | **Continuous Controls Matrix** | `/controls` | Auditor | Real-time automated test results across SOC 2 Type II, ISO 27001, and DORA controls. |
| **14** | **Commercial Pricing Calculator** | `/pricing` | Tenant Admin | 4-tier plan ladder with anti-perverse pricing guarantee disclaimers and band guidance. |
| **15** | **Notification Center & DLQ** | `/notifications` | Tenant Admin | Audited delivery ledger, Dead Letter Queue (DLQ) replay, and cryptographic dispatch receipts. |
| **16** | **226 Production Email Templates** | `/admin/email-templates` | Platform Admin | Live template studio previewing all 226 fail-closed customer and security notifications. |

---

## 6. Layout & Navigation Verification Matrix

| Behavior | Expected Result | Status |
| :--- | :--- | :---: |
| **Root `/` Unauthenticated Access** | Browser immediately redirects to `/login` with no layout flash. | **PASS ✓** |
| **Protected Route Direct Access** | Navigating to `/cases` or `/admin` unauthenticated redirects to `/login?redirect=%2Fcases`. | **PASS ✓** |
| **Sidebar Isolation on Auth Pages** | `/login`, `/register`, and `/accept-invite` render clean full-screen views with zero sidebar. | **PASS ✓** |
| **Sidebar Stability Across Navigation** | Navigating between `/`, `/cases`, `/alerts`, `/ledger`, etc., updates only the right-side workspace. Sidebar remains fixed and persistent. | **PASS ✓** |
| **Session Persistence on Refresh** | Pressing `F5` or refreshing the browser while logged in retains session and does not log user out. | **PASS ✓** |
| **Sign Out Execution** | Clicking Sign Out clears all cookies (`zoiko_auth=; expires=...`), resets memory, and redirects to `/login?logout=true`. | **PASS ✓** |
| **Password Visibility Toggle** | Clicking the Eye icon on `/login` and `/register` reveals/masks the password characters. | **PASS ✓** |
| **Evaluation Registration** | Submitting `/register` provisions a tenant, sets session, and routes to the authenticated dashboard. | **PASS ✓** |
