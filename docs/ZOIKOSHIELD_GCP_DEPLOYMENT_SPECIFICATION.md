# ZOIKOSHIELD™ PLATFORM
## Google Cloud Platform (GCP) Production Deployment Specification
**Authoritative Technical Architecture, Infrastructure Blueprint, Database Model & Production Operations Guide**

* **Document ID:** `ZS-GCP-PROD-SPEC-2026-v2`
* **Version:** `2.0.0` (Post-Database Consolidation)
* **Date:** `25 September 2026`
* **Target Environment:** `Production / Non-Prod (europe-west3 Frankfurt)`
* **Architecture Baseline:** `ADR-18 (GCP Hosting)` & `ADR-19 (Prisma Multi-Schema Consolidation)`
* **Prepared For:** Akshay Uppar (Lead Deployment Engineer)

---

> [!WARNING]
> ### ⚠️ Critical Production Directives for Deployment
> 1. **Zero Localhost Policy:** All service endpoints, Redis, Kafka, and Database URIs must use real GCP internal/external URLs.
> 2. **Kafka / Cron Scale-to-Zero Guard:** Do **NOT** scale `shield-core`, `shield-ingest`, or `shield-action` to zero (`min-instances=1` mandatory to prevent silent event consumption halts).
> 3. **Approval Quorum Singleton:** Cap `shield-action` at **`max-instances=1`** (stateful in-memory approval quorum).
> 4. **WORM Storage Lock:** Cloud Storage evidence bucket **MUST** be created with `enableObjectRetention=true` (cannot be added later).
> 5. **Omit Optional Env Vars:** Do not set unused optional env vars to empty string `""` (omitting allows default code fallbacks).

---

## 1. Microservice Fleet & Architecture Map

ZoikoShield is partitioned into 6 discrete microservices running as containerized workloads on Google Cloud Run (or GKE), supported by a one-shot database migration job and an offline air-gapped verifier binary:

| Service Name | Port | Primary Responsibility & Domain Boundary | Compute Sizing | Replication & State |
|---|---|---|---|---|
| **`shield-core`** | `3001` | Core REST API Gateway: Tenant lifecycle, users, RBAC/ABAC, cases, alerts, detections, continuous controls, evidence ledger. | 2 vCPU, 4 GiB RAM | `min=1, max=10`<br/>*(Background workers & cron)* |
| **`shield-ingest`** | `3002` | High-throughput telemetry intake, OCSF schema normalizer (3001/4001), in-memory connector cache, DLQ. | 2 vCPU, 4 GiB RAM | `min=1, max=20`<br/>*(Kafka Consumer)* |
| **`shield-ai`** | `3003` | AI Investigation Copilot: ModelArmor prompt injection filter, grounded citations, decision envelopes, Tier-1 RCA fallback. | 2 vCPU, 4 GiB RAM | `min=0, max=5`<br/>*(Stateless Gateway)* |
| **`shield-action`** | `3004` | SOAR Response Broker: Governed R1-R4 action execution, FIDO2 dual-custody quorum, single-use rollback token issuance. | 2 vCPU, 2 GiB RAM | **`min=1, max=1`**<br/>*(In-Memory State Quorum)* |
| **`shield-anchor`** | `3005` | Cryptographic Ledger: Domain-separated Merkle trees (ZS-MERKLE-V1), Cloud KMS ECDSA + PQC ML-DSA-65 dual-signing. | 1 vCPU, 2 GiB RAM | `min=0, max=5`<br/>*(Stateless Cryptography)* |
| **`frontend`** | `3000` | Next.js 15 / React 19 UI: Operational command center, 29 experience contracts, audit package verification workspace. | 1 vCPU, 2 GiB RAM | `min=1, max=10`<br/>*(SSR Web Server)* |
| **`shield-core-migrate`** | `Job` | One-shot Cloud Run Job: Database baseline reconciliation, Prisma multi-schema migrations, service role permissions. | 1 vCPU, 2 GiB RAM | Single execution<br/>*(Blocks service launch)* |
| **`verifier-cli`** | `CLI` | Standalone air-gapped binary: 0 npm runtime dependencies, deterministic Merkle tree reconstruction, tamper detection. | N/A | Offline auditor utility<br/>*(Pure Node stdlib)* |

---

## 2. Database Architecture (PostgreSQL 16 & ADR-19 Consolidation)

Per **ADR-19**, the ZoikoShield database has been consolidated into a **single unified ORM (Prisma Multi-Schema)** on Cloud SQL PostgreSQL 16 (`shield_core`), eliminating historical TypeORM migration drift and establishing strict schema-level domain isolation.

* **Database Engine:** Google Cloud SQL PostgreSQL 16 (Enterprise Edition, HA Regional in `europe-west3`).
* **Database Name:** `shield_core`
* **Mandatory Extensions:** `uuid-ossp`, `pgcrypto`
* **Consolidated Schemas:**
  - `public` (231 operational models: cases, alerts, detections, playbooks, evidence ledger)
  - `identity` (users, credentials, WebAuthn passkeys, sessions)
  - `"authorization"` (roles, permissions, tenant memberships, JIT elevation) *(Note: quoted identifier required)*
  - `tenant` (tenants, legal entities, environments, customers, organizations)
* **Migration Command:**
  ```powershell
  npm run migrate:deploy
  ```
  *(Sequentially executes `reconcile-typeorm-baseline.js` $\to$ `prisma migrate deploy` $\to$ `apply-database-access.js`)*
* **Row-Level Security (RLS):** Enforced via `TenantScopedPool` and PostgreSQL RLS policies.

---

## 3. Supporting Infrastructure & GCP Managed Services

| Component | Local Stack | GCP Production Managed Service | Configuration Requirements & Critical Rules |
|---|---|---|---|
| **Relational DB** | PostgreSQL 16 | Google Cloud SQL PostgreSQL 16 | Private IP only, database flag: `cloudsql.enable_pgaudit=on`. |
| **Caching & State** | Redis 7.2 | Google Cloud Memorystore Redis | Redis v7.2, `REDIS_URL=redis://10.20.0.4:6379`. |
| **Message Bus** | Redpanda | Managed Kafka (or Redpanda Cloud) | Requires `KAFKA_SASL_MECHANISM=plain` or `oauthbearer`. |
| **Object Vault** | MinIO | Google Cloud Storage (GCS) | **MANDATORY:** Create bucket with `enableObjectRetention=true` (WORM lock). |
| **Key Custody** | Node Crypto | Google Cloud KMS (Cloud KeyRing) | 4 Keys: 3 Asymmetric Signing (P-256) + 1 Symmetric Key Wrapping. |
| **Secrets Store** | `.env` file | Google Cloud Secret Manager | Injected as environment variables at Cloud Run startup. |
| **Container Registry** | Docker Local | Google Artifact Registry | Standard Docker repository: `europe-west3-docker.pkg.dev/PROJECT_ID/zoiko-shield`. |

---

## 4. Google Cloud KMS Key Architecture

Cloud KMS keys are partitioned into 3 signing keys and 1 symmetric wrapping key in `europe-west3`:

| Environment Variable Name | KMS Key Purpose | Algorithm | Resource Name Format Required in `.env` |
|---|---|---|---|
| `ANCHOR_KMS_KEY_VERSION` | Signs Merkle root checkpoints & PQC hybrid receipts in `shield-anchor` | `EC_SIGN_P256_SHA256` | `projects/P/locations/L/keyRings/R/cryptoKeys/anchor-signer/cryptoKeyVersions/1` |
| `COLLECTOR_KMS_KEY_VERSION` | Signs evidence intake provenance tokens in `shield-ingest` / `shield-core` | `EC_SIGN_P256_SHA256` | `projects/P/locations/L/keyRings/R/cryptoKeys/collector-signer/cryptoKeyVersions/1` |
| `ACTION_COMMAND_KMS_KEY_VERSION` | Signs mutating SOAR action command envelopes in `shield-action` | `EC_SIGN_P256_SHA256` | `projects/P/locations/L/keyRings/R/cryptoKeys/action-signer/cryptoKeyVersions/1` |
| `SUBJECT_KEY_KMS_KEY_NAME` | Symmetric envelope key wrapping for tenant crypto-shredding keys | `GOOGLE_SYMMETRIC_ENCRYPTION` | `projects/P/locations/L/keyRings/R/cryptoKeys/subject-wrapper`<br/>*(Notice: NO `/cryptoKeyVersions/` suffix)* |

---

## 5. Production Environment Variables (Zero Localhost Policy)

```env
# ==============================================================================
# Google Cloud Platform & Storage
# ==============================================================================
GOOGLE_CLOUD_PROJECT=zoiko-shield-prod-2026
EVIDENCE_GCS_BUCKET=zoiko-shield-evidence-worm-prod
EVIDENCE_GCS_LOCATION=europe-west3

# ==============================================================================
# Cloud SQL PostgreSQL 16 (Private VPC IP)
# ==============================================================================
DATABASE_URL=postgresql://shield_app:DB_SECURE_PASSWORD@10.20.0.3:5432/shield_core?schema=public&sslmode=prefer

# ==============================================================================
# Memorystore Redis & Managed Kafka
# ==============================================================================
REDIS_URL=redis://10.20.0.4:6379
KAFKA_BROKERS=10.20.0.5:9092,10.20.0.6:9092
KAFKA_SASL_MECHANISM=plain

# ==============================================================================
# Cloud KMS Cryptographic Keys (europe-west3)
# ==============================================================================
ANCHOR_KMS_KEY_VERSION=projects/zoiko-shield-prod-2026/locations/europe-west3/keyRings/zoikoshield-ring/cryptoKeys/anchor-signer/cryptoKeyVersions/1
COLLECTOR_KMS_KEY_VERSION=projects/zoiko-shield-prod-2026/locations/europe-west3/keyRings/zoikoshield-ring/cryptoKeys/collector-signer/cryptoKeyVersions/1
ACTION_COMMAND_KMS_KEY_VERSION=projects/zoiko-shield-prod-2026/locations/europe-west3/keyRings/zoikoshield-ring/cryptoKeys/action-signer/cryptoKeyVersions/1
SUBJECT_KEY_KMS_KEY_NAME=projects/zoiko-shield-prod-2026/locations/europe-west3/keyRings/zoikoshield-ring/cryptoKeys/subject-wrapper

# ==============================================================================
# Inter-Service Routing URLs (Cloud Run Internal/External URLs)
# ==============================================================================
CORE_SERVICE_URL=https://shield-core-prod-xxx.a.run.app
INGEST_SERVICE_URL=https://shield-ingest-prod-xxx.a.run.app
AI_SERVICE_URL=https://shield-ai-prod-xxx.a.run.app
ACTION_SERVICE_URL=https://shield-action-prod-xxx.a.run.app
ANCHOR_SERVICE_URL=https://shield-anchor-prod-xxx.a.run.app
FRONTEND_URL=https://app.zoikoshield.io

# ==============================================================================
# Cryptographic Secrets (Generated via: openssl rand -hex 48)
# ==============================================================================
JWT_SECRET=GENERATED_HEX_STRING_48
WORKLOAD_IDENTITY_DEV_SECRET=GENERATED_HEX_STRING_48
WEBHOOK_HMAC_SECRET=GENERATED_HEX_STRING_48
```

---

## 6. Step-by-Step GCP Provisioning Runbook (`gcloud` CLI)

### Step 1: Set Project & Enable APIs
```bash
gcloud config set project zoiko-shield-prod-2026
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudkms.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  redis.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com
```

### Step 2: Create Artifact Registry Repository
```bash
gcloud artifacts repositories create zoiko-shield \
  --repository-format=docker \
  --location=europe-west3 \
  --description="ZoikoShield Production Container Images"
```

### Step 3: Create Cloud KMS KeyRing & Keys
```bash
gcloud kms keyrings create zoikoshield-ring --location=europe-west3

gcloud kms keys create anchor-signer \
  --keyring=zoikoshield-ring --location=europe-west3 \
  --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256

gcloud kms keys create collector-signer \
  --keyring=zoikoshield-ring --location=europe-west3 \
  --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256

gcloud kms keys create action-signer \
  --keyring=zoikoshield-ring --location=europe-west3 \
  --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256

gcloud kms keys create subject-wrapper \
  --keyring=zoikoshield-ring --location=europe-west3 \
  --purpose=encryption
```

### Step 4: Create WORM Cloud Storage Evidence Bucket
```bash
gcloud storage buckets create gs://zoiko-shield-evidence-worm-prod \
  --location=europe-west3 \
  --default-storage-class=STANDARD \
  --enable-object-retention
```

### Step 5: Provision Cloud SQL PostgreSQL 16 & Databases
```bash
gcloud sql instances create shield-core-db \
  --database-version=POSTGRES_16 \
  --tier=db-custom-4-16384 \
  --region=europe-west3 \
  --availability-type=REGIONAL \
  --storage-auto-increase \
  --storage-size=100GB \
  --database-flags=cloudsql.enable_pgaudit=on

gcloud sql databases create shield_core --instance=shield-core-db
```

### Step 6: Run Database Migrations (Pre-Flight Cloud Run Job)
```bash
gcloud run jobs create shield-core-migrate \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-core:latest \
  --region=europe-west3 \
  --command="npm,run,migrate:deploy" \
  --set-env-vars=DATABASE_URL="postgres://shield_app:DB_PASS@10.20.0.3:5432/shield_core"

gcloud run jobs execute shield-core-migrate --region=europe-west3 --wait
```

### Step 7: Deploy Microservices to Cloud Run
```bash
# 1. shield-core (min=1)
gcloud run deploy shield-core \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-core:latest \
  --region=europe-west3 --port=3001 --min-instances=1 --max-instances=10 --cpu=2 --memory=4Gi

# 2. shield-ingest (min=1)
gcloud run deploy shield-ingest \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-ingest:latest \
  --region=europe-west3 --port=3002 --min-instances=1 --max-instances=20 --cpu=2 --memory=4Gi

# 3. shield-ai (min=0)
gcloud run deploy shield-ai \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-ai:latest \
  --region=europe-west3 --port=3003 --min-instances=0 --max-instances=5 --cpu=2 --memory=4Gi

# 4. shield-action (CRITICAL: max-instances=1)
gcloud run deploy shield-action \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-action:latest \
  --region=europe-west3 --port=3004 --min-instances=1 --max-instances=1 --cpu=2 --memory=2Gi

# 5. shield-anchor (min=0)
gcloud run deploy shield-anchor \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/shield-anchor:latest \
  --region=europe-west3 --port=3005 --min-instances=0 --max-instances=5 --cpu=1 --memory=2Gi

# 6. frontend (min=1)
gcloud run deploy frontend \
  --image=europe-west3-docker.pkg.dev/zoiko-shield-prod-2026/zoiko-shield/frontend:latest \
  --region=europe-west3 --port=3000 --min-instances=1 --max-instances=10 --cpu=1 --memory=2Gi
```

---

## 7. Post-Deployment Verification & Smoke Testing

Execute the following verification probes to validate cluster health once deployed:
1. **Automated GCP Cloud Health Probe:**
   ```powershell
   npm run verify:gcp
   ```
   *(Verifies all 6 HTTP health endpoints, Cloud SQL connectivity, and Cloud KMS key signatures)*
2. **End-to-End Synthetic Slice Rehearsal:**
   ```powershell
   npm run demo:synthetic-slice
   ```
   *(Rehearses telemetry ingest $\to$ OCSF normalize $\to$ rule match $\to$ alert $\to$ AI context $\to$ R1 rollback $\to$ Merkle tree $\to$ offline verifier)*
3. **Standalone Offline Verifier Audit:**
   ```powershell
   npx ts-node apps/verifier-cli/src/main.ts verify ./evidence-vault
   ```
   *(Validates 0-dependency standalone cryptographic verification)*

---

*Specification verified and approved under ZS-GCP-PROD-SPEC-2026-v2.*
