# ZoikoShield — deploying on Google Cloud

For the engineer deploying this to GCP. It lists every service the platform
runs, what each maps to on Google Cloud, the database layout, the environment
it needs, and — importantly — **the two things that do not port to GCP as the
code stands today**.

Compiled from the source on 2026-09-24, not from memory: the environment list
was produced by extracting every variable the code actually reads and diffing
it against `.env.example`.

---

## 0. Read this first — two GCP blockers

The platform was written against AWS for two subsystems. Everything else is
cloud-neutral and runs on GCP unchanged. These two are not configuration
problems; they need code.

### Blocker 1 — Key management is AWS KMS only

Four files import `@aws-sdk/client-kms` and call AWS KMS directly:

| File | What it signs |
|---|---|
| `apps/shield-anchor/src/signing/production-checkpoint-signer.service.ts` | Merkle evidence checkpoints |
| `apps/shield-core/src/modules/evidence/signing/production-collector-signer.service.ts` | Evidence collector signatures |
| `apps/shield-action/src/command-signing/production-governed-command-signer.service.ts` | Governed response commands |
| `apps/shield-core/src/modules/privacy/cryptographic-shredding.service.ts` | Tenant subject-key wrapping |

Google Cloud KMS is a different API and SDK (`@google-cloud/kms`). The AWS SDK
cannot talk to it, and there is no endpoint override that makes it work.

**This will stop a production deployment**, by design: each of those signers
throws at construction when its `*_KMS_KEY_ID` is missing, and the development
signers throw when `NODE_ENV=production`. The service will not start rather
than sign with a throwaway key.

**Options, in order of preference:**

1. **Write GCP KMS implementations.** Each signer already sits behind an
   interface with a dev and a production implementation, chosen by a provider
   factory. Adding a third implementation per seam is the intended extension
   point — roughly four classes, no changes to callers. Cloud KMS supports the
   same asymmetric `EC_SIGN_P256_SHA256` these use.
2. **Use AWS KMS from GCP.** It works over the public internet with AWS
   credentials. It also means your key custody sits with a second cloud
   provider, which is a compliance decision, not just a technical one.
3. **Do not deploy to production yet.** Non-production runs fine on GCP today:
   the dev signers work, and they say plainly in their logs that their keys are
   ephemeral.

### Blocker 2 — S3 Object Lock has no Cloud Storage equivalent

Evidence WORM is enforced with S3 Object Lock in COMPLIANCE mode
(`ObjectLockMode: 'COMPLIANCE'`, per-object `ObjectLockRetainUntilDate`), set
in `apps/shield-core/src/modules/evidence/storage/object-storage.service.ts`
and `apps/shield-ingest/src/evidence/object-storage.service.ts`.

Cloud Storage's S3-compatible XML API does **not** implement Object Lock. GCS
has Bucket Lock retention policies and object holds, but they are bucket-wide
and configured through the GCS API, not through the S3 headers this code sends.

The practical effect: on GCS, object writes will succeed and **the immutability
guarantee will silently not be there**. The code reads the lock configuration
back after bootstrap and reports what it finds, so this surfaces rather than
passing quietly — but it must be resolved before evidence is treated as
tamper-evident.

**Options:**

1. **GCS Bucket Lock** with a bucket-level retention policy, plus a GCS-native
   storage implementation. Bucket-wide retention is coarser than per-object
   retention profiles, so the retention model needs a decision.
2. **Keep evidence on S3** even while compute runs on GCP.
3. **Self-host MinIO on GKE**, which does implement Object Lock. This keeps the
   code unchanged and the guarantee intact, at the cost of running storage
   yourself.

---

## 1. Service mapping to GCP

### The six application services

All built from one monorepo (`backend/`), one container image each. They are
stateless HTTP services and run on **Cloud Run** or **GKE** without
modification.

| Service | Port | Role |
|---|---|---|
| **shield-core** | 3001 | System of record. Identity, tenants, authorization, cases, alerts, detection, evidence, controls, commercial, export/offboarding. All authenticated user traffic enters here. |
| **shield-ingest** | 3002 | Telemetry intake. Webhook and connector ingestion, OCSF normalization, quarantine. |
| **shield-ai** | 3003 | AI assistance. Model routing, guardrails, deterministic fallback. |
| **shield-action** | 3004 | Governed response. Proposals, approvals, simulation, receipts. |
| **shield-anchor** | 3005 | Evidence anchoring. Merkle checkpoints, witness receipts, dual signing. |
| **frontend** | 3000 | Next.js UI. Proxies `/api/v1/*` to the services above. |

Plus **verifier-cli**, a standalone offline verifier that ships as a binary and
is not deployed as a service, and **shield-core-migrate**, a one-shot job that
runs migrations and exits before shield-core starts. On GCP that is a Cloud Run
job or a Kubernetes Job, and it must complete before the services roll.

**Cloud Run caveat:** shield-core, shield-ingest and shield-action run Kafka
consumers and `@Cron` schedulers that must be alive continuously. Cloud Run
scales to zero and only guarantees CPU during a request, so these need
**minimum instances ≥ 1 and CPU always-allocated**, or they belong on GKE. The
outbox publisher runs every 10 seconds; if it is suspended, events stop
flowing and nothing reports an error.

### Infrastructure

| Component | Local (docker-compose) | GCP |
|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | **Cloud SQL for PostgreSQL 16** |
| **Redis** | `redis:7-alpine` | **Memorystore for Redis** |
| **Kafka** | `redpandadata/redpanda` | **Managed Service for Apache Kafka**, or Redpanda on GKE |
| **Object storage** | `minio/minio` | **Cloud Storage** — see Blocker 2 |
| **OpenSearch** | `opensearchproject/opensearch` | Not needed. Optional, behind the `search` compose profile, and nothing in the application code reads it. |

Kafka is reached with plain broker addresses (`KAFKA_BROKERS`), so any
Kafka-API-compatible service works. Object storage is reached through the S3
SDK with a configurable `endpoint` and `forcePathStyle: true` already set,
so **Cloud Storage works through its S3 interoperability endpoint**
(`https://storage.googleapis.com`) with an HMAC key as
`S3_ACCESS_KEY`/`S3_SECRET_KEY` — with the Object Lock caveat above.

---

## 2. Database

**One PostgreSQL database (`shield_core`), four schemas, two ORMs.** Worth
understanding before you touch it.

| Schema | Owned by | Contents |
|---|---|---|
| `public` | **Prisma** | 231 models — events, detections, alerts, cases, evidence, controls, commercial, actions. |
| `identity` | **TypeORM** | Principals, credentials, sessions, passkeys, federation, policy documents. |
| `authorization` | **TypeORM** | Roles, permissions, tenant memberships, invitations, JIT elevation. |
| `tenant` | **TypeORM** | Tenants, legal entities, environments, customers, organizations. |

`authorization` is a **reserved PostgreSQL keyword**. Raw SQL must quote it:
`"authorization".tenant_memberships`. Unquoted, it fails at runtime.

### Cloud SQL specifics

- Requires the `uuid-ossp` and `pgcrypto` extensions. Cloud SQL supports both;
  enable them before the first migration.
- Connect through the **Cloud SQL Auth Proxy** or a private IP with a VPC
  connector. `DATABASE_URL` is a standard libpq URL, so either works.
- If you terminate TLS with `sslmode=require`, the code already switches the
  driver to SSL on that substring — no extra flag.
- Migrations open a direct connection. If you front Cloud SQL with **PgBouncer
  in transaction mode**, the TypeORM runner already splits multi-statement
  files for that reason, but Prisma's migrate needs a direct connection.

### Migrations — both must run, in this order

```bash
npm run migrate:deploy      # prisma migrate deploy, then the TypeORM SQL runner
```

- Prisma: 39 migrations in `backend/prisma/migrations/`
- TypeORM: 20 hand-written SQL files in `backend/typeorm-migrations/`, applied
  by `scripts/run-typeorm-migrations.js` and checksummed in
  `public.infra_schema_migrations`. **Never edit an applied file** — the runner
  stops if a checksum changes.

Verify the schema matches the code before going live:

```bash
npm run check:schema-drift  # builds a scratch DB from migrations, compares to entities
```

---

## 3. External services

**Nothing external is required to run the platform.** There is no Neon, no
managed-database dependency and no third-party SaaS in the critical path. Every
integration below is optional and off unless its credentials are set.

| External service | Used by | Required? | On GCP |
|---|---|---|---|
| **KMS** | anchor, core, action | **Yes, in production** | **Blocked** — AWS KMS only. See Blocker 1. |
| **Object storage** | core, ingest | Yes | Cloud Storage via S3 interop; Object Lock unsupported. See Blocker 2. |
| **OpenAI** | shield-ai | No | Works. Egress to `api.openai.com`. |
| **Google Gemini** | shield-ai | No | Works, and is the natural fit here — `generativelanguage.googleapis.com`. |
| **Microsoft Graph / Entra** | shield-ingest | No | Works. The **only** connector that polls outward; needs egress. |
| **Azure Event Hubs** | shield-ingest | No | Optional Entra streaming path. |
| **Gmail SMTP** | shield-core | No | Works. Without `EMAIL_USER`/`EMAIL_APP_PASSWORD`, invitations and OTP are logged, not sent — which blocks real onboarding. |
| **RFC3161 / HTTP witness** | shield-anchor | No | Off unless configured. |
| **ZoikoID (OIDC)** | shield-core | **Yes, for real tenants** | Works. Tenant owners activate by signing in to it. |

The other 12 connectors (CrowdStrike, SentinelOne, Cortex XDR, Defender, Okta,
AWS CloudTrail, GuardDuty, Azure Monitor, GCP SCC, Snyk, Jira, syslog) are
**inbound only** — they receive webhooks and normalize them. They make no
outbound call, so they need no egress and no vendor credential.

**Egress:** only shield-ai, shield-ingest (Entra) and shield-core (SMTP, OIDC,
KMS) need to reach the internet. The rest can run without egress.

---

## 4. Environment variables

**Every variable the code reads is documented in `.env.example`.** Verified by
extracting all `process.env.*` and `ConfigService.get(...)` reads from
`backend/apps`, `backend/libs` and `backend/scripts` and diffing against the
documented set. The gap is empty.

- `.env.example` (repo root) — 131 variables, grouped by service, `[PRODUCTION]`
  marking those that must be set before production.
- `frontend/.env.example` — the frontend's own, read server-side only.

On GCP, put every secret in **Secret Manager** and mount it as an environment
variable. Two conventions that matter:

1. `# KEY=value` (commented) means optional, and the value shown is the code's
   own default. **Never set it to an empty string** — several services use `??`
   fallbacks, and an empty value overrides the default rather than falling back
   to it. An empty `SUPPORTED_DATA_REGIONS` disables every region; an empty
   `ANCHOR_WITNESS_PUBLIC_KEYS` crashes the service. In Cloud Run, omit the
   variable entirely rather than setting it blank.
2. `SERVICE_NAME` must be set **per service**. Each one identifies itself with
   it when issuing 60-second workload-identity JWTs to its peers, and refuses
   to issue one without it. Six services, six different values.

### GCP-specific values

| Variable | Value on GCP |
|---|---|
| `DATABASE_URL` | Cloud SQL, via Auth Proxy or private IP |
| `REDIS_URL` | Memorystore private IP |
| `KAFKA_BROKERS` | Managed Kafka bootstrap servers |
| `S3_ENDPOINT` | `https://storage.googleapis.com` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | A Cloud Storage **HMAC key** for a service account |
| `EVIDENCE_S3_BUCKET` | The GCS bucket name |
| `SHIELD_*_BASE_URL` | Internal service URLs (Cloud Run URLs or cluster DNS) |
| `GEMINI_API_KEY` | If you use Gemini rather than OpenAI |

### Secrets: generate fresh

The local `.env` holds development values and several are deliberately weak
(`POSTGRES_PASSWORD=shield`). Generate new ones:

```bash
openssl rand -hex 48   # JWT_SECRET, WORKLOAD_IDENTITY_DEV_SECRET, WEBHOOK_HMAC_SECRET, …
```

`WEBHOOK_HMAC_SECRET` must be **identical** in the backend and the frontend, or
every webhook the UI forwards is rejected.

---

## 5. Fail-closed list — what stops a production start

These refuse to start rather than run insecurely. That is intended, and it is
what will stop your rollout if one is missed.

| Variable | Service | Without it |
|---|---|---|
| `JWT_SECRET` | shield-core | Fails immediately. |
| `SERVICE_NAME` | every service | Refuses to issue workload tokens. |
| `ANCHOR_KMS_KEY_ID` | shield-anchor | Production signer throws at construction. |
| `COLLECTOR_KMS_KEY_ID` | shield-core | Production signer throws. |
| `ACTION_COMMAND_KMS_KEY_ID` | shield-action | Production signer throws. |
| `AWS_REGION` | all KMS clients | KMS calls fail. |
| `KMS_KEY_<REGION>` | shield-core | Onboarding into that region is refused. |
| `EVIDENCE_S3_BUCKET`, `S3_ENDPOINT` | shield-core | Onboarding is refused. |
| `ZOIKOID_OIDC_*` | shield-core | Tenant-owner invitations cannot be issued. |
| `SSO_ALLOWED_IDP_HOSTS` | shield-core | IdP hosts are rejected. |
| `ACCESS_DISCLOSURE_TEXT`, `TERMS_OF_SERVICE_TEXT` | shield-core | Refuses to boot with development text. |

The development signers (`DevCheckpointSigner`, `DevCollectorSigner`,
`DevGovernedCommandSigner`, `DevSimulationSigner`) **throw on construction**
when `NODE_ENV=production`, with no environment-variable escape hatch. Combined
with Blocker 1, a production GCP deployment cannot currently start until GCP
KMS support is written or AWS KMS is used.

---

## 6. Suggested GCP shape

```
Cloud Load Balancing  →  Cloud Run: frontend (3000)
                              │
                              ├─→ Cloud Run: shield-core    (min instances ≥ 1)
                              ├─→ Cloud Run: shield-ingest  (min instances ≥ 1)
                              └─→ Cloud Run: shield-ai

              Cloud Run: shield-action, shield-anchor  (min instances ≥ 1)

  Serverless VPC connector ─→ Cloud SQL (private IP)
                           ─→ Memorystore Redis
                           ─→ Managed Kafka
                      GCS ←─ evidence bucket (S3 interop)
```

- Images to **Artifact Registry**; one repo, six images from the one Dockerfile.
- Secrets in **Secret Manager**, mounted as env vars.
- `shield-core-migrate` as a **Cloud Run job**, run to completion before the
  services roll.
- Give each service its **own service account**, least-privileged: only
  shield-core, shield-anchor and shield-action need KMS; only shield-core and
  shield-ingest need the bucket.

### Bring one up

```bash
gcloud sql databases create shield_core --instance=<instance>
# enable uuid-ossp and pgcrypto on that database

gcloud run jobs execute shield-core-migrate       # both migration sets
gcloud run deploy shield-core --min-instances=1 --no-cpu-throttling
# … the other services
```

For a working tenant in a **non-production** environment:

```bash
cd backend
npm run seed:platform-admin -- admin@example.com 'StrongPassword123!'
npm run seed:dev-tenant -- --owner owner@example.com --password 'OwnerPass123!'
```

`seed:dev-tenant` supplies the three things production requires and a
development environment cannot: an approved commercial order, a ZoikoID
provider record, and owner activation. It refuses to run with
`NODE_ENV=production`.

---

## 7. Operational facts worth knowing before you size it

- **Sustained ingestion measured at ~60 events/sec** on a single machine,
  against a stated envelope of 15,000/sec. See
  `docs/evidence/g1-ingestion-load-test.md`. Size from the measured number, and
  note that the limit is per-request work in the ingest path, so **adding
  instances multiplies ~60/sec** rather than fixing it.
- **Run one shield-action instance.** Approval quorum, the two-man rule and the
  action lock are held in process memory. A second instance will not see the
  first's pending approvals, and a restart loses them. Set its max instances to
  1 until that state moves to Postgres or Redis.
- **shield-core, shield-ingest and shield-action must not scale to zero.** They
  run Kafka consumers and cron schedulers; a suspended instance stops
  processing events silently.
- **Live response execution is disabled** platform-wide until the G1 gate is
  ratified. Simulation works; no adapter makes a vendor call.
