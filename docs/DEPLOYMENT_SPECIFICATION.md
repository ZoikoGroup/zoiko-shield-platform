# ZoikoShield Platform — Deployment Specification & Architecture Document

**Author:** ZoikoShield Core Engineering Team  
**Audience:** DevOps / SRE / Cloud Infrastructure Leads (Akshay Uppar, Vishwajeet Singh Chauhan)  
**Version:** 1.0.0 (Production & Staging Target)  
**Target Repository:** `ZoikoGroup/zoiko-shield-platform`  
**Target Branch:** `Aditya`  
**Date:** September 23, 2026  

---

> **UPDATE (2026-09-24) — key management and evidence storage are now Google Cloud.**
> Signing moved from AWS KMS to **Cloud KMS**, and evidence storage from the S3
> client to the **native Cloud Storage** API. `@aws-sdk/client-kms` is no longer
> a dependency. The S3 client remains only for MinIO in non-production.
> For a GCP deployment, follow **`docs/GCP_DEPLOYMENT_GUIDE.md`**, which covers
> the Cloud KMS keys, the evidence bucket and the service accounts. The
> environment reference in §6 below is corrected for this; the rest of this
> document still describes the generic container topology accurately.

## 1. Executive Summary & Staging Guidance

ZoikoShield is an enterprise cyber defense, compliance ledger, and continuous assurance platform built on a distributed microservices architecture.

### ⚠️ Critical SRE Notice: R2+ Live Response Actions Fail-Closed
* **Intentional Safety Gate:** Live R2+ automated response actions (e.g. actual AWS IAM credential revocation, Microsoft Entra account suspension, EDR host isolation, Cloudflare/AWS WAF IP blocking) are **strictly disabled in code**.
* **Simulation Only:** If an operator triggers an action from the UI, the platform executes an **R1 pre-flight dry-run simulation** and generates an execution preview receipt, but will deliberately refuse live mutation with a `403 Forbidden (G1 Release Gate has not been formally ratified)` error.
* **Not a Bug:** This is the intentional safety design mandated by Master Build Plan §2, §18, and Rule G1-01. Live mutation will only be enabled after all 8 designated domain leads physically sign the G1 launch gate.

### 💡 Staging Resource Strategy: Deploy Backend Microservices First
* If deploying in an environment with resource constraints (e.g., single VM or limited staging cluster), **deploy the Backend microservices stack first**.
* The backend is fully testable independently via its REST APIs, Kafka streams, and Swagger documentation, and has the verified 397-suite test harness backing it. The Next.js frontend is a thin client that consumes `shield-core`.

---

## 2. Architecture & Microservices Breakdown

```
                            ┌──────────────────────────────────┐
                            │    Ingress / Reverse Proxy       │
                            │   (Nginx / Traefik / AWS ALB)    │
                            └────────────────┬─────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
            ┌──────────▼──────────┐                     ┌──────────▼──────────┐
            │ Frontend (Port 3000)│                     │ shield-core (3001)  │
            │ Next.js 15 Web App  │                     │ API Gateway / Auth  │
            └─────────────────────┘                     └──────────┬──────────┘
                                                                   │
                                ┌──────────────────────────────────┼──────────────────────────────────┐
                                │                                  │                                  │
                     ┌──────────▼──────────┐            ┌──────────▼──────────┐            ┌──────────▼──────────┐
                     │ shield-ingest (3002)│            │  shield-ai (3003)   │            │ shield-action (3004)│
                     │ OCSF Log Processing │            │ AI Safety & Copilot │            │ Response Dispatcher │
                     └──────────┬──────────┘            └──────────┬──────────┘            └──────────┬──────────┘
                                │                                  │                                  │
                                └──────────────────────────────────┼──────────────────────────────────┘
                                                                   │
                                                        ┌──────────▼──────────┐
                                                        │shield-anchor (3005) │
                                                        │ Merkle / Cloud KMS  │
                                                        └──────────┬──────────┘
                                                                   │
     ══════════════════════════════════════════════════════════════╪══════════════════════════════════════════════════════════
                                                   Backing Data & Infrastructure
     ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
      • PostgreSQL 16 (Port 5432)  • Redis 7 (Port 6379)  • Kafka/Redpanda (Port 9092)  • S3/MinIO (Port 9000/9001)
```

---

## 3. Service Matrix & Port Mapping

| Service Name | Source Path | Runtime / Framework | Exposed Port | Purpose & Primary Responsibilities | Health Check URL |
|---|---|---|---|---|---|
| **`zoikoshield-frontend`** | `frontend/` | Node 20+, Next.js 15, React 19, TailwindCSS | `3000` | Security Operations Center UI, Compliance Audit Dashboard, Admin Console, Sector Defense Packs | `GET /` |
| **`shield-core`** | `backend/apps/shield-core` | Node 20+, NestJS, Prisma | `3001` | Public API Gateway, Session & SSO Auth, RBAC, Customer Billing, Ledger, R04 Requirements Register | `GET /health` |
| **`shield-ingest`** | `backend/apps/shield-ingest` | Node 20+, NestJS | `3002` | High-throughput OCSF telemetry ingestion, Webhooks, Normalization, Quarantine Replay | `GET /health` |
| **`shield-ai`** | `backend/apps/shield-ai` | Node 20+, NestJS | `3003` | Threat Hunting, Decision Review Envelopes, Population Stability Index (PSI) Drift Monitoring | `GET /health` |
| **`shield-action`** | `backend/apps/shield-action` | Node 20+, NestJS | `3004` | Security response action dispatcher, Two-Man Rule Quorum approvals, JIT elevation (Simulation mode active) | `GET /health` |
| **`shield-anchor`** | `backend/apps/shield-anchor` | Node 20+, NestJS | `3005` | Merkle Epoch Checkpoint Sealing, Cloud KMS signing, ML-DSA-65 + ECDSA dual-signing (not FIPS-validated) | `GET /health` |
| **`verifier-cli`** | `backend/apps/verifier-cli` | Node 20+ standalone CLI | CLI | Standalone offline cryptographic audit package verification tool | N/A |

---

## 4. Backing Data Stores & Middleware

| Middleware | Image / Version | Port | Storage Requirement | Description |
|---|---|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | `5432` | Persistent Volume (~50 GB min) | Master relational store for tenants, identities, audit events, contracts, and R04 requirements. |
| **Redis** | `redis:7-alpine` | `6379` | In-memory / Optional AOF | Distributed session tokens, caching, rate limiting, and temporary locks. |
| **Redpanda / Kafka** | `redpandadata/redpanda:v24.2.7` | `9092` (Kafka), `8082` (Proxy) | Persistent Volume (~50 GB min) | Asynchronous event streaming for security telemetry, alerts, and audit batch jobs. |
| **Object storage** | Cloud Storage in production; `minio/minio:latest` for non-production | `9000` (API), `9001` (Console) for MinIO | Object Storage (WORM via per-object retention) | Immutable evidence storage, forensic snapshots, and exported audit packages. |
| **OpenSearch** *(Optional)* | `opensearchproject/opensearch:2.17.0` | `9200` | Persistent Volume | Fast full-text and hot analytics projection search. |

---

## 5. Deployment Options

### Option 1: Docker Compose (Recommended for Dev / Staging VM)

A complete production-ready `docker-compose.yml` is included in the workspace root.

```bash
# 1. Clone repository & checkout Aditya branch
git clone https://github.com/ZoikoGroup/zoiko-shield-platform.git
cd zoiko-shield-platform
git checkout Aditya

# 2. Configure environment file
cp .env.example .env
# Edit .env with production passwords and secrets

# 3. Launch the full stack
docker compose up -d --build

# 4. Check status
docker compose ps
curl http://localhost:3001/health
```

### Option 2: Kubernetes Manifests (Production EKS / GKE / AKS)

Base Kubernetes definitions are located in `infrastructure/k8s/base/`:
* `shield-services.yaml`: Pod Deployments, ClusterIP Services, and Resource Limits.
* `network-policies.yaml`: Sovereign Cell network fencing and inter-service isolation.

### Option 3: Separate Frontend & Backend Cluster
* **Frontend:** Can be deployed to AWS Amplify, Vercel, Cloudflare Pages, or Docker container with `PORT=3000` and `NEXT_PUBLIC_API_URL=https://api.shield.zoiko.com`.
* **Backend Microservices:** Can be deployed to an ECS / EKS / VM cluster behind an Application Load Balancer.

---

## 6. Complete Environment Variable Reference

### A. Infrastructure & Shared Secrets
```bash
NODE_ENV=production
DATABASE_URL=postgres://shield:YOUR_SECURE_PASSWORD@postgres-host:5432/shield_core
REDIS_URL=redis://redis-host:6379
KAFKA_BROKERS=kafka-host:9092

# Evidence storage. With both of these set, evidence goes to Cloud Storage
# through the native API. The bucket MUST have been created with per-object
# retention enabled — it cannot be retrofitted.
GOOGLE_CLOUD_PROJECT=your-gcp-project
EVIDENCE_GCS_BUCKET=zoiko-shield-evidence-worm
EVIDENCE_GCS_LOCATION=US
# Only outside GCP. On Cloud Run and GKE the attached service account supplies
# credentials to the KMS and Storage clients, and no key file is needed.
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

# Non-production only: MinIO through the S3 client, used when the two
# Cloud Storage variables above are unset.
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=your_minio_access_key
S3_SECRET_KEY=your_minio_secret_key
EVIDENCE_S3_BUCKET=zoiko-shield-evidence-worm
```

### A2. Cloud KMS signing keys

Asymmetric signing takes a key **version** resource name; subject-key wrapping
takes a crypto **key** name. See `docs/GCP_DEPLOYMENT_GUIDE.md` §0 for the
`gcloud` commands and IAM roles.

```bash
ANCHOR_KMS_KEY_VERSION=projects/P/locations/L/keyRings/R/cryptoKeys/anchor-checkpoint/cryptoKeyVersions/1
COLLECTOR_KMS_KEY_VERSION=projects/P/locations/L/keyRings/R/cryptoKeys/evidence-collector/cryptoKeyVersions/1
ACTION_COMMAND_KMS_KEY_VERSION=projects/P/locations/L/keyRings/R/cryptoKeys/action-command/cryptoKeyVersions/1
SUBJECT_KEY_KMS_KEY_NAME=projects/P/locations/L/keyRings/R/cryptoKeys/subject-key-wrapping
```

### B. Gateway & Authentication (`shield-core`)
```bash
PORT=3001
JWT_SECRET=replace_with_64_character_cryptographically_secure_random_string
JWT_EXPIRES_IN=15m
JWT_ISSUER=zoikoshield
JWT_AUDIENCE=zoikoshield-api
SSO_PUBLIC_BASE_URL=https://api.shield.zoiko.com
SSO_APP_BASE_URL=https://shield.zoiko.com
APP_BASE_URL=https://shield.zoiko.com
CORS_ORIGIN=https://shield.zoiko.com
WORKLOAD_IDENTITY_DEV_SECRET=replace_with_secure_workload_signing_secret
SHIELD_INGEST_BASE_URL=http://shield-ingest:3002
SHIELD_AI_BASE_URL=http://shield-ai:3003
SHIELD_ACTION_BASE_URL=http://shield-action:3004
SHIELD_ANCHOR_BASE_URL=http://shield-anchor:3005
```

### C. Ingestion Service (`shield-ingest`)
```bash
PORT=3002
SHIELD_CORE_BASE_URL=http://shield-core:3001
WORKLOAD_IDENTITY_DEV_SECRET=same_workload_signing_secret
WEBHOOK_HMAC_SECRET=your_connector_hmac_secret
```

### D. AI & Action Services (`shield-ai` & `shield-action`)
```bash
# shield-ai (Port 3003)
PORT=3003
OPENAI_API_KEY=your_openai_or_azure_key
GEMINI_API_KEY=your_gemini_api_key

# shield-action (Port 3004)
PORT=3004
DEV_SIMULATION_SIGNING_KEY=simulation_signing_key
```

### E. Frontend (`zoikoshield-frontend`)
```bash
PORT=3000
NEXT_PUBLIC_API_URL=https://api.shield.zoiko.com
NEXT_PUBLIC_APP_ENV=production
```

---

## 7. Quality Assurance & Automated Verification Status

The codebase has undergone full continuous integration and static analysis validation:
* **Backend Jest Test Suites:** **397 / 397 passed (1,905 tests, 100% green)**.
* **Frontend Vitest Test Suites:** **5 / 5 passed (39 tests, 100% green)**.
* **TypeScript Compilation:** **7 / 7 build targets clean (0 errors)**.
* **OpenAPI / Swagger Contract:** **100% controller operation coverage verified (`npm run swagger:check`)**.
* **Ungrounded Terminology Static CI Linter:** **0 violations across 1,433 source files**.
* **Public Capability & GTM Claims:** **All 12 customer-facing services and 7 capability domains verified**.

---

## 8. SRE / Infrastructure Checklist for Akshay Uppar

- [ ] **Compute Provisioning:** Allocate 1 VM (min 4 vCPUs, 16 GB RAM, 100 GB SSD) or EKS/ECS Cluster.
- [ ] **DNS & SSL Certificates:**
  - `shield.zoiko.com` $\rightarrow$ Points to Frontend (Port 3000).
  - `api.shield.zoiko.com` $\rightarrow$ Points to Shield Core API (Port 3001).
- [ ] **Database Migration:** Automatic on launch via `shield-core-migrate` container (`npm run migrate:deploy`: Prisma migrations, then the database access policy).
- [ ] **Firewall & Security Groups:** Expose only Ports `80/443` to the public internet; keep Ports `3002-3005`, `5432`, `6379`, and `9092` internal only.
