# ZoikoShield Platform — Production Deployment Runbook (`DEPLOY.md`)

This guide specifies the exact, reproducible steps to deploy, migrate, restart, verify, and roll back the ZoikoShield Platform (`https://app.zoikoshield.com` and `https://api.zoikoshield.com`).

---

## 1. Required Production Environment Variables

### Backend (`shield-core` & Microservices)
Set these variables in your deployment environment (Kubernetes Secrets / ECS / Systemd / `.env`):

| Variable | Production Value / Pattern | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production security checks and strict assertions |
| `PORT` | `3001` (or service-specific 3001-3005) | HTTP listen port |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/zoikoshield?sslmode=require` | PostgreSQL connection string |
| `JWT_SECRET` | `[min 32-char high-entropy string]` | Signs customer and admin session tokens |
| `JWT_REFRESH_SECRET` | `[min 32-char high-entropy string]` | Signs session refresh tokens |
| `CORS_ORIGIN` | `https://app.zoikoshield.com` | Exact allowed origins (comma-separated if multiple) |
| `TRUST_PROXY` | `true` (or integer count of hops) | Trusts Cloudflare / reverse proxy `X-Forwarded-For` |
| `COOKIE_SECURE` | `true` | Enforces `Secure` flag on auth cookies over HTTPS |
| `WORKLOAD_IDENTITY_PRIVATE_KEY_PEM` | `-----BEGIN RSA PRIVATE KEY-----...` | Signs workload identity tokens between services |
| `WORKLOAD_IDENTITY_PUBLIC_KEY_PEM` | `-----BEGIN PUBLIC KEY-----...` | Verifies workload identity tokens |
| `SERVICE_NAME` | `shield-core` | Identifies service instance in logs and metrics |
| `CONNECTOR_SECRET_KMS_KEY` | `projects/<p>/locations/<l>/keyRings/<r>/cryptoKeys/<k>` | **shield-ingest, required.** Cloud KMS key that wraps the data key of each per-connector webhook signing secret. Without it, webhook connectors cannot be created and existing ones cannot be verified |
| `WEBHOOK_GATEWAY_RATE_LIMIT_PER_MINUTE` | `1200` | **shield-core.** Per-client-IP limit on the public webhook route (`/api/v1/ingestion/webhooks/*`). Senders such as GitHub share address ranges, so it is higher than the default API limit |
| `WEBHOOK_SECRET_ROTATION_GRACE_HOURS` | `24` | Hours a rotated-out webhook secret keeps verifying, so senders can be updated |

### Inbound webhooks
External tools (GitHub, Okta, custom scripts) post signed events to **shield-core**, which relays them to shield-ingest:

```
POST https://api.zoikoshield.com/api/v1/ingestion/webhooks/<connector id>
```

- No session is needed; the connector's HMAC signature is the authentication, and shield-ingest verifies it. shield-core forwards the raw body and only the signature headers, never `Authorization`, cookies or `x-tenant-id`.
- shield-ingest (port 3002) stays private. Do not expose it, and do not add an ingest hostname.
- Each connector has its own signing secret (see `CONNECTOR_SECRET_KMS_KEY` above), shown once in the connector's panel.
- Your reverse proxy / WAF must pass the request body and the `x-webhook-*`, `x-signature*`, `x-hub-signature-256` and `x-github-*` headers through unchanged, and must not buffer-and-rewrite the JSON.

### Frontend (Next.js SSR / App)
Set these variables before executing `npm run build`:

| Variable | Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production React optimization |
| `SHIELD_CORE_URL` | `https://api.zoikoshield.com` | Internal or upstream backend URL for proxying |
| `NEXT_PUBLIC_API_URL` | `https://api.zoikoshield.com` | Target API base URL |
| `NEXT_PUBLIC_DEMO_FALLBACK` | `false` | Disables fabricated mock responses in production |
| `BACKEND_PROXY_TIMEOUT_MS` | `15000` | Gateway timeout for upstream microservice requests |
| `NEXT_PUBLIC_INGEST_PUBLIC_URL` | _(unset)_ | Optional. Address shown to users as the webhook URL. Defaults to `NEXT_PUBLIC_API_URL`, so in production webhooks are sent to `https://api.zoikoshield.com/api/v1/ingestion/webhooks/<connector id>` with no extra hostname. Set only to publish on a different address. Build-time |

---

## 2. Database Migration Procedure

All schema migrations are version-controlled via Prisma and reconciled TypeORM baselines. Never apply uncommitted ad-hoc SQL in production.

```bash
# 1. Navigate to backend directory
cd backend

# 2. Reconcile baseline schema if migrating from legacy TypeORM tables
node scripts/reconcile-typeorm-baseline.js

# 3. Generate the latest Prisma client
npx prisma generate

# 4. Apply all pending migrations safely
npx prisma migrate deploy

# 5. Verify database status
npx prisma migrate status
```

---

## 3. Build Commands

### Backend Build
Build all microservices or targeted apps:

```bash
cd backend
npm ci --no-audit --no-fund

# Build core and microservices
npx nest build shield-core
npx nest build shield-ingest
npx nest build shield-action
npx nest build shield-anchor
npx nest build shield-ai
```

### Frontend Build
Build the optimized Next.js production bundle:

```bash
cd frontend
npm ci --no-audit --no-fund

# Clean previous build artifacts
rm -rf .next

# Build production bundle (with production env vars populated)
NEXT_PUBLIC_DEMO_FALLBACK=false \
SHIELD_CORE_URL=https://api.zoikoshield.com \
NEXT_PUBLIC_API_URL=https://api.zoikoshield.com \
npm run build
```

---

## 4. Service Startup & Restart Sequence

To prevent connection refused errors or missing dependency races, always restart in this strict order:

1. **Infrastructure Tier**:
   - PostgreSQL (Primary & Read Replicas)
   - Redis Cluster / Sentinel
   - Object Storage (MinIO / S3 Vault)
2. **Core Security Spine**:
   - `shield-core` (Port 3001) — initializes database pools, Cedar policy engines, and JWT validation.
3. **Specialized Worker Services**:
   - `shield-ingest` (Port 3002) — telemetry stream receivers
   - `shield-action` (Port 3003) — containment orchestration
   - `shield-anchor` (Port 3004) — Merkle cryptographic ledger
   - `shield-ai` (Port 3005) — reasoning & threat hunting models
   - `shield-ai` (Port 3003) — reasoning & threat hunting models
   - `shield-action` (Port 3004) — containment orchestration
   - `shield-anchor` (Port 3005) — Merkle cryptographic ledger
4. **Frontend Web Tier**:
   - Next.js Web Server (Port 3000)

```bash
# Example systemd / docker-compose reload:
systemctl restart postgresql redis
systemctl restart shield-core
sleep 5
systemctl restart shield-ingest shield-action shield-anchor shield-ai
sleep 5
systemctl restart shield-frontend
```

---

## 5. Post-Deployment Verification (Smoke Test)

Immediately after restarting services, execute the automated smoke test suite against both the public ingress and the API endpoint:

```bash
# Run against the frontend ingress:
node scripts/smoke-test.js https://app.zoikoshield.com

# Run against the backend directly:
node scripts/smoke-test.js https://api.zoikoshield.com
```

The smoke test validates:
- Core platform `/health` status (200 OK)
- Authentication login flow (JWT token and tenant binding)
- Real-time alerts feed retrieval (`/api/v1/alerts`)
- In-app notification delivery feed (`/api/v1/notifications`)
- Commercial plan tier recommendation calculation (`/api/v1/commercial/plans/recommend`)
- AI incident feed integrity (`/api/v1/ai/incidents`)
- Tenant boundary isolation enforcement (rejecting cross-tenant tampering with 403 Forbidden)

---

## 6. Rollback Runbook

If a critical blocker is detected post-deployment:

### 1. Traffic Drainage / Canary Switch
If using blue/green deployment or Cloudflare load balancing, immediately divert 100% of traffic back to the prior stable target:
```bash
# E.g. Cloudflare / Nginx upstream switch
# Route traffic to the previous healthy container pool
```

### 2. Frontend Rollback
```bash
# Revert to previous release artifact or git SHA
git checkout <PREVIOUS_STABLE_SHA> frontend/
cd frontend && npm run build
systemctl restart shield-frontend
```

### 3. Backend Code Rollback
```bash
git checkout <PREVIOUS_STABLE_SHA> backend/
cd backend
npx nest build shield-core
systemctl restart shield-core
```

### 4. Database Schema Rollback (if schema change is non-backward-compatible)
Prisma migrations are forward-only by default. If a migration broke production:
```bash
cd backend
# Mark broken migration as rolled back in Prisma migration table
npx prisma migrate resolve --rolled-back <MIGRATION_NAME>
# Apply manual rollback SQL script from backend/prisma/migrations/<MIGRATION_NAME>/down.sql
```

