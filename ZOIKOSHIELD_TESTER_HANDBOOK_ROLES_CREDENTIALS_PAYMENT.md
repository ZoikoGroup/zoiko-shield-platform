# ZoikoShield — Tester Handbook (Roles, Credentials, Test Data, Payment)

Local URL: `http://localhost:3000` • Login page: `/login`

> [!IMPORTANT]
> These are **shared demo/test credentials**. Never reuse them on a production tenant.
> The login form opens **empty** — email, password and tenant ID must be typed in.

---

## 1. Roles and what each can do

The same table is available in the app: `/login` → **View Role Permissions & Functionality**.

| Role | Backend role code | Purpose | Main screens |
|---|---|---|---|
| **Platform Super Admin** | `SUPER_ADMIN` | Cross-tenant platform control | `/admin/g1-gate`, `/admin/platform-health`, `/admin` (emergency SOAR freeze), `/admin/jit-elevation`, `/admin/email-templates`, `/notifications` |
| **Tenant Administrator / CISO** | `TENANT_OWNER` | Runs one organization | `/risk`, `/policies`, `/ai-governance`, `/team`, `/pricing` (payment), `/validation` |
| **Senior Security Analyst** | `SECURITY_ANALYST` | SOC triage and response | `/ingestion`, `/alerts`, `/cases/incidents/command`, `/copilot`, `/response-proposals`, `/ledger` |
| **Read-Only Compliance Auditor** | `AUDITOR` | Inspection only | `/auditor`, `/controls`, `/compliance`, `/ledger`, `/audit` |

### Functionality per role

**Platform Super Admin — can:** ratify the G1 launch gate (multi-signer, FIDO2); engage global emergency SOAR freeze; run a non-destructive disaster-recovery restore drill; approve/revoke JIT privilege elevation; edit and canary-deploy the 226 email templates; retry notifications in the dead-letter queue.
**Cannot:** bypass dual-party quorum for destructive actions; delete or rewrite the Merkle audit ledger (append-only); export customer private keys.

**Tenant Administrator / CISO — can:** view executive risk and financial exposure; author and roll out Cedar policies; use AI governance and Model Armor kill-switches; invite and assign roles to team members; choose a plan and pay (`/pricing`); activate incident-response retainer; configure the tenant's own encryption keys.
**Cannot:** see other tenants' data; activate a Cedar policy without 4-eyes sign-off; change global platform configuration.

**Senior Security Analyst — can:** triage alerts and map to MITRE ATT&CK; run the incident command war room and contain hosts; review and sign AI Copilot decisions (10-field envelope); dry-run SOAR proposals in the sandbox; monitor connectors and inject test telemetry; verify Merkle receipts; package case evidence.
**Cannot:** approve subscriptions or billing; approve their own JIT elevation; edit Cedar policies or delete evidence.

**Read-Only Compliance Auditor — can:** inspect SOC 2 / ISO 27001 / NIST controls; check evidence freshness and hashes; use the auditor cockpit; verify RFC 3161 and post-quantum proof chains; export sealed audit packages; view posture, incident history and policy logs.
**Cannot:** do anything that writes — every POST/PUT/PATCH/DELETE must return **403**; trigger SOAR; invite users or change tenant settings.

---

## 2. Login credentials

Sign in at `/login` with all three fields: **email + password + tenant ID**.
The tenant ID must match the account, otherwise login returns `401 Invalid email, password or tenant`.

### Set A — one account per role (use this to test role differences)

| Role | Email | Password | Tenant ID |
|---|---|---|---|
| Platform Super Admin | `super.admin@zoikoshield.local` | `Admin2026!Platform` | `tenant-zoiko-platform` |
| Tenant Administrator / CISO | `sarah.chen@acme.com` | `Demo2026!Secure` | `tenant-acme-corp` |
| Senior Security Analyst | `marcus.vance@acme.com` | `Analyst2026!SecOps` | `tenant-acme-corp` |
| Read-Only Auditor | `elena.rostova@auditor.compliance` | `Auditor2026!Verify` | `tenant-acme-corp` |

### Set B — cloud database demo users (all get the Tenant Owner role)

Password for all: `Shield@SecOps2026!` • Tenant ID: `00000000-0000-4000-8000-000000000001`

| Email | Role actually granted |
|---|---|
| `sarah.chen@acme.com` | Tenant Owner |
| `owner@acme.com` | Tenant Owner |
| `analyst@zoikoshield-demo.com` | Tenant Owner (not an analyst) |
| `admin@zoikoshield.io` | Tenant Owner (not a super admin) |

> [!WARNING]
> Set B cannot be used to test analyst/auditor/super-admin restrictions — the seed script gives every user Tenant Owner. Use Set A for role testing.

> [!NOTE]
> Some older guides list other emails (`analyst@zoikoshield-demo.com` / `Analyst2026!SOC`, `auditor@acme-audit.org` / `Auditor2026!Proof`). Those are **not** defined in the current auth source — use the tables above.

### Guide to Creating New Accounts & Evaluation Tenants

#### Method 1: Register a New Evaluation Organization
1. Navigate to `/register` or `/login` → click **"Create an account"** / **"New Evaluation Tenant"**.
2. Complete the form:
   - **Organization Name**: e.g., `CyberGuard Defense Labs`
   - **Workspace Slug**: e.g., `cyberguard-labs` (auto-checked for uniqueness)
   - **Administrator Full Name**: e.g., `Alex Morgan`
   - **Work Email**: e.g., `alex.morgan@cyberguard.io`
   - **Password**: Must meet complexity requirements (min 12 chars, upper, lower, digit, symbol).
3. The platform creates the `Principal`, `LocalCredential`, `Tenant`, and assigns `TENANT_OWNER` membership.
4. **Email Verification**: An `EMAIL_VERIFICATION` challenge OTP is generated and dispatched via `ZS-EML-IAM-001` (Account Verification). The workspace provisioning notification is dispatched via `ZS-EML-ORG-001`.
5. Enter the 6-digit verification code at `POST /api/v1/auth/verify-email` or click the verification link to mark the account verified.

#### Method 2: Inviting Teammates (Analyst / Auditor / Admin)
1. Sign in as Tenant Owner (`sarah.chen@acme.com`).
2. Navigate to `/team` → click **"Invite Team Member"**.
3. Specify candidate's work email and assigned role (`SECURITY_ANALYST`, `AUDITOR`, or `TENANT_ADMIN`).
4. An invitation with a cryptographically signed, single-use token is generated and emailed.
5. The invitee opens `/accept-invite?token=<INVITATION_TOKEN>`, creates their credential / passkey, and is bound to the tenant with their assigned role.

#### Method 3: Seeding Pre-Configured Test Accounts (Backend Running)
When testing against the real PostgreSQL / Neon database:
```bash
# Seed Platform Super Admin
npm run seed:platform-admin --prefix backend -- super.admin@zoikoshield.local Admin2026!Platform

# Seed Tenant Administrator & Test Tenant
npm run seed:dev-tenant --prefix backend -- --owner sarah.chen@acme.com --password Demo2026!Secure
```

---

## 3. Payment & Subscription Workflow (`/pricing` → choose a plan → checkout)

Log in as **Tenant Administrator** (`sarah.chen@acme.com`). The simulated fake card shortcuts (`tok_visa_valid`, `ch_...`) have been decommissioned and replaced with official **Stripe Checkout Sessions**:

1. **ADR-06 Contract-Only Enforcement**:
   - Per ZS-COM-BILL-001 §161 / ADR-06, high-assurance plan tiers without published price books require an Enterprise SOW contract. Clicking checkout on these plans displays the contract assurance notice with direct contact link.
   - For dev/testing of the full payment and email lifecycle, configure `STRIPE_ALLOW_TEST_PRICING=true` or individual plan rate overrides in backend `.env`.

2. **Stripe Checkout Session Flow**:
   - Enter Billing Organization Name and Billing Work Email (`finance@yourorg.com`).
   - Click **"Proceed to Stripe Checkout"**.
   - The backend creates an authoritative checkout session via `POST /api/v1/payments/checkout-session`.
   - In production / live Stripe test mode, redirects to Stripe's hosted checkout.
   - Upon completion, the verified Stripe webhook (`POST /api/v1/payments/webhook`) activates entitlements in the database and automatically dispatches transactional emails:
     - `ZS-EML-BILL-001` (Subscription Activated Confirmation)
     - `ZS-EML-BILL-006` (Official Payment Receipt)
   - Checking session status at `GET /api/v1/payments/session/:id/status` returns `SUCCEEDED` status and displays the verified subscription badge.

---

## 4. Other test data

| Need | Value |
|---|---|
| Alerts / cases | Seeded automatically: `alt-lateral-movement-01`, `alt-exfil-staging-02`, `alt-failed-login-bruteforce-01`, case `case-2026-auth-attack-01` |
| Connectors | 7 pre-listed (webhook, Entra ID, CrowdStrike, GuardDuty, SentinelOne, GCP SCC, Syslog) |
| Merkle receipt | epoch `1043` |
| Reset session | Sidebar/header **Sign Out** → returns to `/login?logout=true` |
| Simulated activity (backend running) | `npm run simulate:soc --prefix backend` |

---

## 5. Quick role-check script for testers

1. Login as **Auditor** → open `/team`, try inviting a user → expect **blocked/403**.
2. Login as **Analyst** → open `/pricing`, try to pay → expect **blocked**.
3. Login as **Tenant Admin** → open `/pricing` → select plan → proceed to Stripe Checkout session → expect authoritative session creation and redirect.
4. Login as **Super Admin** → open `/admin/g1-gate` and `/admin/platform-health` → expect both load.
5. Sign out → refresh → expect redirect to `/login` with empty fields.
