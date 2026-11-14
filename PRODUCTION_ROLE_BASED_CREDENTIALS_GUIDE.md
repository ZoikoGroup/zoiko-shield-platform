# ZoikoShield — Production Role-Based Credentials & Provisioning Guide

**Production Frontend:** `https://app.zoikoshield.com`  
**Production API:** `https://api.zoikoshield.com`  
**Audit Method:** Direct authenticated API inspection of live roles, memberships, and invitations on tenant `9d3f32ac-b8e3-454d-8275-914861befc45`.

> **Security Policy:** Plain-text production passwords and personal API tokens are **never** stored in git-tracked files. Obtain credentials through your secret manager or provision new operator accounts directly on the production VM using the scripts below.

---

## 1. Current Live Production DB State (Verified)

### Active Users Discovered (`GET /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/members` -> `200 OK`)

| User | User ID | Role | Membership Scope / ID | Source | Tenant / Environment |
|---|---|---|---|---|---|
| `aditya@zoiko.com` (`Nitta Aditya`) | `95688087-1eb7-4e63-a78f-c65d01e5aae0` | `TENANT_OWNER` | `989e51f1-ecc1-445e-b896-4175a320e25f` | `BOOTSTRAP` (`ACTIVE`) | Tenant `9d3f32ac-b8e3-454d-8275-914861befc45`, Env `606ca1dd-1f6b-401e-aabd-db4ca4594038` (`ap-south-1`) |

- Pending Invitations (`GET /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/invitations`): `[]` (none).
- Seeded Roles Discovered (`GET /api/v1/roles?tenantId=9d3f32ac-b8e3-454d-8275-914861befc45` -> `200 OK`): **12 roles** total:
  - **Tenant-scoped (11):** `TENANT_OWNER` (20 perms), `COMMERCIAL_ACCOUNT_OWNER` (8 perms), `BILLING_ADMIN` (6 perms), `COMMERCIAL_APPROVER` (6 perms), `FINANCE_COMMERCIAL_APPROVER` (5 perms), `EXECUTIVE_COMMERCIAL_APPROVER` (5 perms), `PRIVACY_LEGAL_REVIEWER` (5 perms), `PARTNER_DELEGATED_OPERATOR` (3 perms), `IR_LEGAL_COORDINATOR` (3 perms), `PROFESSIONAL_SERVICES_MANAGER` (2 perms), `AI_GOVERNANCE_MANAGER` (2 perms).
  - **Platform-scoped (1):** `PLATFORM_PRIVACY_LEGAL_REVIEWER` (3 perms).

### Important Gap Found
As of this audit, **no accounts or role records exist in the live production database for:**
1. **`PLATFORM_SUPER_ADMIN`** (Super Admin)
2. **`TENANT_ADMIN`** (Tenant Admin)
3. **`TENANT_SECURITY_ANALYST` / `SECURITY_ANALYST`** (Tenant Analyst)

Only `aditya@zoiko.com` (`TENANT_OWNER`, `BOOTSTRAP`) is currently active in live production.

---

## 2. How to Provision & Verify Requested Production Roles

### Step 1 — Seed Platform Super Admin (`PLATFORM_SUPER_ADMIN`) Host-Side
Run inside the `shield-core` container or on the production VM where `DATABASE_URL` points to the live PostgreSQL instance:

```bash
# Seed PLATFORM_SUPER_ADMIN with full PERMISSION_CODES and PLATFORM_SCOPE ACTIVE BOOTSTRAP membership
npm --prefix backend run seed:platform-admin -- "<super-admin-email>" "<strong-password>"

# Verify the PLATFORM_SUPER_ADMIN user, role, and PLATFORM_SCOPE membership
npm --prefix backend run check:platform-admin -- "<super-admin-email>"
```

What `backend/scripts/seed-platform-admin.ts` guarantees:
- Seeds role `code: 'PLATFORM_SUPER_ADMIN'`, `roleLevel: 'PLATFORM'`, `tenantId: null` with all `PERMISSION_CODES`.
- Binds an `ACTIVE` `tenantMembership` (`tenantId: PLATFORM_SCOPE`, `source: 'BOOTSTRAP'`).
- Enables cross-tenant platform governance permissions including `platform:role:manage`.

### Step 2 — Create Tenant Admin & Tenant Analyst Roles (`POST /api/v1/roles`)
Once signed in as the newly seeded **`PLATFORM_SUPER_ADMIN`** (which holds `platform:role:manage`), create the dedicated tenant-level roles on target tenant `9d3f32ac-b8e3-454d-8275-914861befc45` (or another tenant):
- **`TENANT_ADMIN`** (`TENANT` level): grant tenant operational, connector, policy, user invitation, and security management permissions without `PLATFORM_SCOPE` platform administration.
- **`TENANT_SECURITY_ANALYST`** (`TENANT` level): grant read/investigation/incident-response telemetry, cases, AI copilot, and alert triage permissions without billing, platform role management, or tenant deletion rights.

### Step 3 — Invite Tenant Admin & Tenant Analyst Users
Signed in as **`TENANT_OWNER`** (`aditya@zoiko.com`) or an authorized tenant administrator:
1. Issue invitations via `POST /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/invitations`.
2. Each recipient completes onboarding via the `/accept-invite` UI or `POST /api/v1/invitations/:token/accept`.
3. Verify memberships via `GET /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/members`.

---

## 3. Target Role-Based Access Matrix

| Role | Scope | Intended Capabilities | Enforced Restrictions |
|---|---|---|---|
| **Platform Super Admin** (`PLATFORM_SUPER_ADMIN`) | `PLATFORM_SCOPE` | Platform-wide governance, `platform:role:manage`, cross-cutting platform oversight, full `PERMISSION_CODES` | Declared platform/cross-cutting scopes enforced by `PermissionsGuard` |
| **Tenant Owner** (`TENANT_OWNER`) | Single Tenant (`9d3f32ac-...`) | Full tenant ownership, member invitations, connectors, ingestion, policies (`POLICY_CONFIG_READ/WRITE/APPROVE/ROLLBACK` added in local fix pending deploy) | Cannot access other tenants or `PLATFORM_SCOPE` controls |
| **Tenant Admin** (`TENANT_ADMIN`) | Single Tenant | Manage connectors, pipelines, policies, workspace members, notifications, and cases within assigned tenant | Denied `PLATFORM_SCOPE` operations (`403`) and cross-tenant resources (`403`) |
| **Tenant Security Analyst** (`TENANT_SECURITY_ANALYST`) | Single Tenant | View telemetry, alerts, cases, evidence, AI copilot hunt, AI drift, and resolution decisions; triage incidents | Denied admin-only mutations (role creation, billing, tenant deletion, policy approval without permission -> `403`) |

---

## 4. Verification Checklist After Provisioning
1. Test authentication (`POST https://app.zoikoshield.com/api/v1/auth/login`) for each provisioned account (`PLATFORM_SUPER_ADMIN`, `TENANT_OWNER`, `TENANT_ADMIN`, `TENANT_SECURITY_ANALYST`).
2. Confirm `smoke-test.js` succeeds against `https://app.zoikoshield.com` with `TEST_EMAIL` / `TEST_PASSWORD` environment variables (without storing passwords in git).
3. Confirm unauthorized role escalations (e.g., Analyst -> `POST /api/v1/roles` or Admin -> another tenant ID) return `403 Forbidden`.
