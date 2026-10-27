# ZoikoShield — Role-Based Functionality, Authorization Matrix & Test Accounts

**Document Reference:** `ZS-AUTH-RBAC-2026-10`  
**Security Classification:** Sovereign Security Operations Standard · Strictly Controlled  
**Effective Date:** October 27, 2026  
**Authorization Standard:** Cedar Deterministic Policy Rings · Least Privilege Invariants

---

## 1. Discovered Roles & Sovereign Architecture

The ZoikoShield platform implements four distinct, non-overlapping authoritative roles. In accordance with Zero-Trust principles and the principle of least privilege, permissions are verified on both the frontend UI and the backend Cedar policy evaluation engine (`shield-core`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHORITATIVE ROLE ROSTER                       │
├──────────────────┬─────────────────┬─────────────────┬─────────────────┤
│ 1. SUPER_ADMIN   │ 2. TENANT_OWNER │ 3. SEC_ANALYST  │ 4. AUDITOR      │
│ Platform Admin   │ CISO / Custodian│ SOC Operator    │ Compliance Assr │
│ Sovereign Cell   │ Tenant Scope    │ Tenant Scope    │ Read-Only Scope │
└──────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

---

## 2. Role-Wise Functionality & Permission Matrix

| Functional Dimension | `SUPER_ADMIN` | `TENANT_OWNER` | `SECURITY_ANALYST` | `AUDITOR` |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Scope** | Global Multi-Tenant Cluster | Single Organization Tenant | Single Organization Tenant | Inspection Scope |
| **Accessible Dashboards** | `/admin/*`, `/operations`, `/tenant-management` | `/risk`, `/policies`, `/team`, `/pricing`, `/ai-governance` | `/`, `/alerts`, `/cases`, `/copilot`, `/actions` | `/auditor`, `/controls`, `/evidence-operations`, `/ledger` |
| **Telemetry Ingestion Config** | View All / Cluster Rate Control | Connectors (`/connectors`) | Read Pipeline (`/ingestion`) | Read-Only |
| **Alert Triage & Cases** | Platform-Wide View | View Tenant Escalations | Full Read/Write (`/alerts`, `/cases`) | Read-Only Inspection |
| **AI Copilot & Model Armor** | Global Guardrails Config | Policy Ring Rules | Interactive Triage (`/copilot`) | Audit Logs Only |
| **SOAR Remediations (R1–R3)** | Global Override | View Proposals | Author & Trigger (`/actions`) | Read-Only Ledger |
| **Destructive Remediations (R4)**| Quorum Signatory 1 | Quorum Signatory 2 | Propose Only (Dual-Custody) | Prohibited |
| **Cedar Policy Authoring** | System Ring Deployment | Author Tenant Rings (`/policies`) | Prohibited | View Diff Ledger |
| **Team Management & Invites** | Platform Operators | Tenant Users (`/team`) | Prohibited | Prohibited |
| **Commercial Plans & Payments** | Price Book Governance | Plan Checkout (`/pricing`)| Prohibited | Prohibited |
| **Cryptographic Evidence Locker**| Sovereign Seal Inspection | Tenant Evidence Locker | Link Incident Evidence | Verify Merkle Chains |
| **Audit Package Export** | Cluster Compliance Export | Tenant Compliance Export | Prohibited | Generate Sealed Packages |

---

## 3. Strict Restricted Operations per Role

### Role 1: `SUPER_ADMIN` (Platform Sovereign Administrator)
- **Restricted Operations:**
  - Cannot unilaterally execute destructive R4 containment actions (e.g., host wipe or infrastructure severance) without secondary customer signatory.
  - Cannot delete or tamper with RFC 3161 Merkle audit ledger epochs (append-only ledger invariant).
  - Cannot export or inspect customer private encryption keys (Cloud HSM boundary enforced).

### Role 2: `TENANT_OWNER` (Tenant Administrator / CISO)
- **Restricted Operations:**
  - Cannot access, view, or query data belonging to other tenant organizations (enforced via database Row-Level Security).
  - Cannot unilaterally activate high-impact Cedar policies without secondary 4-eyes peer sign-off.
  - Cannot alter core platform cluster topology or global microservice configurations.

### Role 3: `SECURITY_ANALYST` (SOC Operations Analyst)
- **Restricted Operations:**
  - Strictly prohibited from inviting team members, modifying user roles, or changing tenant billing subscriptions.
  - Cannot unilaterally approve self-proposed R4 SOAR containment actions (requires secondary `TENANT_OWNER` or `SUPER_ADMIN` approval).
  - Cannot export compliance audit certification packages.

### Role 4: `AUDITOR` (Independent Compliance Assessor)
- **Restricted Operations:**
  - **Strictly Read-Only:** All mutation requests (HTTP `POST`, `PUT`, `PATCH`, `DELETE`) evaluate to `403 CEDAR_POLICY_DENY`.
  - Cannot trigger SOAR actions, declare incidents, or modify containment states.
  - Cannot alter evidence retention schedules or modify compliance control parameters.

---

## 4. Test Account Roster for QA Verification

The following pre-configured test personas are seeded in the local testing and development environment (`backend/scripts/seed-dev-tenant.ts` and `seed-platform-admin.ts`):

| Persona / Role | Test Email Address | Organization / Tenant ID | Authentication Mechanism |
| :--- | :--- | :--- | :--- |
| **Platform Super Admin** | `super.admin@zoikoshield.local` | `tenant-zoiko-platform` | Password or FIDO2 WebAuthn |
| **Tenant Administrator (CISO)** | `owner@zoikoshield.corp` | `tenant-sovereign-01` | Password or FIDO2 WebAuthn |
| **Senior Security Analyst** | `marcus.vance@zoikoshield.corp` | `tenant-sovereign-01` | Password or FIDO2 WebAuthn |
| **External Compliance Auditor** | `elena.rostova@auditor.compliance` | `tenant-sovereign-01` | Password or Read-Only Token |

> [!NOTE]
> Test passwords for local QA are provided securely through local environment seeding scripts (`npm run seed:dev-tenant` and `npm run seed:platform-admin`). In compliance with Zero-Trust guidelines, actual secrets are never committed into repository documentation.

---

## 5. Account Lifecycle & Testing Procedures

### A. Testing User Registration
1. Navigate to `/register` in the browser.
2. Confirm that all form fields (**Organization Name**, **Admin Full Name**, **Email**, **Password**) are completely empty by default.
3. Enter new tenant details (e.g., `Eval Defense Corp`, `eval.admin@evaldefense.corp`).
4. Submit the registration form.
5. **Expected Backend Result:**
   - Principal record created in database with `source: REGISTRATION`.
   - New tenant created with dedicated UUID and slug.
   - Initial user assigned role `TENANT_OWNER`.
   - Registration confirmation email and verification challenge OTP dispatched via `MailService`.
   - Returns HTTP 201 with JWT bearer token and tenant ID.

### B. Testing Duplicate Email Prevention
1. Re-enter the same email address (`eval.admin@evaldefense.corp`) in the registration form.
2. Attempt to submit the form again.
3. **Expected Result:**
   - Submission is blocked with HTTP 409 Conflict.
   - The UI displays the clear user-facing warning:
     `"An account with this email address already exists. Please log in or use the password recovery option."`
   - Direct links to **Sign In** and **Forgot Password** are rendered.
   - Database records remain unchanged; no duplicate accounts or overwritten credentials.

### C. Testing Login & Session Invalidation (Logout)
1. Navigate to `/login`.
2. Confirm fields are empty without prefilled demo accounts.
3. Sign in with valid credentials.
4. Verify redirection to the authorized dashboard based on role.
5. Click **Sign Out** from the user profile dropdown.
6. **Expected Result:**
   - `ZoikoShieldApiClient.logout()` invalidates the active bearer token on the server.
   - Client-side cookies (`zoiko_auth`, `zoiko_shield_access_token`, `zoiko_shield_tenant_id`) are cleared.
   - Redirected to `/login?logout=true` displaying a confirmed sign-out notice.
   - Browser back button navigation to protected routes results in automatic redirect to `/login`.
