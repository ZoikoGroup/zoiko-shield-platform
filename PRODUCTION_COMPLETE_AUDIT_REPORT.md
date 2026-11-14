# ZoikoShield — Production Complete Audit Report

**Target Production URLs:** `https://app.zoikoshield.com` (Frontend) | `https://api.zoikoshield.com` (Backend Gateway)  
**Repository Base Commit Inspected:** `90d5edb` (`Merge pull request #145 from ZoikoGroup/fix/tsc-type-errors`, branch `Aditya`)  
**Live Deployment Status:** Changes below are **verified locally in the repository working tree**, while live probes confirmed the GCP VM is currently running the **pre-fix** commit and requires `git commit` + `git push origin Aditya` (triggering `.github/workflows/deploy-vm.yml`) to go live.

---

## 1. Executive Summary

End-to-end inspection of `https://app.zoikoshield.com`, `https://api.zoikoshield.com`, the Next.js proxy layer, and the NestJS microservices (`shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`) identified concrete root causes behind the reported **504 Gateway Timeout**, **400 Bad Request**, **503 Service Unavailable**, **404 Not Found**, **403 Permission Denied**, and **workspace connector ownership / ingestion** failures.

Live probing against production before deployment confirmed:
- `GET https://api.zoikoshield.com/health` returned `200 OK` (`{"status":"healthy","service":"shield-core",...}`, `content-encoding=gzip`).
- `POST https://app.zoikoshield.com/api/v1/auth/login` succeeded (`201`) for `aditya@zoiko.com` (`tenantId: 9d3f32ac-b8e3-454d-8275-914861befc45`, `environmentId: 606ca1dd-1f6b-401e-aabd-db4ca4594038`, `region: ap-south-1`).
- Several endpoints returned pre-fix errors on the currently deployed VM build:
  - `GET /api/v1/policies` -> `403` (missing policy permissions on `TENANT_OWNER` bootstrap role grants)
  - `GET /api/v1/ai/drift` -> `503 AI_UNAVAILABLE` (missing default drift baselines causing `404` masked as `503`)
  - `GET /api/v1/notifications/deliveries` -> `404` (missing controller route)
  - `GET /api/v1/context/assets/resolution-decisions` -> `404` (missing static route ordered before `:assetId`)
  - `GET /api/v1/evidence` -> `404` (missing collection `GET` route on `EvidenceController`)

---

## 2. Root Cause Analysis & Code Fixes Implemented

### A. 504 Gateway Timeout Root Causes & Fixes
1. **Unbounded SMTP Socket Connections:**
   - **Root Cause:** Nodemailer transports in `email-channel.service.ts`, `transactional-email.service.ts`, and `mail.service.ts` did not specify connection, greeting, or socket timeouts, allowing stalled SMTP relays to hang request workers past reverse-proxy timeouts. In addition, `MailService.sendOtp` could execute a duplicate SMTP dispatch even when `transactionalEmailService.dispatchTransactionalEmail` had already succeeded (`DELIVERED`).
   - **Fix:** Added `connectionTimeout: 5000`, `greetingTimeout: 5000`, and `socketTimeout: 8000` to all SMTP `createTransport` configurations across all three files, and short-circuited `sendOtp` in `backend/apps/shield-core/src/modules/identity-adapter/mail.service.ts` when `deliveryStatus === 'DELIVERED'`.
2. **Unbounded External AI Provider Calls:**
   - **Root Cause:** `fetch` calls in `gemini-model-provider.ts` and `openai-model-provider.ts` had no abort timeout.
   - **Fix:** Added `AbortSignal.timeout(Number(process.env.AI_PROVIDER_TIMEOUT_MS || 9000))` to upstream `fetch` requests in both providers.
3. **Unbounded Internal Service-to-Service Clients:**
   - **Root Cause:** `shield-ai.client.ts` and `shield-ingest.client.ts` lacked explicit request abort timeouts.
   - **Fix:** Added `SHIELD_AI_TIMEOUT_MS` (default `10000` ms) and `SHIELD_INGEST_TIMEOUT_MS` `AbortSignal.timeout` guards.

### B. 400 Bad Request & Frontend–Backend Contract Fixes
1. **Residency & Environment Context Propagation:**
   - **Root Cause:** `Tenant` / `UserSession` types and login handlers did not propagate `environmentId` and `region` consistently to frontend API calls (`createConnector`, login, passkey login).
   - **Fix:** Updated `frontend/src/lib/types.ts`, `frontend/src/app/login/page.tsx`, and `frontend/src/lib/api-client.ts` to carry `environmentId` and `region` cleanly across session and connector requests.
2. **AI Governance, Incident, Drift & Copilot DTO/Envelope Mismatches:**
   - **Root Cause:** Frontend `ZoikoShieldApiClient` sent mismatched payloads or hit non-existent paths for AI incidents, model drift, supply-chain risk, posture drift, and threat hunting copilot.
   - **Fix:** Updated `frontend/src/lib/api-client.ts` to:
     - Map `getAiIncidents`, `declareAiIncident`, `containAiIncident`, `activateAiFallback`, `analyzeAiIncidentRca`, `resolveAiIncident`, and `closeAiIncident` to exact `shield-ai` DTOs (`DeclareAiIncidentDto`, `ContainIncidentDto`, `FallbackIncidentDto`, `CompleteRcaDto`, `ResolveIncidentDto`) and `{ statusCode, data }` envelopes.
     - Unwrap/normalize `{ statusCode, data }` envelopes in `getModelDriftMetrics` and `getAiSupplyChainRisk`.
     - Point `getComplianceDriftAssessment` to `GET /api/v1/assurance/posture-drift/findings` and `remediateComplianceDrift` to `POST /api/v1/assurance/posture-drift/remediate`.
     - Point `queryCopilot` to `POST /api/v1/ai/copilot/hunt` and normalize `ThreatHuntingReport` into `{ summary, envelope }`.
3. **Passive Connector Test Connection `400` False Failures:**
   - **Root Cause:** `ConnectorCatalogService.testConnector` (`backend/apps/shield-ingest/src/connectors/connector-catalog.service.ts`) threw `400 BadRequestException` when testing passive push/webhook/GitHub connectors instead of returning an honest unverified telemetry-wait status.
   - **Fix:** Updated `testConnector` so passive webhook/GitHub providers return `{ status: 'UNVERIFIED', ... }` instead of throwing `400 BadRequestException`; updated `frontend/src/app/connectors/console.tsx` to display `UNVERIFIED` test results cleanly.

### C. 503 Service Unavailable & Upstream Error Masking
1. **Error Masking in `ShieldAiClient`:**
   - **Root Cause:** `shield-ai.client.ts` collapsed upstream 4xx client errors from `shield-ai` into `503 AI_UNAVAILABLE`, hiding real validation/lookup errors and breaking client error handling.
   - **Fix:** Updated `aiError()` in `backend/apps/shield-core/src/internal-client/shield-ai.client.ts` to propagate upstream 4xx responses (`!== 401`) rather than masking them as `503`.
2. **Empty Baseline Drift State (`GET /api/v1/ai/drift` -> 404 -> 503):**
   - **Root Cause:** `ModelDriftMonitorService` (`backend/apps/shield-ai/src/drift-monitoring/model-drift-monitor.service.ts`) started with no registered baselines, causing drift queries to fail with `404` (masked as `503`).
   - **Fix:** Implemented `OnModuleInit` registering default baselines (`gemini-1.5-pro`, `gemini-1.5-flash`, `gpt-4o`) so `GET /api/v1/ai/drift` returns a valid `STABLE` baseline immediately after boot.

### D. Missing Routes, Auth Cookie Refresh & RBAC Permissions (403 / 404)
| Symptom | Root Cause | Fix & Location |
|---|---|---|
| `GET /api/v1/policies` -> `403` | `TENANT_OWNER_PERMISSION_CODES` omitted `POLICY_CONFIG_READ`, `POLICY_CONFIG_WRITE`, `POLICY_CONFIG_APPROVE`, `POLICY_CONFIG_ROLLBACK` | Added all 4 codes in `backend/apps/shield-core/src/modules/onboarding/onboarding.service.ts` |
| `POST /api/v1/connectors/:id/{activate,disable,heartbeat}`, `POST /api/v1/dlq/auto-retry`, `GET /api/v1/dlq/metrics` missing in proxy/gateway | Proxy controller and `ShieldIngestClient` lacked these methods | Added routes and client methods in `connectors-proxy.controller.ts`, `shield-ingest.client.ts`, and `docs/swagger.yaml` |
| `GET /api/v1/context/assets/resolution-decisions` -> `404` | No static handler before `@Get('assets/:assetId')` | Added `@Get('assets/resolution-decisions')` querying `prisma.resolutionDecision` (`entity_type: 'ASSET'`) in `security-context.controller.ts` + `docs/swagger.yaml` |
| `GET /api/v1/notifications/deliveries` -> `404` | Missing route in `NotificationController` | Added `@Get('notifications/deliveries')` before `@Get('notifications/templates')` in `notification.controller.ts` + `docs/swagger.yaml` |
| `GET /api/v1/evidence` -> `404` | `EvidenceController` lacked a root `@Get()` handler | Added `@Get()` + `listByTenant` (`orderBy: { created_at: 'desc' }`) in `evidence.controller.ts` / `evidence.service.ts` + `docs/swagger.yaml` |
| Cookie refresh not syncing access token cookies | `AuthController.refresh` did not re-set HTTP access token cookies | Updated `refresh` in `auth.controller.ts` to set `zoiko_shield_access_token` and `shield_access_token` cookies alongside returning `{ success: true, accessToken }` |

### E. Connector Lifecycle & Ingestion Error (`"This connector does not belong to your workspace."`)
1. **Hardcoded Non-Tenant Connector ID in Ingestion Console:**
   - **Root Cause:** `frontend/src/app/ingestion/console.tsx` hardcoded `"conn-webhook-gateway-01"` instead of loading connectors belonging to the signed-in user's workspace/tenant. When ingested in production, `shield-ingest` / `callerOwnsConnector` rejected the synthetic ID because it did not belong to the active workspace.
   - **Fix:** Updated `frontend/src/app/ingestion/console.tsx` to fetch real workspace connectors via `ZoikoShieldApiClient.getConnectors()` and display an actionable `ingestionError` banner linking to `/connectors` when none exist.
2. **Client-Only Mock Save in Connectors Console:**
   - **Root Cause:** `handleSaveConfiguredConnector` in `frontend/src/app/connectors/console.tsx` mocked connector creation client-side rather than persisting to `POST /api/v1/connectors`, and `region` was not synchronized from tenant residency (`state?.tenant?.dataResidencyRegion || state?.session?.region`).
   - **Fix:** Replaced the mock handler with `async ZoikoShieldApiClient.createConnector(...)`, synced `region` with tenant/session residency, and surfaced real backend validation errors.
3. **Cookie-Based Auth Rejected in Next.js Proxy Ownership Check:**
   - **Root Cause:** `callerOwnsConnector` in `frontend/src/app/api/v1/[...slug]/route.ts` checked Bearer `Authorization` only, breaking browser requests relying on HTTP-only auth cookies.
   - **Fix:** Updated `callerOwnsConnector` to accept Cookie-based authentication in addition to Bearer `Authorization`.

### F. Documentation Port Alignment
- Updated `DEPLOY.md` lines 110–112 so the specialized worker ports match `docker-compose.yml`: `shield-ai` (`3003`), `shield-action` (`3004`), `shield-anchor` (`3005`).

---

## 3. Complete Modified Files Inventory (Working Tree)

- Backend:
  - `backend/apps/shield-core/src/modules/notification/channels/email-channel.service.ts`
  - `backend/apps/shield-core/src/modules/notification/transactional-email.service.ts`
  - `backend/apps/shield-core/src/modules/notification/notification.controller.ts`
  - `backend/apps/shield-core/src/modules/identity-adapter/mail.service.ts`
  - `backend/apps/shield-core/src/modules/identity-adapter/auth.controller.ts`
  - `backend/apps/shield-core/src/internal-client/shield-ai.client.ts`
  - `backend/apps/shield-core/src/internal-client/shield-ingest.client.ts`
  - `backend/apps/shield-core/src/modules/connectors-proxy/connectors-proxy.controller.ts`
  - `backend/apps/shield-core/src/modules/security-context/security-context.controller.ts`
  - `backend/apps/shield-core/src/modules/onboarding/onboarding.service.ts`
  - `backend/apps/shield-core/src/modules/evidence/controllers/evidence.controller.ts`
  - `backend/apps/shield-core/src/modules/evidence/services/evidence.service.ts`
  - `backend/apps/shield-ingest/src/connectors/connector-catalog.service.ts`
  - `backend/apps/shield-ai/src/provider-registry/gemini-model-provider.ts`
  - `backend/apps/shield-ai/src/provider-registry/openai-model-provider.ts`
  - `backend/apps/shield-ai/src/drift-monitoring/model-drift-monitor.service.ts`
- OpenAPI Contract & Deployment Docs:
  - `docs/swagger.yaml`
  - `DEPLOY.md`
- Frontend:
  - `frontend/src/app/api/v1/[...slug]/route.ts`
  - `frontend/src/app/connectors/console.tsx`
  - `frontend/src/app/ingestion/console.tsx`
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/lib/api-client.ts`
  - `frontend/src/lib/types.ts`

---

## 4. Remaining Deployment Actions & Open Items

1. **Deploy Working Tree Changes to Production VM:**
   - Stage, commit, and push changes to branch `Aditya` so `.github/workflows/deploy-vm.yml` rebuilds and restarts `backend` and `frontend` on the production GCP VM, then re-run `node scripts/smoke-test.js https://app.zoikoshield.com` and verify previously failing live endpoints (`GET /api/v1/policies`, `GET /api/v1/ai/drift`, `GET /api/v1/notifications/deliveries`, `GET /api/v1/context/assets/resolution-decisions`, `GET /api/v1/evidence`) return `200 OK`.
2. **Existing Bootstrap Tenant Role Refresh:**
   - Once deployed, re-trigger or verify role permission grants for already-seeded `TENANT_OWNER` records so `POLICY_CONFIG_*` permissions are applied in live PostgreSQL.
3. **Seed Missing Role Accounts on Live DB:**
   - Live DB currently holds only `aditya@zoiko.com` (`TENANT_OWNER`). Run `seed:platform-admin` on the VM and create `TENANT_ADMIN` and `TENANT_SECURITY_ANALYST` accounts per `PRODUCTION_ROLE_BASED_CREDENTIALS_GUIDE.md`.
4. **Local Schema Drift Check Not Executed Locally:**
   - `npm --prefix backend run check:schema-drift` requires `SHADOW_DATABASE_URL` pointing to a disposable Postgres database (validated by CI, not present on the local Windows workstation).
