# Baseline Build, Lint, Typecheck & Test Health — ZoikoShield

**Date:** 2026-11-23  
**Workspace / Branch:** `zoiko-shield-platform` (`Aditya`)  
**Purpose:** Record exact baseline health of the repository **before any implementation edits** (read-only analysis phase; source code untouched).

---

## 1. Executive Summary (Baseline Status Before Changes)

| Area | Typecheck | Lint | Build | Tests / Governance Checks |
|---|---|---|---|---|
| **Frontend (`frontend/`)** | **PASS** (`EXIT 0`) | **PASS** (`EXIT 0`, **7 warnings across 6 files**) | **PASS** (`EXIT 0`, `60/60` pages; note `next.config.ts:5-7` skips ESLint on build) | **PASS** Vitest (`EXIT 0`, `28` files / `229` tests passed in `48.06s`) |
| **Backend (`backend/`)** | **PASS** (`EXIT 0` root + all `7` apps) | **PASS** with `npx eslint` (`EXIT 0`, `0` errors, **`758` warnings**); **avoid `npm run lint`** (`--fix`) | **BLOCKED IN SANDBOX** (`EXIT 1` `EPERM` opening `~\\.config\\fork-ts-checkerrc`) | Unit Jest **PASS** (`498` suites / `2,691` tests); CI E2E **4/4 PASS** (`action`, `ai`, `anchor`, `spine`); **`test:e2e:core` FAILS (`13/18` failed)**; Governance checks **6/6 PASS**; DB checks (`test:rls`, `check:schema-drift`) **BLOCKED** (require disposable Postgres URLs) |
| **Independent Verifier (`backend/tools/independent-verifier/`)** | Covered above (`verifier-cli` / tool tests) | — | — | **FAILS (`EXIT 1`)**: `1 failed, 7 passed, 8 total` (`verify.spec.ts:97`) |

---

## 2. Frontend Baseline (`c:\Users\aparaziitha nitta\zoiko-shield-platform\frontend`)

| Check | Command | Exit Code | Exact Result & Pre-Existing Issues |
|---|---|---:|---|
| **Typecheck** | `cd frontend; npx tsc --noEmit` | `0` | Passed with `0` errors across `frontend/src/`. |
| **Lint** | `cd frontend; npm run lint` (`next lint`) | `0` | `0` errors, **`7` `react-hooks/exhaustive-deps` warnings across `6` files**:<br>- `src/app/ai-governance/page.tsx:538:6` (missing `supplyChain`)<br>- `src/app/auditor/page.tsx:53:6` (missing `loadWorkspace`)<br>- `src/app/cases/page.tsx:92:9` (**2 warnings**: unstable `displayCases` conditional affecting `useEffect` at line 98 and `useMemo` at line 113)<br>- `src/app/notifications/page.tsx:181:6` (missing `demoState.alerts`)<br>- `src/app/policies/page.tsx:68:6` (missing `fetchPolicies`)<br>- `src/components/layout/TopHeader.tsx:312:6` (missing `state.alerts`)<br>Also prints Next.js 16 deprecation notice for `next lint`. |
| **Unit Tests** | `cd frontend; npm test` (`vitest run v5.0.1`) | `0` | `Test Files 28 passed (28)`, `Tests 229 passed (229)`, duration `48.06s`. |
| **Production Build** | `cd frontend; npm run build` (`next build`, Next.js `15.5.25`) | `0` | Generated `60/60` static pages cleanly. **Caveat:** `frontend/next.config.ts:5-7` sets `eslint: { ignoreDuringBuilds: true }`, suppressing the 7 lint warnings during production builds. |

---

## 3. Backend Typecheck, Lint, Build & Governance Scripts (`backend/`)

> [!WARNING]
> **Lint Command Caution:** `backend/package.json` configures `npm run lint` to invoke `eslint --fix`. Read-only validation used `npx eslint "apps/**/*.ts" "libs/**/*.ts"` directly without `--fix`.

| Check | Command / Script | Exit Code | Exact Result & Pre-Existing Issues |
|---|---|---:|---|
| **Typecheck (Root)** | `cd backend; npx tsc --noEmit` | `0` | Passed with `0` errors. |
| **Typecheck (Per-App)** | `npx tsc --noEmit -p apps/<app>/tsconfig.app.json` for all `7` Nest/CLI apps (`shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`, `shield-public-assistant`, `verifier-cli`) | `0` | All `7` app tsconfigs passed with `0` errors. |
| **ESLint (Read-only)** | `cd backend; npx eslint "apps/**/*.ts" "libs/**/*.ts"` | `0` | `0` errors, **`758` warnings** already present in the baseline codebase. |
| **Nest Build** | `cd backend; npm run build` (`nest build ...`) | `1` | **Blocked under terminal sandbox:** `Error EPERM: operation not permitted, open 'C:\Users\aparaziitha nitta\.config\fork-ts-checkerrc'` (`fork-ts-checker` config lookup outside workspace fails under sandbox ACLs). Run unsandboxed / with writable user home config in CI. |
| **Swagger Contract** | `npm run swagger:check` (`NODE_ENV=test` + CI env vars) | `0` | Passed against `backend/docs/swagger.yaml`. |
| **Ungrounded Terms** | `npm run check:ungrounded-terms` | `0` | Passed (`0` ungrounded terms across `1,859` files). |
| **Public Capability Claims** | `npm run check:capability-claims` | `0` | Passed on scanned backend docs/corpus. (**Gap:** does not scan `frontend/src/` — see `site-wide-audit.md` for `$2k/$4k/$8k`, `$12k/$24k/$48k`, and `$750` leaks in FE code.) |
| **DB / Table Access Policy** | `npm run access:check` | `0` | Passed against `backend/prisma/access/access-policy.js`. |
| **G1 Evidence Index** | `npm run check:evidence-index` | `0` | Passed (`35` rows, `5` file artifacts). |
| **Experience Contracts** | `npm run check:experience-contracts` | `0` | Passed (`29 of 29` G1-blocking contracts have a surface). |

---

## 4. Backend Unit, E2E, Independent Verifier & Database Checks

### 4.1 Passing Suites
| Suite | Command | Exit Code | Result |
|---|---|---:|---|
| **Backend Jest Unit Suite** | `cd backend; npm test -- --runInBand` | `0` | `Test Suites: 498 passed, 498 total`; `Tests: 2,691 passed, 2,691 total`; time `257.885 s`. |
| **E2E: Action (`shield-action`)** | `cd backend; npm run test:e2e:action` | `0` | `1 passed, 1 total` suite; `7 passed, 7 total` tests (`8.371 s`). |
| **E2E: AI (`shield-ai`)** | `cd backend; npm run test:e2e:ai` | `0` | `1 passed, 1 total` suite; `14 passed, 14 total` tests (`8.482 s`). |
| **E2E: Anchor (`shield-anchor`)** | `cd backend; npm run test:e2e:anchor` | `0` | `1 passed, 1 total` suite; `5 passed, 5 total` tests (`5.536 s`). |
| **E2E: Spine** | `cd backend; npm run test:e2e:spine` | `0` | `1 passed, 1 total` suite; `5 passed, 5 total` tests (`4.333 s`). |

### 4.2 Already-Broken Suites (Pre-Existing Failures)
1. **`backend/tools/independent-verifier` (`cd backend/tools/independent-verifier; npm test`) — `EXIT 1` (FAILED):**
   - **Summary:** `Test Suites: 1 failed, 1 total`; `Tests: 1 failed, 7 passed, 8 total` (`2.108 s`).
   - **Failing Case:** `verifyPackageDirectory > produces CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED for a valid, self-consistent, mock-witnessed package` (`tests/verify.spec.ts:97`).
     - `Expected: "CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED"`
     - `Received: "FAILED"`
   - **Impact:** Directly blocks `REQ-033` / `WF-09` offline evidence verification claims until fixed before new email work begins.

2. **`shield-core` E2E (`cd backend; npm run test:e2e:core`) — `EXIT 1` (FAILED — Not Run by `.github/workflows/backend-ci.yml`):**
   - **Summary:** `Test Suites: 1 failed, 1 passed, 2 total`; `Tests: 13 failed, 5 passed, 18 total` (`31.67 s`), plus Jest forced exit warning (`A worker process has failed to exit gracefully`).
   - **Root Cause:** `apps/shield-core/test/app.e2e-spec.ts` `beforeAll` hook (line `91`) exceeded the `5000 ms` timeout while `KafkaProducerService.onModuleInit` (`apps/shield-core/src/kafka/kafka-producer.service.ts:132`) attempted to connect to `localhost:9092` without a running Kafka broker or mock in `app.e2e-spec.ts`.
   - **Failing Tests (`1`–`13` in `ShieldCore Application Endpoints (e2e)`):**
     1. `GET / (Health check)`
     2. `POST /api/v1/commercial/accounts (Create commercial account)`
     3. `GET /api/v1/commercial/accounts/comm-1 (Get commercial account)`
     4. `POST /api/v1/commercial/entitlements (Issue entitlement)`
     5. `GET /api/v1/commercial/entitlements (List tenant entitlements)`
     6. `GET /api/v1/commercial/entitlements/check (Check entitlement)`
     7. `GET /api/v1/commercial/claims/check (Check claim eligibility)`
     8. `POST /api/v1/catalog/versions (Create catalog version)`
     9. `GET /api/v1/catalog/products (List approved catalog products)`
     10. `POST /api/v1/commerce/contracts (Create contract)`
     11. `PATCH /api/v1/commerce/contracts/cnt-1/transition (Transition contract status)`
     12. `POST /api/v1/obligations (Create service obligation)`
     13. `POST /api/v1/billing/invoices (Create draft invoice)`
   - **Note:** `.github/workflows/backend-ci.yml` only runs `test:e2e:action`, `test:e2e:ai`, `test:e2e:anchor`, and `test:e2e:spine` (omitting `test:e2e:core`). Also note that the passing benchmark/performance suite inside `test:e2e:core` updated `backend/apps/shield-core/test/baseline-results.json` in the working tree as a runtime test output (`git checkout` could not revert it inside the read-only `.git/` sandbox; zero source files were modified).

### 4.3 Blocked Environment-Dependent Checks (Not Executed — Missing Disposable Postgres Env)
1. **RLS Tenant Isolation Suite (`cd backend; npm run test:rls`) — `EXIT 1` (BLOCKED):**
   - Fails immediately in `apps/shield-core/test/tenant-isolation.rls-spec.ts:27` (`0 total` tests run, `1.667 s`): `RLS_TEST_DATABASE_URL is required: a disposable, migrated database (npm run migrate:deploy)`.
2. **Prisma Schema Drift Check (`cd backend; npm run check:schema-drift`) — `EXIT 1` (BLOCKED):**
   - Fails immediately in `backend/scripts/check-schema-drift.js:18`: `Error: SHADOW_DATABASE_URL is required (a disposable database)`.

---

## 5. Summary of Pre-Existing Regressions to Fix or Track Before Feature Implementation
1. Repair `backend/tools/independent-verifier` (`tests/verify.spec.ts:97`) so valid mock-witnessed evidence bundles pass verification instead of returning `"FAILED"`.
2. Mock/disable real Kafka connections (or supply an ephemeral broker test harness) in `apps/shield-core/test/app.e2e-spec.ts` so `test:e2e:core` does not hang on `localhost:9092` and fail all `13` tests in `app.e2e-spec.ts`.
3. Provision `RLS_TEST_DATABASE_URL` and `SHADOW_DATABASE_URL` (CI/local Postgres) so RLS tenant isolation (`test:rls`) and schema drift (`check:schema-drift`) actually execute.
4. Resolve the `7` React Hook lint warnings in `frontend/src/` and evaluate removing `eslint: { ignoreDuringBuilds: true }` from `frontend/next.config.ts:5-7`.
5. Track the `758` backend ESLint warnings separately so new `email-security` code enforces zero-warning lint hygiene.
