# ZoikoShield — Production & Pre-Deploy End-to-End Test Report

**Target Production URLs:** `https://app.zoikoshield.com` | `https://api.zoikoshield.com`  
**Local Working Tree Branch:** `Aditya` (on top of `90d5edb`)

---

## 1. Live Production Probes (Observed Against Currently Deployed VM Build)

These checks ran directly against `https://api.zoikoshield.com` and `https://app.zoikoshield.com` before pushing the local patch set.

| Target / Check | Method & Endpoint | Observed Result | Status / Notes |
|---|---|---|---|
| Backend Health | `GET https://api.zoikoshield.com/health` | `200 OK`, `content-encoding=gzip`, `{"status":"healthy","service":"shield-core",...}` | **PASS** |
| Production Login | `POST https://app.zoikoshield.com/api/v1/auth/login` (`aditya@zoiko.com`) | `201 Created` (`tenantId: 9d3f32ac-b8e3-454d-8275-914861befc45`, `environmentId: 606ca1dd-1f6b-401e-aabd-db4ca4594038`, `region: ap-south-1`, `sessionState: ACTIVE`) | **PASS** |
| Role Seed Inspection | `GET /api/v1/roles?tenantId=9d3f32ac-b8e3-454d-8275-914861befc45` | `200 OK` (12 seeded roles returned) | **PASS** |
| Workspace Members | `GET /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/members` | `200 OK` (1 active `BOOTSTRAP` `TENANT_OWNER`: `aditya@zoiko.com`) | **PASS** |
| Pending Invitations | `GET /api/v1/tenants/9d3f32ac-b8e3-454d-8275-914861befc45/invitations` | `200 OK` (`[]`) | **PASS** |
| Production Smoke Script | `node scripts/smoke-test.js https://app.zoikoshield.com` | Exit `0` (`8 PASSED, 0 FAILED`) | **PASS** |
| Policies Read (Pre-Fix Live Build) | `GET /api/v1/policies` | `403` | **FAIL on live** (fixed locally in `onboarding.service.ts`; pending deploy) |
| AI Drift Baseline (Pre-Fix Live Build) | `GET /api/v1/ai/drift` | `503 AI_UNAVAILABLE` | **FAIL on live** (fixed locally in `model-drift-monitor.service.ts` & `shield-ai.client.ts`; pending deploy) |
| Notification Deliveries (Pre-Fix Live Build) | `GET /api/v1/notifications/deliveries` | `404` | **FAIL on live** (fixed locally in `notification.controller.ts` & `docs/swagger.yaml`; pending deploy) |
| Asset Resolution Decisions (Pre-Fix Live Build) | `GET /api/v1/context/assets/resolution-decisions` | `404` | **FAIL on live** (fixed locally in `security-context.controller.ts` & `docs/swagger.yaml`; pending deploy) |
| Evidence Collection (Pre-Fix Live Build) | `GET /api/v1/evidence` | `404` | **FAIL on live** (fixed locally in `evidence.controller.ts`, `evidence.service.ts`, `docs/swagger.yaml`; pending deploy) |

---

## 2. Backend Verification Results (Local Working Tree After Edits)

### A. Contract, Governance & Build Checks

| Command | Result | Details |
|---|---|---|
| `npm --prefix backend run swagger:check` | **PASS** (exit `0`) | `Swagger covers every customer and internal controller operation with an explicit security contract.` |
| `npm --prefix backend run access:check` | **PASS** (exit `0`) | `Every Shield Core controller operation has an explicit, non-contradictory access contract.` |
| `npm --prefix backend run check:ungrounded-terms` | **PASS** (exit `0`) | `0` ungrounded terms across `1857` source files |
| `npm --prefix backend run check:capability-claims` | **PASS** (exit `0`) | Passed cleanly |
| `npm --prefix backend run check:evidence-index` | **PASS** (exit `0`) | `35` rows checked, `5` artifacts exist |
| `npm --prefix backend run build` | **PASS** (exit `0`) | All `7` workspace apps built (`shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`, `shield-public-assistant`, `verifier-cli`) |
| `npm --prefix backend run check:schema-drift` | **FAIL locally** (exit `1`) | `Error: SHADOW_DATABASE_URL is required (a disposable database)` — no disposable shadow Postgres available locally; must pass in CI |

### B. Backend Jest Suites

| Run Scope | Command | Exact Result |
|---|---|---|
| Targeted Modified Regression Specs | `npm --prefix backend test -- connectors-proxy.controller.spec.ts connector-catalog onboarding-role-grants.spec.ts model-drift-monitor.service.spec.ts --runInBand` | **PASS** — `6` suites passed, `31/31` tests passed |
| Full Suite (Sandboxed) | `npm --prefix backend test -- --runInBand` | **496 passed, 2 failed, 498 total suites** (`2684 passed, 7 failed, 2691 total tests`). Both failed suites (`permissions.guard.http.spec.ts` [6 tests] & `g4-gate.guard.http.spec.ts` [1 test]) failed due to Windows sandbox blocking `127.0.0.1` loopback (`connect EACCES 127.0.0.1:...`). |
| HTTP Loopback Guard Specs (Unsandboxed) | `npm --prefix backend test -- permissions.guard.http.spec.ts g4-gate.guard.http.spec.ts --runInBand` | **PASS** — `2 passed, 2 total` suites (`7 passed, 7 total` tests) |

---

## 3. Frontend Verification Results (Local Working Tree After Final Edits)

| Check | Command | Exact Result |
|---|---|---|
| ESLint | `npm --prefix frontend run lint` | **PASS** (exit `0`, `7` non-blocking `react-hooks/exhaustive-deps` warnings) |
| TypeScript Check | `npm --prefix frontend exec tsc -- -p frontend/tsconfig.json --noEmit` | **PASS** (exit `0`) |
| Production Build | `npm --prefix frontend run build` (`next build`) | **PASS** (exit `0`, `60/60` routes built) |
| Unit & Component Tests | `npm --prefix frontend run test` (Vitest) | **PASS** (exit `0`, `27` test files, `221/221` tests passed; includes `api-proxy-auth.spec.ts`) |

---

## 4. Pending Post-Deploy Production Verification Items

The following items could not yet pass on live URLs because the patched working tree has not yet been committed, pushed to `Aditya`, and deployed to the GCP VM:

1. **Live Verification of Fixed Endpoints (`GET /api/v1/policies`, `/api/v1/ai/drift`, `/api/v1/notifications/deliveries`, `/api/v1/context/assets/resolution-decisions`, `/api/v1/evidence`):** Must be re-probed after GitHub Actions deployment finishes.
2. **Live Connector Lifecycle & OCSF Ingestion Click-Through:** Re-test connector creation, passive test status (`UNVERIFIED`), activation, and real telemetry ingestion on `https://app.zoikoshield.com` after deployment.
3. **CI Schema Drift Verification:** Confirm `npm run check:schema-drift` passes against CI's disposable `SHADOW_DATABASE_URL`.
4. **Role-Matrix Live Enforcement (`PLATFORM_SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_SECURITY_ANALYST`):** Blocked on live DB until those missing roles/users are provisioned using `PRODUCTION_ROLE_BASED_CREDENTIALS_GUIDE.md`.
