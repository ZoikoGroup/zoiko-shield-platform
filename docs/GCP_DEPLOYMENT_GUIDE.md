# ZoikoShield — deploying on Google Cloud

For the engineer deploying this to GCP. It lists every service the platform
runs, what each maps to on Google Cloud, the database layout and the
environment it needs.

Key management and evidence storage are native GCP: Cloud KMS and Cloud
Storage. There is no remaining AWS dependency.

Compiled from the source on 2026-09-24, not from memory: the environment list
was produced by extracting every variable the code actually reads and diffing
it against `.env.example`.

---

## 0. Key management and storage — now native GCP

Both subsystems that were AWS-specific have been migrated. `@aws-sdk/client-kms`
is gone from the codebase. There is no remaining AWS dependency for a GCP
deployment.

### Cloud KMS signing

Four signers use Google Cloud KMS through one shared implementation
(`backend/libs/kms/`):

| Signer | Key variable |
|---|---|
| Evidence checkpoints (shield-anchor) | `ANCHOR_KMS_KEY_VERSION` |
| Evidence collectors (shield-core) | `COLLECTOR_KMS_KEY_VERSION` |
| Governed response commands (shield-action) | `ACTION_COMMAND_KMS_KEY_VERSION` |
| Subject key wrapping (shield-core) | `SUBJECT_KEY_KMS_KEY_NAME` |

The first three take a key **version** resource name, because asymmetric
signing must name the version that produced a signature:

```
projects/P/locations/L/keyRings/R/cryptoKeys/K/cryptoKeyVersions/V
```

The signer validates that shape at construction, so passing a crypto key where
a version belongs fails at boot rather than as an opaque `NOT_FOUND` the first
time evidence is written.

Subject key wrapping takes a **crypto key** name instead (no version):

```
projects/P/locations/L/keyRings/R/cryptoKeys/K
```

Symmetric encrypt/decrypt resolves the primary version itself, so rotating the
key does not strand previously wrapped subject keys.

**Create the keys:**

```bash
gcloud kms keyrings create zoikoshield --location=<region>

# Three asymmetric signing keys
for KEY in anchor-checkpoint evidence-collector action-command; do
  gcloud kms keys create $KEY \
    --keyring=zoikoshield --location=<region> \
    --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256
done

# One symmetric key for subject-key wrapping
gcloud kms keys create subject-key-wrapping \
  --keyring=zoikoshield --location=<region> --purpose=encryption
```

IAM per service account, least-privileged:

- signers need `roles/cloudkms.signerVerifier` on their key
- shield-core also needs `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the
  wrapping key

Signatures are DER-encoded ECDSA P-256, unchanged from the AWS implementation.

### Cloud Storage for evidence

Evidence goes to Cloud Storage when `EVIDENCE_GCS_BUCKET` and
`GOOGLE_CLOUD_PROJECT` are both set. Otherwise the S3 client is used, which is
what talks to MinIO locally — so local development is unaffected.

**Cloud Storage is not reached through its S3-compatible XML API**, even though
the S3 client would connect. That API does not implement Object Lock, so every
write would succeed and the immutability guarantee would silently not be there.
The native API's per-object retention with `mode: 'Locked'` cannot be shortened
or cleared by anyone, including a project owner — the same guarantee S3's
COMPLIANCE mode gives.

**The bucket must be created with object retention enabled. It cannot be
retrofitted:**

```bash
gcloud storage buckets create gs://<bucket> \
  --location=<region> \
  --enable-per-object-retention \
  --uniform-bucket-level-access

gcloud storage buckets update gs://<bucket> --versioning
```

The services create the bucket correctly if it is absent, and read the
retention configuration back after bootstrap rather than assuming it. If they
find an existing bucket without object retention, they log a warning saying
immutability rests on application discipline alone — that warning means the
bucket must be replaced, not that the setting can be turned on.

Service accounts need `roles/storage.objectAdmin` on the bucket:
shield-core and shield-ingest only.

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
runs migrations and the database access policy and exits before shield-core starts. On GCP that is a Cloud Run
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
| **Kafka** | `redpandadata/redpanda` | **Managed Service for Apache Kafka**, or Redpanda on GKE. Needs `KAFKA_SASL_MECHANISM=oauthbearer` — see below. |
| **Object storage** | `minio/minio` | **Cloud Storage** — native API, see §0 |
| **OpenSearch** | `opensearchproject/opensearch` | Not needed. Optional, behind the `search` compose profile, and nothing in the application code reads it. |

Object storage uses the native Cloud Storage client when configured, so no
HMAC interoperability key is needed — the ambient service account is enough.

### Kafka authentication

`KAFKA_BROKERS` takes a comma-separated list, and TLS and SASL are configured
alongside it:

```bash
# Google Managed Service for Apache Kafka
KAFKA_BROKERS=bootstrap.<cluster>.<region>.managedkafka.<project>.cloud.goog:9092
KAFKA_SASL_MECHANISM=oauthbearer
```

OAUTHBEARER needs no username or password: it authenticates with the attached
service account, which needs `roles/managedkafka.client`. Tokens are fetched
per connection rather than cached, since a token cached past its expiry
reconnects as an auth failure that looks like a broker problem.

SASL implies TLS, so `KAFKA_SSL` is only needed for TLS without SASL. For a
self-hosted broker, `plain`, `scram-sha-256` and `scram-sha-512` are supported
with `KAFKA_SASL_USERNAME` and `KAFKA_SASL_PASSWORD`.

Local development is unchanged: no TLS, no SASL, `localhost:9092`.

---

## 2. Database

**One PostgreSQL database (`shield_core`) on Cloud SQL for PostgreSQL 16,
one schema per owning module, one ORM (Prisma), and tenant row-level
security.** The design and its exceptions are in
[ADR-19](adrs/ADR-19-database-isolation-architecture.md). Read it before you
touch the database.

- **Schema:** `backend/prisma/schema.prisma` holds the generator and
  datasource. `backend/prisma/schemas/<module>.prisma` defines one PostgreSQL
  schema each, 51 in all: `commercial`, `case_management`, `evidence`,
  `identity`, `authorization`, `tenant`, `ingest`, `ai`, `action`, `anchor`
  and so on.
- **Access:** `backend/prisma/access/access-policy.js` defines who may touch
  what: service roles, grants, and the tenant-isolation kind of every table.

`authorization` is a **reserved PostgreSQL keyword**. Raw SQL must quote it,
as in `"authorization".tenant_memberships`. Unquoted, it fails at runtime.

### Two database identities

| Variable | Role | Used by |
|---|---|---|
| `MIGRATION_DATABASE_URL` | Schema owner (the `migrate` IAM login) | The `shield-core-migrate` job only |
| `DATABASE_URL` | The service's own IAM login, a member of `shield_<service>_app` | Each service |

A service must **never** connect as the owner or a superuser. The owner is
filtered only because row-level security is `FORCE`d, and a superuser bypasses
row-level security entirely.

### Cloud SQL specifics

- **Instance:** `infrastructure/tofu/regional-cell/database.tf` creates it with
  private IP only, TLS required, an HSM customer-managed key, point-in-time
  recovery, 30 backups kept in-region, pgaudit (`ddl,role`), and regional HA
  in production. It also creates an **IAM database login** for each service
  account.
- **Connecting:** use the **Cloud SQL Auth Proxy** as a sidecar, with
  `--auto-iam-authn --private-ip <connection name>`. The URL is then
  `postgres://<iam-login>@127.0.0.1:5432/shield_core`, with no password; the
  logins are listed in the tofu output `database_iam_logins`.
- **No transaction-mode pooling.** Tenant scope is a session setting written
  on every connection checkout, so it needs a direct connection or a
  session-mode pooler. PgBouncer in transaction mode can run the setting and
  the query on different server connections, and is not supported.
- **Extensions:** requires `uuid-ossp` and `pgcrypto`. Cloud SQL supports
  both; enable them before the first migration.
- **TLS flag:** if you terminate TLS with `sslmode=require`, the code switches
  the driver to SSL on that substring, with no extra flag.

**One-time bootstrap of the migrator** (as the built-in `postgres` user,
before the first migrate run):

```sql
GRANT cloudsqlsuperuser TO "shield-migrate@<runtime-project>.iam";
ALTER DATABASE shield_core OWNER TO "shield-migrate@<runtime-project>.iam";
```

### Migrations

```bash
npm run migrate:deploy
#  1. scripts/reconcile-typeorm-baseline.js  (no-op except on a database the retired TypeORM runner migrated)
#  2. prisma migrate deploy                   (43 migrations in backend/prisma/migrations/)
#  3. scripts/apply-database-access.js        (roles, grants, row-level security)
```

**Step 3.** Set `DATABASE_ROLE_MEMBERS` on the migrate job to the tofu output
`database_role_members`, so each service's IAM login joins its group role.
The step is idempotent and runs in one transaction. It stops and changes
nothing while any table lacks an isolation decision.

**Rules for new migrations:**

- **Classify every new table** in `access-policy.js`. A table with a NOT NULL
  `tenant_id` is `tenant` automatically. CI and the deploy step both fail on
  anything else left undecided.
- **Data migrations must declare platform scope** with
  `SELECT set_config('app.platform_scope', 'on', false);`. Without it, a
  backfill silently changes zero rows, because `FORCE` filters the owner too.
- **New PL/pgSQL functions** must set `search_path` or name their tables with
  a schema.

Verify before going live:

```bash
npm run check:schema-drift   # replays every migration into SHADOW_DATABASE_URL and compares to the schema
RLS_TEST_DATABASE_URL=<disposable, migrated database, as owner> npm run test:rls
```

---

## 3. External services

**Nothing external is required to run the platform.** There is no Neon, no
managed-database dependency and no third-party SaaS in the critical path. Every
integration below is optional and off unless its credentials are set.

| External service | Used by | Required? | On GCP |
|---|---|---|---|
| **Cloud KMS** | anchor, core, action | **Yes, in production** | Native. See §0. |
| **Cloud Storage** | core, ingest | Yes | Native API with per-object retention. See §0. |
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

**Egress:** shield-ai (model providers), shield-ingest (Entra) and shield-core
(SMTP, ZoikoID) need to reach the public internet. Cloud KMS, Cloud Storage
and Managed Kafka are Google APIs, so shield-anchor and shield-action need
**Private Google Access** on their subnet rather than internet egress — and
shield-core and shield-ingest need it too, on top of their internet egress.

---

## 4. Environment variables

**Every variable the code reads is documented in `.env.example`.** Verified by
extracting all `process.env.*` and `ConfigService.get(...)` reads from
`backend/apps`, `backend/libs` and `backend/scripts` and diffing against the
documented set. The gap is empty.

- `.env.example` (repo root) — every variable, grouped by service, with
  `[PRODUCTION]` marking those that must be set before production.
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
| `DATABASE_URL` | The service's IAM login via the Cloud SQL Auth Proxy (`--auto-iam-authn`); see §2 |
| `MIGRATION_DATABASE_URL` | Migrate job only: the `migrate` IAM login |
| `DATABASE_ROLE_MEMBERS` | Migrate job only: tofu output `database_role_members` |
| `REDIS_URL` | Memorystore private IP |
| `KAFKA_BROKERS` | Managed Kafka bootstrap server, comma-separated if several |
| `KAFKA_SASL_MECHANISM` | `oauthbearer` for Managed Kafka |
| `GOOGLE_CLOUD_PROJECT` | Your project id |
| `EVIDENCE_GCS_BUCKET` | The evidence bucket, created with per-object retention |
| `EVIDENCE_GCS_LOCATION` | Bucket location, default `US` |
| `ANCHOR_KMS_KEY_VERSION` etc. | Cloud KMS resource names, see §0 |
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
| `ANCHOR_KMS_KEY_VERSION` | shield-anchor | Production signer throws at construction. |
| `COLLECTOR_KMS_KEY_VERSION` | shield-core | Production signer throws. |
| `ACTION_COMMAND_KMS_KEY_VERSION` | shield-action | Production signer throws. |
| `SUBJECT_KEY_KMS_KEY_NAME` | shield-core | Refuses to start; a locally wrapped subject key cannot be shredded beyond our own reach. |
| `KMS_KEY_<REGION>` | shield-core | Onboarding into that region is refused. |
| `EVIDENCE_GCS_BUCKET`, `GOOGLE_CLOUD_PROJECT` | shield-core | Falls back to the S3 client; onboarding is refused without a bucket. |
| `ZOIKOID_OIDC_*` | shield-core | Tenant-owner invitations cannot be issued. |
| `SSO_ALLOWED_IDP_HOSTS` | shield-core | IdP hosts are rejected. |
| `ACCESS_DISCLOSURE_TEXT`, `TERMS_OF_SERVICE_TEXT` | shield-core | Refuses to boot with development text. |

The development signers (`DevCheckpointSigner`, `DevCollectorSigner`,
`DevGovernedCommandSigner`, `DevSimulationSigner`) **throw on construction**
when `NODE_ENV=production`, with no environment-variable escape hatch. A
production deployment that has not configured Cloud KMS will not start — by
design.

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
                      GCS ←─ evidence bucket (native API, object retention)
```

- Images to **Artifact Registry**; one repo, six images from the one Dockerfile.
- Secrets in **Secret Manager**, mounted as env vars.
- `shield-core-migrate` as a **Cloud Run job**, run to completion before the
  services roll.
- Give each service its **own service account**, least-privileged:

  | Service | Roles |
  |---|---|
  | shield-core | `cloudkms.signerVerifier` (collector key), `cloudkms.cryptoKeyEncrypterDecrypter` (wrapping key), `storage.objectAdmin` (evidence bucket), `managedkafka.client`, `cloudsql.client`, `secretmanager.secretAccessor` |
  | shield-ingest | `storage.objectAdmin`, `managedkafka.client`, `cloudsql.client`, `secretmanager.secretAccessor` |
  | shield-anchor | `cloudkms.signerVerifier` (anchor key), `managedkafka.client`, `cloudsql.client`, `secretmanager.secretAccessor` |
  | shield-action | `cloudkms.signerVerifier` (command key), `managedkafka.client`, `cloudsql.client`, `secretmanager.secretAccessor` |
  | shield-ai | `managedkafka.client`, `cloudsql.client`, `secretmanager.secretAccessor` |

- No service account key files. Cloud Run and GKE supply credentials to the
  KMS, Storage and Kafka clients from the attached service account.

### Bring one up

```bash
gcloud sql databases create shield_core --instance=<instance>
# enable uuid-ossp and pgcrypto on that database

gcloud run jobs execute shield-core-migrate       # migrations, then roles, grants and row-level security
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

## 7. What is still AWS-shaped

Nothing blocks a GCP deployment, but two things are worth knowing.

**`@aws-sdk/client-s3` is still a dependency.** It is what talks to MinIO in
non-production, and it is bypassed entirely when `EVIDENCE_GCS_BUCKET` and
`GOOGLE_CLOUD_PROJECT` are set. It makes no AWS call.

**The multi-cloud key escrow subsystem is a simulation.**
`split-kms-escrow.service.ts` refers to AWS KMS, Azure Key Vault and GCP KMS,
but derives all three "root keys" from fixed strings and makes no cloud call.
ADR-017 parks it as Experimental Tier-2. It is not part of the production key
path and needs nothing from you.

---

## 8. Operational facts worth knowing before you size it

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
