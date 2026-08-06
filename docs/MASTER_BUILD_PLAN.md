# ZoikoShield Backend Master Build Plan (Final)

Source: `ZoikoShield_Combined_Engineering_Specifications.pdf` (534 pages). This
version incorporates corrections found when the draft plan was cross-checked
against that source, plus a local Docker development setup (§19).

> **Provenance note:** sections 1–18 restate and reconcile the source spec.
> Anything not literally present in the PDF is marked **[derived]** — a
> reasonable elaboration, not a quoted requirement. Treat **[derived]**
> content as a proposal to ratify via ADR, not as settled fact.

---

## 1. Current status and governing rule

ZoikoShield is presently a **controlled pre-build baseline**, not an
implementation-authorized architecture. Build-ready status requires the
Gate-0 ADRs to be resolved, a Phase-0 reference implementation, an approved
crown-jewel threat model, and an executable operating and cost model
(spec §0.1).

Non-negotiable build rule (spec, "NON-NEGOTIABLE BUILD RULE"):

> No material threat decision, automated response, control conclusion,
> compliance assertion, customer-facing risk score, AI recommendation,
> privileged administrative change, commercial entitlement, or public claim
> may complete without an attributable, tenant-scoped, time-stamped and
> integrity-protected evidence record.

Therefore development begins with architecture decisions, executable
contracts, registries, threat modeling, and a synthetic reference flow — not
disconnected product features.

---

## 2. ERB-01 backend objective

The first backend release delivers one complete vertical slice:

```text
Tenant onboarding
    ↓
Connector configuration
    ↓
Telemetry ingestion
    ↓
Validation and normalization
    ↓
Deterministic detection
    ↓
Alert and case creation
    ↓
Human-reviewed AI assistance
    ↓
Control evaluation
    ↓
Evidence ledger
    ↓
Audit package
    ↓
Offline verification and export
```

In scope: Managed Defense and Continuous Assurance as independently usable
offers; a pooled regional-cell deployment model; R0 observation, R1
recommendation, and response simulation; gateway-controlled AI with
citations and deterministic fallback; Microsoft identity/productivity,
AWS/Azure, generic webhook/syslog, one ticketing source, one vulnerability
source, one certified EDR integration; reference scale of 3–10 tenants,
2,000–10,000 resources, 0.2–2 TB/day ingestion, ~15,000 events/sec peak.

Out of scope for ERB-01: live R2+ automated response, a standalone SIEM,
Zoiko-built EDR, sovereign/private/OT deployment, marketplace and mobile
apps, customer-facing AI-governance workspace, sector-specific forks.

---

## 3. Backend architecture decision

### 3.1 Deployment model

Modular monolith plus four isolated satellites (spec: "shield-core modular
monolith plus four isolated satellites: shield-ingest, shield-ai,
shield-action and shield-anchor").

```text
                         ┌─────────────────────────┐
                         │ Global Control Plane    │
                         │ Tenant directory        │
                         │ Catalog metadata        │
                         │ Signed configurations   │
                         │ Deployment inventory    │
                         │ Aggregate health        │
                         └────────────┬────────────┘
                                      │ Signed, bounded metadata
              ┌───────────────────────▼──────────────────────┐
              │             Regional Tenant Cell              │
              │  ┌────────────────────────────────────────┐  │
              │  │ shield-core (modular monolith)          │  │
              │  └────────────────────────────────────────┘  │
              │  shield-ingest       shield-ai                │
              │  shield-action       shield-anchor             │
              │  PostgreSQL          Event backbone            │
              │  Object/evidence     Search/analytics          │
              │  Cache               Observability             │
              └──────────────────────────────────────────────┘
```

The global plane must not contain raw telemetry, evidence content, customer
secrets, unrestricted personal information, regional search indexes, case
narratives, or customer model prompts. Regional cells hold tenant telemetry,
cases, evidence, AI retrieval data, regional keys, and audit state.

### 3.2 Day-one deployables

#### `shield-core`

Owns (spec Appendix C — corrected/complete list): `tenant`, `organization`,
`identity-adapter`, `authorization`, `catalog`, `price-book`,
`contract`/`subscription`, `entitlement`, `metering`, `obligation`, `cost`,
`asset`, `identity-context`, `exposure`, `threat-context`,
`detection-registry`, `alert`, `case`, `playbook-definition`, `control`,
`evidence-metadata`, `assessment`, `risk`/`exception`, `audit-package`,
`privacy`, `reporting`, `notification`, `support-integration`.

> Correction: an earlier draft of this plan omitted `price-book`,
> `obligation`, `cost`, and `threat-context`, and its repository-layout
> section (§5) listed a shorter, inconsistent module set. This version uses
> one module list everywhere.

Each module must own its database schema/namespace, expose an internal
application interface, publish versioned events, declare allowed
dependencies, evaluate authorization at its boundary, reject direct writes
into another module's tables, and use a transactional outbox when state
changes publish events.

#### `shield-ingest`

Connector registry, connector runtime, ingestion gateway, source
authentication, schema validation, raw-payload handling, normalization,
OCSF-aligned mapping, quarantine, replay, stream publication,
connector-health monitoring, connector-certification tests. Must never
write authoritative control conclusions or invoke customer actions.

#### `shield-ai` (spec: `shield-ai-gateway`)

Provider/model registry, prompt and agent profiles, AI policy, redaction,
retrieval brokerage, tool mediation, controlled memory, evaluation
harnesses, usage/cost controls, AI incident telemetry, kill switches and
deterministic fallback. Must be disableable without disabling deterministic
detection, evidence, case, authorization, or recovery operations.

#### `shield-action` (spec: `shield-action-broker`)

Response policy evaluation, approval verification, short-lived credential
exchange, command signing, rate/blast-radius ceilings, dispatch, execution
receipts, observed-state reconciliation, rollback/compensation, tenant/
connector/regional/global freeze controls. ERB-01 exposes simulation and R1
recommendation interfaces only; live R2+ execution stays disabled.

#### `shield-anchor` (spec: `shield-evidence-anchor`)

Evidence checkpoint construction, tenant chain-head aggregation, Merkle-root
calculation, HSM/KMS signing, witness publication, public verification
material, anti-equivocation monitoring. Cannot change evidence records or
application state. `shield-core` must not have access to anchor signing
keys.

---

## 4. Implementation baseline

The spec is intentionally provider-neutral — none of the concrete
technology names below (NestJS, Fastify, etc.) appear in the source PDF.
This is a practical engineering baseline **[derived]**, subject to Gate-0
ADR approval, and it matches what the current `backend/` codebase already
uses.

```text
Language:              TypeScript
Runtime:               Node.js (LTS; repo currently pinned to v22)
API framework:         NestJS (Express adapter today; Fastify adapter is an option, not yet adopted)
Validation:            class-validator/class-transformer at the edge, JSON Schema for cross-service contracts
Database migrations:   SQL-first controlled migrations
API contracts:         OpenAPI
Event contracts:       AsyncAPI and JSON Schema
Internal architecture: Domain modules with explicit ports and interfaces
```

Data platform (spec-confirmed: PostgreSQL, Kafka-compatible backbone):

```text
Relational authority:  PostgreSQL
Event transport:       Managed Kafka-compatible backbone (local dev: Redpanda)
Raw/lake storage:      S3-compatible object storage (local dev: MinIO)
Evidence vault:        Encrypted object storage with object-lock/WORM policy
Hot analytics:         OpenSearch-compatible service
Cache/coordination:    Redis, strictly non-authoritative
Workflow engine:       Deterministic durable workflow engine selected through ADR
Policy engine:         Versioned ABAC policy engine
Secrets and keys:      Vault/KMS/HSM-backed services
```

The relational store is the system of record. The event backbone is durable
transport/replay, not business truth. Object storage holds raw/normalized
telemetry. Search is a rebuildable projection. Cache loss must never imply
loss of authoritative state.

---

## 5. Repository structure

```text
zoikoshield-backend/
├── apps/
│   ├── shield-core/
│   │   └── src/modules/
│   │       ├── tenant/            ├── entitlement/       ├── control/
│   │       ├── organization/      ├── metering/          ├── evidence-metadata/
│   │       ├── identity-adapter/  ├── obligation/         ├── assessment/
│   │       ├── authorization/     ├── cost/               ├── risk/
│   │       ├── catalog/           ├── asset/              ├── exception/
│   │       ├── price-book/        ├── identity-context/   ├── audit-package/
│   │       ├── contract/          ├── exposure/           ├── privacy/
│   │       ├── subscription/      ├── threat-context/     ├── reporting/
│   │       │                      ├── detection-registry/ ├── notification/
│   │       │                      ├── alert/               └── support-integration/
│   │       │                      ├── case/
│   │       │                      └── playbook-definition/
│   ├── shield-ingest/
│   ├── shield-ai/
│   ├── shield-action/
│   ├── shield-anchor/
│   └── verifier-cli/
│
├── packages/
│   ├── canonical-context/   ├── evidence-sdk/     ├── outbox/
│   ├── contracts/           ├── crypto-profile/   ├── error-model/
│   ├── event-envelope/      ├── observability/    └── testing/
│   ├── authorization-client/├── idempotency/
│
├── contracts/{openapi,asyncapi,events,commands,webhooks,actions,ai-tools}/
├── registries/{requirements,services,schemas,connectors,ai,evidence,risks,slos,releases}/
├── database/{migrations,policies,seeds,reconciliation}/
├── infrastructure/{modules,environments,policies,gitops,recovery}/
├── docker/                 # [derived] local dev, see §19
├── docker-compose.yml      # [derived] local dev, see §19
├── tests/{architecture,contracts,tenant-isolation,replay,adversarial,performance,restore,offboarding}/
└── docs/{adrs,threat-models,runbooks,release-evidence}/
```

Only `apps/shield-core` exists in the repo today (`backend/apps/shield-core`),
with 5 of its ~28 planned modules scaffolded (`tenant`, `customer`*,
`organization`, `legal-entity`, `environment`) — all in-memory, no
persistence yet. `customer` is not in the spec's module list and should be
reconciled against `asset`/`identity-context` before it grows further.

---

## 6. Canonical context contract

Every material API request, command, event, evidence record, AI call, and
action must propagate this context. **Two representations, by design:**

- **Wire format** (spec §6.1, events, JSON payloads): `snake_case` —
  `tenant_id`, `legal_entity_id`, `correlation_id`, `contract_version`, etc.
- **Internal TypeScript type** (already implemented at
  `backend/apps/shield-core/src/modules/tenant/interfaces/canonical-context.interface.ts`):
  `camelCase`, same 19 fields.

```ts
interface CanonicalContext {
  tenantId: string;
  legalEntityId: string;
  environmentId: string;
  region: string;

  actorId?: string;
  workloadId?: string;

  correlationId: string;
  causationId?: string;
  traceId: string;
  requestId: string;
  idempotencyKey?: string;

  purpose: string;
  dataClass: string;
  policyVersion: string;

  contractId: string;
  contractVersion: string;

  occurredAt?: string;
  observedAt?: string;
  recordedAt: string;
}
```

A serialization boundary (e.g. in `packages/canonical-context`) must convert
between the two — do not let `camelCase` leak onto the wire or `snake_case`
leak into TS domain code. Reject operations when required context cannot be
resolved; never silently assign a default tenant or region (the current
`customer`/`organization`/`legal-entity`/`environment` services do this
today with hardcoded `'default-tenant'`/`'dev'` values — this must be fixed
before Checkpoint 3 is considered done).

---

## 7. Mandatory backend build sequence

**[derived]** — the spec's actual roadmap (§28, "Delivery Roadmap, Assurance
Gates and Kill Criteria") is phrased as ~2-quarter phases (Foundation →
Wedge Design-Partner MVP → Managed Defense GA → ...), not these ten
numbered checkpoints. The checkpoints below are a practical decomposition
of "Phase 0 — Foundation" and "Phase 1 — Wedge Design-Partner MVP" for
sprint planning; treat them as a working breakdown, not spec text to cite
verbatim.

1. **Governance and source control** — ERB-01 release manifest, requirement
   register, module catalog, ADR register, risk/exception register, release
   evidence register, repo ownership, PR protection, workstream packs.
2. **Evidence and data moat** (build before broad feature work) — canonical
   domain identifiers, evidence-record contract, evidence manifests,
   append-only ledger prototype, hash-chain/canonicalization profile,
   checkpoint builder, witness adapter, offline verifier CLI, canonical
   event envelope.
3. **Platform and identity foundation** — tenant hierarchy, legal
   entities/environments, regional tenant placement, human/workload
   identities, OIDC/SAML/SCIM boundary, RBAC+ABAC, step-up auth, JIT
   privileged access, delegated support-access workflow, audit events for
   all privileged operations.
4. **AI and interface boundaries** (define before implementing AI features)
   — approved AI use cases, provider/model routes, prompt profiles,
   retrieval manifests, tool capabilities, memory policies, evaluation
   requirements, API/event/command/webhook/action/AI-tool contracts.
5. **P0 ingestion** — generic webhook, generic syslog, one cloud source, one
   identity/productivity source, one vulnerability source, one ticketing
   source, one EDR source. Prove authentication, schema validation,
   duplicate handling, replay, backpressure, quarantine, source lineage,
   connector health, region routing.
6. **Detection and control vertical slice** — versioned deterministic point
   detection, detection registry, signed rule packages, replay fixtures,
   alert generation, evidence collectors, control evaluator, explicit
   complete/incomplete/stale/unknown/failed states.
7. **Case and response proposal** — case state machine, timeline,
   alert-to-case linkage, investigation notes/evidence, AI-generated cited
   summary, human decision record, R1 response recommendation, response
   simulation, signed simulation command, simulation receipt,
   rollback/compensation declaration.
8. **Experience-facing APIs** — BFF/API contracts for customer, analyst,
   auditor, administrator, executive, developer/integration users. Every
   API exposes explicit loading, partial, stale, degraded, unauthorized,
   unavailable, and recovery states.
9. **Integrated verification** — full vertical-slice tests, cross-tenant
   negative tests, AI prompt-injection/tool-abuse tests, detection replay
   tests, evidence tampering tests, offline package verification,
   backup/restore, regional-cell recovery, synthetic tenant
   offboarding/deletion, cost/capacity testing.
10. **G1 readiness** — operations handoff, dashboards/alerts, runbooks,
    on-call ownership, support procedures, privacy/legal review, customer
    disclosures, known-limitations documentation, release evidence, formal
    G1 approval.

---

## 8. Delivery timeline

**[derived]** — the spec gives phase-level targets in quarters (§28), not
week ranges. The week breakdown below is a proposed sprint cadence for
Phase 0, consistent with the spec's ~2-quarter Foundation phase and its
Phase-0 exit proof (§9 here), not a literal spec quote.

### Phase 0 — Foundation and reference proof (~2 quarters, spec §28)

- **Weeks 1–4**: publish ERB-01 manifest; establish repos/registries; assign
  module ownership; close/default initial Gate-0 ADRs; crown-jewel threat
  model; canonical context/identifiers; CI, artifact signing, SBOM,
  provenance; non-production regional-cell skeleton.
- **Weeks 5–10**: tenant/identity foundation; module-boundary tests;
  PostgreSQL schema namespaces; transactional outbox; event backbone;
  evidence-record v0; canonicalization/hash test vectors; verifier CLI
  skeleton.
- **Weeks 11–16**: `shield-ingest`; webhook/syslog connectors;
  validation/normalization/quarantine/replay; connector-health states;
  raw/normalized event storage; ingestion observability/cost attribution.
- **Weeks 17–24**: evidence chain/package generation; `shield-anchor`;
  independent witness adapters; deterministic point detection; control
  evaluation; synthetic audit-package reference flow.

**Phase-0 exit proof** (spec §28, "Exit Gate / Proof: Synthetic tenant
produces and verifies an audit package; action simulation and freeze
work"): a synthetic tenant must be created in an approved regional cell,
ingest authenticated telemetry, generate a deterministic detection, produce
evidence and a control result, create an audit package, anchor it, verify
it offline, simulate an action, demonstrate the freeze switch, and produce
complete release/cost telemetry. **Feature expansion stops if independent
verification cannot be demonstrated** (spec kill criterion).

### Phase 1 — Design-partner vertical slice (~2 quarters, spec §28)

- **Weeks 25–32**: case management/investigation workflow; R0/R1 response
  flows; signed simulation commands/receipts; AI gateway; cited case
  summary; suggested investigation steps; deterministic fallback; analyst
  review/override events.
- **Weeks 33–40**: Core Assurance control library; evidence
  collector/evaluator packages; risk/exception workflows; audit package
  generation; customer/auditor APIs; export/offboarding workflows;
  connector permission-drift monitoring.
- **Weeks 41–48**: reference-scale testing; cross-tenant isolation testing;
  AI adversarial testing; restore/reconciliation exercises;
  operations/support rehearsals; documentation/disclosure review;
  design-partner readiness evidence; G1 decision.

Entry gate per spec: ≥3 signed design partners + Phase-0 proof. Exit gate:
at least one real audit/readiness cycle uses exported evidence,
auditor/customer feedback accepted with tracked limitations. No real
customer data, customer AI-assisted workflow, or live response path may be
enabled before the G1 decision and release evidence are recorded.

---

## 9. Evidence implementation flow

```text
Source payload → source auth/integrity → raw payload reference →
canonical normalized event → collector execution → evidence record →
evidence manifest → control evaluator → control-assessment state →
append-only tenant ledger → Merkle checkpoint → independent witnesses →
frozen audit package → offline verifier
```

The ledger proves integrity and history. It must not claim evidence is
semantically correct, complete, legally compliant, or sufficient for
certification merely because the cryptographic chain verifies.

Every control result must include: evaluator ID/version, input evidence
IDs, expected evidence manifest, freshness/completeness state, evaluation
time, result, confidence/limitation, human review status, superseded result
reference, ledger reference.

---

## 10. AI implementation rules

AI must **not** control: authentication, authorization, entitlements,
tenant/residency routing, evidence hashes or chain verification, final
compliance state, detection execution authority, response approval,
metering, recovery authority.

AI **may**: summarize evidence, explain alerts, suggest investigation
queries, recommend mappings, draft case narratives, recommend response
options, help analysts understand system state.

Every AI result must carry: `use_case_id`, `provider_profile`,
`model_profile`, `prompt_profile`, `retrieval_manifest`, source citations,
tool calls, policy version, data/region classification, human review
status, fallback status, cost/latency, trace and evidence references.

---

## 11. API and event rules

APIs/events are versioned. Events describe past-tense facts; corrections
create new events, never silently rewrite history. Commands identify actor,
authority, purpose, policy, expiry, idempotency. Consumers assume
at-least-once delivery and duplicates. External effects require receipts
and reconciliation. Failure/timeout/retry/backpressure/dead-letter/degraded
behavior are declared. Connectors never write directly to application
databases and never self-escalate from read to action access. AI uses
registered gateway/tool contracts only. Secrets are referenced via vault
identifiers, never embedded in contracts.

---

## 12. Security baseline

Tenant context at every boundary; application authorization plus
database-level defense in depth; workload identities; short-lived service
credentials; JIT privileged access with recorded sessions; separation of
action/application/anchor authority; encryption in transit and at rest;
tenant- and purpose-aware key access; egress allowlists; no direct internet
access from `shield-core`; signed artifacts and admission verification;
per-tenant connector credentials; secret scanning; dependency/container
scanning; tamper-evident security events; tenant/connector/action-type/
region/global kill controls.

Cross-tenant tests must cover: API, relational database, object storage,
search, cache, queue, logs, backups, AI retrieval, AI memory,
observability, support access.

---

## 13. Testing strategy

1. Unit tests. 2. Domain state-machine tests. 3. Database constraint tests.
4. API contract tests. 5. Event compatibility tests. 6. Architecture
boundary tests. 7. Cross-tenant negative tests. 8. Connector certification
tests. 9. Detection replay tests. 10. Evidence tampering tests. 11. AI
adversarial tests. 12. Action signing/replay tests. 13. Performance/soak
tests. 14. Chaos/degradation tests. 15. Backup/restore tests. 16. Regional
recovery tests. 17. Offboarding/deletion tests. 18. Cost/capacity tests.
19. Accessibility/experience-contract tests. 20. Release-evidence
reconciliation.

---

## 14. CI/CD pipeline

```text
PR → format/lint → requirement & contract validation → architecture
dependency tests → unit/integration tests → migration validation →
tenant-isolation tests → security/secret scanning → dependency/license
policy → SBOM generation → container build → provenance generation →
artifact signing → ephemeral environment → contract & e2e tests → staging
deployment → performance/adversarial/restore tests → release manifest
generation → approval → canary deployment → runtime reconciliation →
release evidence closure
```

Release blockers: unknown production resources, public exposure without
review, any cross-tenant path, unsigned artifacts, uncontrolled drift,
missing rollback, failed evidence reconciliation, untested restore,
prohibited region routing, standing broad production privilege.

---

## 15. Observability and operational readiness

OpenTelemetry-compatible traces/metrics/logs. Dashboards: API
availability/latency; ingestion acceptance; queue lag/backlog age;
connector freshness/authorization; normalization/quarantine; detection
execution/replay; evidence freshness/completeness; anchor/witness status;
AI route availability/cost/grounding/kill state; action
proposals/approvals/receipts/rollback/freeze; authorization
denials/privileged sessions; database/object store/search/cache/event
backbone health; backup/restore; release/deployment health; tenant-level
cost/capacity; audit-event reconciliation.

---

## 16. Workstream ownership

1. Architecture, governance, developer platform. 2. Tenant, identity,
authorization, commercial controls. 3. Data contracts, event architecture,
persistence. 4. Ingestion and connectors. 5. Evidence ledger, control
evaluation, audit packages. 6. Detection, alerts, cases, investigation.
7. AI gateway and model-risk controls. 8. Response broker and action
safety. 9. Infrastructure, reliability, FinOps. 10. Security engineering.
11. Quality and release evidence. 12. Service operations and support
readiness.

Spec-confirmed planning total: **~38–48 dedicated FTE in Phase 0–1**, ~53–71
in Phase 2–3, before full organic 24/7 coverage. A substantially smaller
team can produce a technical prototype but that should not be represented
as Gate-1 readiness.

---

## 17. First 30-day execution checklist

- **Week 1**: create monorepo; code owners; branch protection; ADR/
  requirement/service/schema/risk/release registers; ERB-01 release
  manifest; module naming/dependency rules.
- **Week 2**: canonical request/event context; tenant/regional placement
  objects; API error/degraded-state model; command/event envelopes;
  evidence-record v0; audit-event taxonomy.
- **Week 3**: scaffold all five deployables; PostgreSQL schema namespaces;
  architecture tests; transactional outbox; event-backbone dev
  environment; OpenTelemetry instrumentation; signing/SBOM/provenance
  pipeline.
- **Week 4**: first synthetic flow — create tenant → create environment →
  authorize workload → accept synthetic event → normalize event → store
  provenance → create evidence record → place record in tenant ledger →
  build checkpoint → verify checkpoint with CLI.

Do not begin broad detection, dashboard, AI, or connector work until this
path is working and testable.

---

## 18. Final G1 acceptance checklist

G1 is ready only when: the ERB-01 manifest is current; all committed
requirements have owners and evidence; module and database boundaries are
enforced; cross-tenant tests pass; synthetic and design-partner evidence
packages verify offline; detection replay is deterministic; cases and R1
simulation produce complete evidence; AI outputs are cited, reviewed,
bounded, and replaceable by deterministic fallback; regional routing,
retention, deletion, and access controls are approved; reference-scale and
cost testing is complete; restore/reconciliation are proven; runbooks,
dashboards, on-call, and support processes exist; signed artifacts, SBOM,
provenance, and release approvals are complete; export and synthetic
offboarding succeed; Privacy, Security, AI Risk, Architecture, QA, SRE,
Product, and Service Operations approve the gate.

The release is evaluated as one complete end-to-end slice — completing
isolated services or modules does not constitute release completion.

---

## 19. Local development: Docker setup **[derived]**

Not in the source spec (which is infra-provider-neutral) — this is a
concrete, minimal local stand-in for the "non-production regional-cell
skeleton" called for in Week 1–4 of the execution checklist (§17), sized
for a laptop, not for the production Kubernetes/Terraform/GitOps stack in
§0 of this doc.

Mapping from spec data-platform roles → local dev container:

| Spec role                     | Local dev stand-in     | Why |
|---|---|---|
| Relational system of record   | `postgres:16-alpine`   | Same engine as production target |
| Event backbone (Kafka-compat) | `redpanda`              | Kafka-API-compatible, single-binary, no ZooKeeper |
| Object/raw/evidence storage   | `minio`                 | S3-compatible API |
| Hot analytics/search          | `opensearch` (optional profile) | Heavy; only needed once detections/cases land |
| Cache/coordination            | `redis:7-alpine`        | Explicitly non-authoritative per §4 |
| `shield-core`                 | built from `backend/Dockerfile` | The only deployable implemented today |

`shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor` have no code
yet (§5) — they're deliberately left out of compose until each app exists,
rather than stubbed.

**`DATABASE_URL` override:** `docker-compose.yml` reads `DATABASE_URL` from
the environment/`.env` file and, if set, uses it verbatim instead of
building a connection string for the local `postgres` container — this lets
`shield-core` point at an external managed Postgres (e.g. Neon) during
early development while the local container stays available for offline
work. **`.env` holding a real `DATABASE_URL` must never be committed** — it
is covered by the root `.gitignore` (only `.env.example` is tracked). If a
production/shared-project credential is ever pasted into a chat, ticket, or
log, treat it as compromised and rotate it at the provider — chat history
is not a secrets store.

Files added:

- `backend/Dockerfile` — multi-stage Node 22 build (deps → build → runtime),
  runs `dist/apps/shield-core/main.js` as a non-root user.
- `backend/.dockerignore`
- `docker-compose.yml` (repo root) — postgres, redpanda, minio, redis,
  optional opensearch profile, and `shield-core`.
- `.env.example` (repo root) — compose variable defaults.

Usage:

```bash
cp .env.example .env
docker compose up --build          # core stack
docker compose --profile search up # include OpenSearch
```

`shield-core` is not yet wired to Postgres/Redpanda/MinIO in code (all
modules are in-memory today, per §5/§6) — the compose file provisions the
infrastructure ahead of that work so Checkpoint 2/3 (§7) can start against
real services instead of another round of environment setup.
