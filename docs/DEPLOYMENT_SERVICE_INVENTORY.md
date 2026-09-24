# ZoikoShield — service, database and environment inventory

For the engineer deploying this. It lists every service the platform runs,
every external service it can reach, the database layout, and what must be set
before production.

Generated from the code on 2026-09-24, not from memory: the environment list
was produced by extracting every variable the source actually reads and
comparing it against `.env.example`.

---

## 1. Microservices (6 Node/NestJS apps + 1 frontend)

All built from one monorepo (`backend/`), one image per service.

| Service | Port | Role |
|---|---|---|
| **shield-core** | 3001 | System of record. Identity, tenants, authorization, cases, alerts, detection, evidence, controls, commercial, export/offboarding. All authenticated user traffic enters here. |
| **shield-ingest** | 3002 | Telemetry intake. Webhook and connector ingestion, OCSF normalization, quarantine, raw event store. |
| **shield-ai** | 3003 | AI assistance. Model routing, guardrails, deterministic fallback. |
| **shield-action** | 3004 | Governed response. Proposals, approvals, simulation, receipts. Live execution is closed until G1. |
| **shield-anchor** | 3005 | Evidence anchoring. Merkle checkpoints, witness receipts, dual signing. |
| **verifier-cli** | — | Standalone offline verifier. Not a server; ships as a binary. |
| **frontend** | 3000 | Next.js UI. Proxies `/api/v1/*` to the services above. |

Plus **shield-core-migrate**, a one-shot container that runs migrations and
exits before shield-core starts.

### Service-to-service authentication

Satellites authenticate to each other with short-lived (60s) workload-identity
JWTs, not user sessions. `SERVICE_NAME` must be set **per process** — each
service identifies itself with it and refuses to issue a token without one.
docker-compose sets it per container; if you run services any other way, set it
yourself.

---

## 2. Infrastructure services (self-hosted, in docker-compose)

| Service | Image | Port(s) | Purpose |
|---|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | 5432 (5433 on host) | The only database. Everything persists here. |
| **Redis** | `redis:7-alpine` | 6379 (6380 on host) | Caching and rate limiting. |
| **Redpanda** | `redpandadata/redpanda:v24.2.7` | 9092, 8082 | Kafka-API event backbone. All inter-service events. |
| **MinIO** | `minio/minio:latest` | 9000, 9001 | S3-compatible object storage for evidence artifacts. |
| **OpenSearch** | `opensearchproject/opensearch:2.17.0` | 9200 | **Optional.** Behind the `search` compose profile. Nothing in the application code reads it today. |

In production, Postgres, Redis, Kafka and object storage would normally be
managed services. The code talks to all four over standard protocols, so
swapping MinIO for real S3 or Redpanda for MSK is a URL and credential change.

---

## 3. Database

**One PostgreSQL database (`shield_core`), four schemas, two ORMs.** This is
unusual and worth understanding before you touch it.

| Schema | Owned by | Contents |
|---|---|---|
| `public` | **Prisma** | 231 models — events, detections, alerts, cases, evidence, controls, commercial, actions. |
| `identity` | **TypeORM** | Principals, credentials, sessions, passkeys, federation, policy documents. |
| `authorization` | **TypeORM** | Roles, permissions, tenant memberships, invitations, JIT elevation. |
| `tenant` | **TypeORM** | Tenants, legal entities, environments, customers, organizations. |

`authorization` is a **reserved PostgreSQL keyword**. Any raw SQL must quote it:
`"authorization".tenant_memberships`. Unquoted, it fails at runtime.

### Migrations — run both, in this order

```bash
npm run migrate:deploy      # prisma migrate deploy, then the TypeORM SQL runner
```

- Prisma: 39 migrations in `backend/prisma/migrations/`
- TypeORM: 20 hand-written SQL files in `backend/typeorm-migrations/`, applied
  by `scripts/run-typeorm-migrations.js` and checksummed in
  `public.infra_schema_migrations`. **Never edit an applied file** — the runner
  refuses to continue if a checksum changes.

Verify the schema matches the code before going live:

```bash
npm run check:schema-drift  # builds a scratch DB from migrations, compares to entities
```

---

## 4. External services

**Nothing external is required to run the platform.** There is no Neon, no
managed database dependency, no third-party SaaS in the critical path. Every
integration below is optional and off unless its credentials are set.

| External service | Used by | Required? | Notes |
|---|---|---|---|
| **AWS KMS** | shield-anchor, shield-core, shield-action | **Yes, in production** | Signing keys for evidence checkpoints, evidence collectors and response commands. All three refuse to start in production without their key ids. See §6. |
| **AWS S3** | shield-core, shield-ingest | Alternative to MinIO | Same SDK; set `S3_ENDPOINT` to AWS or leave it at MinIO. |
| **OpenAI** | shield-ai | No | `https://api.openai.com/v1/chat/completions`. Without `OPENAI_API_KEY` the deterministic fallback is used. |
| **Google Gemini** | shield-ai | No | `https://generativelanguage.googleapis.com`. Same — optional. |
| **Microsoft Graph / Entra** | shield-ingest | No | The **only** connector that actively polls an external API. Needs `ENTRA_*` credentials. |
| **Azure Event Hubs** | shield-ingest | No | Optional Entra streaming path (`@azure/event-hubs`). |
| **Gmail SMTP** | shield-core | No | Owner invitations and OTP. Without `EMAIL_USER`/`EMAIL_APP_PASSWORD` these are logged, not sent — which blocks real onboarding. |
| **RFC3161 timestamp / HTTP witness** | shield-anchor | No | External witness co-signing, off unless configured. |
| **ZoikoID (OIDC)** | shield-core | **Yes, for real tenants** | Tenant owners activate by signing in to it. Without it, no tenant owner can be activated except via the development seed script. |

The other 12 connectors (CrowdStrike, SentinelOne, Cortex XDR, Defender, Okta,
AWS CloudTrail, GuardDuty, Azure Monitor, GCP SCC, Snyk, Jira, syslog) are
**inbound only** — they receive webhooks and normalize them. They make no
outbound call, so they need no egress and no vendor credential.

---

## 5. Environment variables

**Every variable the code reads is documented in `.env.example`.** This was
verified by extracting all `process.env.*` and `ConfigService.get(...)` reads
from `backend/apps`, `backend/libs` and `backend/scripts` and diffing against
the documented set. The gap is empty — nothing is missing.

- `.env.example` (repo root) — 131 variables, grouped by service, with
  `[PRODUCTION]` marking those that must be set before production.
- `frontend/.env.example` — the frontend's own, read server-side only.

Two conventions in that file that matter:

1. `# KEY=value` (commented) means optional, and the value shown is the code's
   own default. **Do not uncomment it as an empty `KEY=`** — several services
   use `??` fallbacks, and an empty string overrides the default rather than
   falling back to it. An empty `SUPPORTED_DATA_REGIONS` disables every region;
   an empty `ANCHOR_WITNESS_PUBLIC_KEYS` crashes the service.
2. In `docker-compose.yml`, a value-less `KEY:` passes the host value through
   only when it is set. `${KEY:-}` would inject an empty string instead.

### Secrets: generate fresh, do not copy

The values in the local `.env` are development values and several are
deliberately weak (`POSTGRES_PASSWORD=shield`). Generate new ones:

```bash
openssl rand -hex 48   # JWT_SECRET, WORKLOAD_IDENTITY_DEV_SECRET, WEBHOOK_HMAC_SECRET, …
```

`WEBHOOK_HMAC_SECRET` must be **identical** in the backend and the frontend, or
every webhook the UI forwards is rejected.

---

## 6. Before production — the fail-closed list

These services refuse to start rather than run insecurely. That is intended;
it is also what will stop a deployment if you miss one.

| Variable | Service | What happens without it |
|---|---|---|
| `JWT_SECRET` | shield-core | Compose fails: it is declared `${JWT_SECRET:?...}`. |
| `SERVICE_NAME` | every service | Refuses to issue workload tokens. |
| `ANCHOR_KMS_KEY_ID` | shield-anchor | Production checkpoint signer throws at construction. |
| `COLLECTOR_KMS_KEY_ID` | shield-core | Production evidence-collector signer throws. |
| `ACTION_COMMAND_KMS_KEY_ID` | shield-action | Production command signer throws. |
| `AWS_REGION` | all KMS clients | KMS calls fail. |
| `KMS_KEY_<REGION>` | shield-core | Onboarding into that region is refused in production. |
| `EVIDENCE_S3_BUCKET`, `S3_ENDPOINT` | shield-core | Onboarding is refused in production. |
| `ZOIKOID_OIDC_*` | shield-core | Tenant-owner invitations cannot be issued. |
| `SSO_ALLOWED_IDP_HOSTS` | shield-core | IdP hosts are rejected in production. |
| `ACCESS_DISCLOSURE_TEXT`, `TERMS_OF_SERVICE_TEXT` | shield-core | Refuses to boot in production with development text. |

Development-only signers (`DevCheckpointSigner`, `DevCollectorSigner`,
`DevGovernedCommandSigner`, `DevSimulationSigner`) all **throw on construction**
when `NODE_ENV=production`. There is no environment-variable escape hatch. If a
production deploy has not configured KMS, it will not start — by design.

---

## 7. Minimum to stand up an environment

```bash
cp .env.example .env            # then set the secrets in §5
docker compose up -d            # postgres, redis, redpanda, minio, 5 services
                                # shield-core-migrate runs both migration sets first
cd frontend && npm run build && npm start
```

For a working tenant in a non-production environment:

```bash
cd backend
npm run seed:platform-admin -- admin@example.com 'StrongPassword123!'
npm run seed:dev-tenant -- --owner owner@example.com --password 'OwnerPass123!'
```

`seed:dev-tenant` supplies the three things production requires and a
development environment cannot provide: an approved commercial order, a ZoikoID
provider record, and owner activation. It refuses to run with
`NODE_ENV=production`.

---

## 8. Known operational facts

- **Sustained ingestion measured at ~60 events/sec** on a single machine, against
  a stated envelope of 15,000/sec. See `docs/evidence/g1-ingestion-load-test.md`.
  Capacity planning should start from the measured number.
- **Live response execution is disabled** platform-wide until the G1 gate is
  ratified. Simulation works; no adapter makes a vendor call.
- **Approval quorum state and the action lock are held in process memory** in
  shield-action. Running more than one shield-action instance will not share
  them, and a restart loses pending approvals. Run one instance until this is
  moved to Postgres or Redis.
