# ADR-19 — Database isolation: one ORM, module schemas, service roles and tenant row-level security

## Status

**IMPLEMENTED, awaiting platform-owner acceptance, 2026-09-25.**

Implemented and verified against PostgreSQL 16 in a local scratch database. It
has **not** run on Cloud SQL: the regional cell's live state stays `NOT_RUN` in
the G1 evidence index until the migrate job has applied it there.

## Date

2026-09-25

## Context

The combined engineering specification sets the relational rules:

- **§19.** The transactional system of record is a *managed
  PostgreSQL-compatible relational database*, with module schemas and
  row/tenant controls, and no cross-module direct writes. Each domain owns its
  schema, and shared tables are prohibited.
- **§11.1.** There must be *one schema namespace per shield-core module,
  enforced by database roles and CI architecture tests*. It also requires:
  - tenant-aware row-level security on pooled authoritative tables;
  - bypass roles that are restricted, monitored and just-in-time;
  - tenant-inclusive keys;
  - large artifacts kept out of rows.
- **§15.** Any code path that can omit tenant scope is a **P0 release
  blocker**, unless it is an approved platform-wide control with independent
  authorization and audit.

The codebase met none of this. Specifically:

- **Two ORMs.** ADR-002 chose Prisma in September, but the identity,
  authorization and tenant planes still ran on TypeORM, with their own
  migration runner.
- **One shared schema.** All 231 Prisma tables sat in `public`.
- **No database-level isolation.** No table had row-level security. Every
  service connected with the same credentials, and locally that credential was
  the superuser, which bypasses row-level security anyway. Tenant isolation
  depended entirely on each query remembering its `WHERE tenant_id = …`.
- **No database in the regional cell.** The OpenTofu cell defined GKE,
  Cloud Storage and KMS, but no Cloud SQL.

## Decision

### 1. One ORM: Prisma (completes ADR-002)

The 27 TypeORM tables are now Prisma models in `prisma/schemas/identity.prisma`,
`authorization.prisma` and `tenant.prisma`, with their column names
unchanged. The 20 TypeORM SQL migrations became the Prisma baseline migration
`20260925000000_consolidate_typeorm_identity_tenant_authorization`. On a
database the retired runner had already migrated,
`scripts/reconcile-typeorm-baseline.js` marks that baseline as applied, and
only when all 20 checksums match. TypeORM and `@nestjs/typeorm` are removed.

### 2. One PostgreSQL schema per owning module

The Prisma schema is split into 51 files under `prisma/schemas/`, one per
PostgreSQL schema. `20260925010000_module_schemas` moves every table with
`ALTER TABLE … SET SCHEMA`, which keeps all rows, indexes and constraints.

The four satellite services each own one schema: `ingest`, `ai`, `action`
and `anchor`.

The transactional outbox and inbox live in a shared `messaging` schema: any
module appends to the outbox in its own transaction, and only the publisher
updates rows. This is the one deliberate shared table, and it follows the
transactional-outbox pattern the spec itself requires (§11.1: outbox/inbox
tables).

### 3. Database roles per service

Each service connects as a login that belongs to one group role:
`shield_core_app`, `shield_ingest_app`, `shield_ai_app`, `shield_action_app`
or `shield_anchor_app`.

- **Satellite roles** can modify their own schema and read or write only the
  specific tables of other schemas that their code uses.
- **The core role** can modify every schema, for two reasons: it hosts most
  modules, and tenant offboarding erases rows everywhere.
- **No role is granted `TRUNCATE`**, because row-level security does not
  filter it.

Inside shield-core, module boundaries are enforced by the CI test
`apps/shield-core/test/database-access-policy.spec.ts`. It fails on:
- any table without an isolation decision;
- any satellite table use the satellite's role has no grant for;
- any **new** cross-module write.

### 4. Fail-closed tenant row-level security

Every service connects through `TenantScopedPool`
(`libs/database/src/tenant-scoped-pool.ts`). On every connection checkout it
writes the caller's scope into the session: `app.tenant_id`,
`app.platform_scope` and `app.scope_reason`. It overwrites whatever the
previous borrower left, so a connection never carries another unit of work's
tenant. The scope comes from `AsyncLocalStorage` (`libs/database/src/db-scope.ts`):

| Entry point | Scope |
|---|---|
| HTTP request | Unbound until the auth guard has verified the tenant: `PermissionsGuard`, the workload-identity guards and the API-client guard call `bindRequestTenant` |
| Platform operation over HTTP | `PlatformPermissionsGuard` elevates the request only after the policy decision permits it |
| Kafka and Event Hub messages | The envelope's tenant |
| Scheduled jobs | `@PlatformScope('<reason>')` |
| Provider webhooks | The tenant of the verified credential (HMAC key, Graph `clientState`, OAuth state) |
| Operator scripts | An explicit platform scope |

Any query run with no scope sees no tenant rows.

Policies are generated from `prisma/access/access-policy.js` by
`scripts/apply-database-access.js`, which runs after every
`prisma migrate deploy`. Every table has one isolation kind:

| Kind | Tables | Rule |
|---|---|---|
| `tenant` | 164 (every table with a NOT NULL tenant column, plus 5 nullable ones listed explicitly) | row's tenant = session tenant |
| `tenant_or_shared` | 4 (e.g. `Freeze`, `DetectionRule`) | a NULL tenant is a shared definition: readable by every tenant, writable only in platform scope |
| `tenant_or_account`, `tenant_or_parent` | 4 | a NULL tenant is visible through the account or parent |
| `account` and related kinds | 9 | visible when the commercial account is bound to the session tenant |
| `parent` | 11 | visible exactly when the parent row is |
| `global` | 43 | reference data and platform operations; no row policy |
| `control_plane` | 23 | identity and authorization plane; no row policy |

Row-level security is `FORCE`d, so the table owner is filtered too.

Platform scope works only for a member of `shield_platform_scope`. The
settings are plain session variables that any role can set, so bypass needs
both the database grant and an explicit, reasoned declaration in the
application.

### 5. Commercial records are isolated by account, not by `tenant_id`

One commercial account can bind several tenants: `CommercialAccountTenantBinding`
is unique on `(account, tenant, environment)`. Contracts, invoices, payments
and subscriptions therefore cannot carry one `tenant_id`. They are visible to
a tenant while its binding is `ACTIVE`, `SUSPENDED` or `PENDING_APPROVAL`. An
`ENDED`, `REVOKED` or `TRANSFERRED` binding stops visibility.

Three child tables that are genuinely single-tenant (`CommercialQuoteLine`,
`ResourceObservationWindow` and `AuditPackageManifest`) were given `tenant_id`
by `20260925020000_tenant_keyed_child_rows`. The value is backfilled from the
parent, and a composite foreign key `(tenant_id, parent_id) → parent(tenant_id, id)`
stops a child from naming a different tenant from its parent.

### 6. The control-plane exemption

The identity schema, the authorization schema and `tenant.tenants` are read
*to establish* a tenant: at login, on the tenant picker, during membership
resolution and in session checks. So they cannot be tenant-filtered.

They are treated as §15's approved platform-wide control. Their authorization
is the identity-adapter and authorization services, and their audit is the
identity-event and authorization-decision trails. This exemption is the part
most worth reviewing. A principal-keyed policy (`app.principal_id`) could
narrow it later.

### 7. Managed PostgreSQL on Google Cloud

`infrastructure/tofu/regional-cell/database.tf` adds, per regional cell, a
Cloud SQL for PostgreSQL 16 instance with:

- **Network:** private IP only, with TLS required.
- **Encryption:** an HSM-protected customer-managed key.
- **Recovery:** point-in-time recovery, 30 retained backups kept in the cell's
  region, and regional HA in production.
- **Authentication:** IAM database authentication, with one IAM login per
  service plus the migrator.
- **Audit:** pgaudit logging `ddl,role`.

## Consequences

**Operating rules this introduces**

- **A new table needs an isolation decision.** The CI test and the deploy step
  both fail on an unclassified table.
- **Data migrations must declare platform scope** with
  `SELECT set_config('app.platform_scope', 'on', false)`, and the migration
  role must be a member of `shield_platform_scope`, which the deploy step
  grants. Without the declaration, a backfill silently updates zero rows,
  because `FORCE` filters the owner too.
- **New PL/pgSQL functions must pin `search_path`** or name their tables with
  a schema. `20260925030000_trigger_function_search_path` fixed the 49
  existing trigger functions: after the move, their unqualified table names
  resolved to nothing.
- **Connection pooling:** services must connect directly, through the
  Cloud SQL Auth Proxy, or through a session-mode pooler. A transaction-mode
  pooler (PgBouncer in transaction mode) can run the scope setting and the
  query on different server connections, and is not supported.
- **Prisma queries are lazy.** `runWithTenantScope(t, () => prisma.x.findMany())`
  is correct only because `runIn` starts the returned thenable inside the
  scope. Code that stores a Prisma promise and awaits it later, outside any
  scope, runs unscoped and fails closed.
- **Cost:** every connection checkout makes one extra round trip, the
  `set_config` call.

**Known exceptions, recorded rather than hidden**

- **66 existing cross-module writes** are frozen in
  `apps/shield-core/test/support/cross-module-write-allowlist.json`. The list
  can only shrink. For example, 13 modules write `approvals.CommercialApproval`.
  Removing them means giving the owning modules APIs, which is a separate
  change.
- **Trigger functions stay in `public`,** shared by the modules they guard,
  with pinned `search_path`s.
- **Integrity triggers now run under the caller's row-level security.** A
  trigger that checks for "no other row" sees only the session tenant's rows.
- **Global tables are writable by the core role** without a row policy. Their
  protection is the application's permission guards.

**Evidence** (`docs/G1_EVIDENCE_INDEX.md`)

- `npm run test:rls`: 16 negative and positive tests against real PostgreSQL,
  through the services' own `TenantScopedPool` and a non-owner login.
- `apps/shield-core/test/database-access-policy.spec.ts` and
  `libs/database/src/db-scope.spec.ts` in the unit suite.
- `npm run check:schema-drift`: migrations replayed into a shadow database
  equal the schema.
- shield-core itself was booted as its restricted role, and real HTTP requests
  were made. A tenant owner received only its own environments, legal
  entities and entitlements. A request for another tenant was refused with
  403. Every unscoped checkout during those requests touched control-plane
  tables only.

**Not yet evidenced**

- Anything on Cloud SQL.
- The HTTP platform-elevation path end to end: the platform administrator's
  requests stopped at the step-up requirement, before elevation.
