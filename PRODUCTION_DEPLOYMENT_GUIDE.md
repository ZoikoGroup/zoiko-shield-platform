# ZoikoShield — Production Deployment Guide

This guide documents the production service topology, automated deployment workflow, migration/startup order, verification commands, and rollback procedure for `https://app.zoikoshield.com` and `https://api.zoikoshield.com`.

---

## 1. Service Topology & Port Map (Aligned with `docker-compose.yml` & `DEPLOY.md`)

| Service | Port | Upstream Env Key(s) | Role |
|---|---|---|---|
| `frontend` | `3000` | — | Next.js web application and `/api/v1/[...slug]` BFF proxy |
| `shield-core` | `3001` | `SHIELD_CORE_BASE_URL`, `SHIELD_CORE_URL` | Core API gateway, auth/JWT/cookies, RBAC, Cedar policy engine, notifications, evidence |
| `shield-ingest` | `3002` | `SHIELD_INGEST_BASE_URL`, `SHIELD_INGEST_URL` | Connector catalog, workspace isolation, telemetry ingestion, OCSF normalization, DLQ |
| `shield-ai` | `3003` | `SHIELD_AI_BASE_URL`, `SHIELD_AI_URL` | AI incidents, RCA, drift monitoring, supply chain risk, threat hunting copilot |
| `shield-action` | `3004` | — | Containment orchestration |
| `shield-anchor` | `3005` | `SHIELD_ANCHOR_BASE_URL` | Merkle cryptographic ledger |

---

## 2. Environment Configuration Notes

Refer to `.env.example`, `frontend/.env.example`, and `DEPLOY.md` for the full host variable template. Ensure the following timeout controls added for production stability are set appropriately if defaults are overridden:
- `AI_PROVIDER_TIMEOUT_MS` — timeout for external Gemini/OpenAI HTTP calls in `shield-ai` (defaults to `9000` ms).
- `SHIELD_AI_TIMEOUT_MS` — `shield-core` -> `shield-ai` internal request timeout (defaults to `10000` ms).
- `SHIELD_INGEST_TIMEOUT_MS` — `shield-core` -> `shield-ingest` internal request timeout.
- `SHADOW_DATABASE_URL` — required in CI / isolated DB check environments when running `npm --prefix backend run check:schema-drift`.

---

## 3. Automated Production Deploy Pipeline (`.github/workflows/deploy-vm.yml`)

Deployments to the GCP VM trigger automatically on push to branch `main` or `Aditya` when changes match:
- `backend/**`
- `frontend/**`
- `docker-compose.yml`
- `.github/workflows/deploy-vm.yml`

The GitHub Actions workflow executes on the VM:
1. `~/deploy-zoikoshield.sh backend`
2. `~/deploy-zoikoshield.sh frontend`

> **Important:** Commits editing only root documentation files (`*.md`) will not trigger `.github/workflows/deploy-vm.yml` by themselves; pushing the modified `backend/` and `frontend/` changes on branch `Aditya` will trigger both backend and frontend VM deployments.

---

## 4. Manual / Host-Side Build, Migration & Restart Sequence

### A. Pre-Deploy Verification Commands
```bash
# Backend checks and multi-app NestJS build (7 apps)
npm --prefix backend run swagger:check
npm --prefix backend run access:check
npm --prefix backend run check:ungrounded-terms
npm --prefix backend run check:capability-claims
npm --prefix backend run check:evidence-index
npm --prefix backend run build
npm --prefix backend test -- --runInBand

# Frontend lint, typecheck, production Next.js build, and unit tests
npm --prefix frontend run lint
npm --prefix frontend exec tsc -- -p frontend/tsconfig.json --noEmit
npm --prefix frontend run build
npm --prefix frontend run test
```

### B. Database Migration & Startup Order (`DEPLOY.md`)
Always run database migrations before starting application containers:
```bash
npm --prefix backend run migrate:deploy
```

Restart services in strict dependency order to avoid connection-refused races (`DEPLOY.md` lines 102–123):
1. **Infrastructure Tier:** PostgreSQL -> Redis -> Object Storage (MinIO / S3)
2. **Core Security Spine:** `shield-core` (Port `3001`)
3. **Specialized Worker Services:** `shield-ingest` (`3002`), `shield-ai` (`3003`), `shield-action` (`3004`), `shield-anchor` (`3005`)
4. **Frontend Web Tier:** `frontend` Next.js Web Server (Port `3000`)

---

## 5. Post-Deploy Production Verification & Operator Provisioning

1. **Run the production smoke test against the live URL** (supplying valid credentials via environment rather than hardcoding secrets):
   ```bash
   node scripts/smoke-test.js https://app.zoikoshield.com
   ```
2. **Verify previously failing live routes return expected 2xx responses:**
   - `GET https://api.zoikoshield.com/health` (`200 OK`)
   - `GET https://app.zoikoshield.com/api/v1/policies`
   - `GET https://app.zoikoshield.com/api/v1/ai/drift`
   - `GET https://app.zoikoshield.com/api/v1/notifications/deliveries`
   - `GET https://app.zoikoshield.com/api/v1/context/assets/resolution-decisions`
   - `GET https://app.zoikoshield.com/api/v1/evidence`
3. **Provision missing production admin/analyst roles host-side (if not yet seeded):**
   ```bash
   npm --prefix backend run seed:platform-admin -- "<super-admin-email>" "<strong-password>"
   npm --prefix backend run check:platform-admin -- "<super-admin-email>"
   ```
   See `PRODUCTION_ROLE_BASED_CREDENTIALS_GUIDE.md` for creating `TENANT_ADMIN` and `TENANT_SECURITY_ANALYST` accounts.

---

## 6. Rollback Procedure

If a production deployment introduces regressions:
1. Check out or revert to the previous known-good commit (for example `90d5edb` prior to this patch set, or `git revert <bad-commit>`) on branch `Aditya`.
2. Push the revert commit to trigger `.github/workflows/deploy-vm.yml` (`~/deploy-zoikoshield.sh backend` and `~/deploy-zoikoshield.sh frontend`), or run `~/deploy-zoikoshield.sh` directly on the GCP VM after checking out the previous tag/commit.
3. Re-verify `GET https://api.zoikoshield.com/health` and run `node scripts/smoke-test.js https://app.zoikoshield.com`.
