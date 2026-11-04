# ZoikoShield Public Assistant — Implementation Plan

Sources: the Master spec (`ZS-CHAT-MASTER-013`) and wireframes WF01–WF12 in this folder, checked against the code in this repo as of 2026-10-26.

Status: **engineering proposal**. The decisions marked **[DECIDE]** need an owner before the phase that depends on them.

## Build status (2026-10-27)

| Phase | State | Notes |
|---|---|---|
| 0 Foundations | Done | Service, schema, DB role, boundary test. ADR-21 is proposed (`docs/adrs/ADR-21-PROPOSAL-public-assistant-architecture.md`). The OpenAPI paths are in `docs/swagger.yaml`, which the CI gate reads, instead of a separate file. `libs/ai-runtime` was **not** extracted; see ADR-21 D1 for why. |
| A Shell + static help | Done | Launcher, panel, proxy, sessions, config/status, help search and topic tiles. |
| B Content + journeys | Done | WF05 discovery, WF06 plans (read side), WF07 trust (read side), WF08 integrations (read side), WF09 onboarding. All content is engineering samples in `REVIEW`. |
| C Controlled AI answers | Built, flag OFF | Rules classifier, answer guard, validate-then-stream SSE, budgets, breaker. Only the `mock` model exists until ADR-11. |
| D Intake + delivery | Built, flags OFF | Six intake journeys, encrypted payloads, idempotent receipts, transactional outbox, log-only delivery. Privacy requests stay link-only. Forms are off until `PUBLIC_ASSISTANT_NOTICE_VERSION` and a KMS key are set. |
| E Verification + gates | Partly done | AT traceability: `docs/AI_Assisstant/TEST_TRACEABILITY.md`. Still to do: manual a11y passes, load and abuse runs, threat-model review, DR drill, dashboards, and gates G0–G6. |

---

## 0. What we are building, in one paragraph

We are building a chat widget for the **public website**, for anonymous visitors. It can:
- answer product, help, trust, integration and pricing questions, using **only approved public content and citing it**;
- run guided, deterministic flows: discovery, plan comparison, onboarding checklist, troubleshooting;
- take **intake requests** (demo, support, quote, trust document, technical evaluation, onboarding contact, privacy request). Each request gets an idempotent, durable receipt and is delivered to the CRM or helpdesk through an outbox.

Things it must never do:
- touch tenant data, SOC/SOAR, or the authenticated app;
- invent prices, certifications, connector support or "booked" states;
- keep working without the AI. When the AI is off, the assistant falls back to static help, and that path has to work fully.

---

## 1. Architecture decisions (proposed defaults)

### D1. A new backend app: `backend/apps/shield-public-assistant` (port 3006)
- **Why not inside shield-core?** The master spec (§5.3, GAP-03) requires a dedicated public BFF with no route to tenant, SOC or SOAR surfaces. A separate app gives us:
  - its own process and DB role (`shield_public_assistant_svc`), which can only see a new `public_assistant` Postgres schema;
  - its own model credentials;
  - its own network policy (no egress to shield-core/ingest/ai/action/anchor);
  - its own kill switch.
- **Why not inside shield-ai?** shield-ai's `AiGatewayService` and `RetrievalBrokerService` are built around tenant and case context (`GatewayRequestContext.tenantId`, case-bundle retrieval). Public retrieval is a different corpus with different rules.
- **What we reuse:** the *pure* pieces of shield-ai, extracted into a new lib `backend/libs/ai-runtime`. shield-ai keeps working by importing them from there.
  - `ModelProvider` interface and the Gemini, OpenAI and Mock adapters (`shield-ai/src/provider-registry/*`);
  - `RedactionService`;
  - prompt-injection patterns (`model-armor-safety-gateway.service.ts`, which is a regex filter today);
  - `CitationValidatorService`.
- **Patterns we copy** (not imported, because they are shield-core-internal): `IdempotencyService` (key + SHA-256 fingerprint → replay or 409), the token-bucket `DistributedRateLimiterService`, and the outbox publisher.
- All controllers use `@PublicEndpoint()`-style metadata so that `npm run access:check` passes. The service has **no** authenticated endpoints. Its admin and content endpoints are internal-only (see D5).

### D2. Frontend: a widget inside `frontend/`, behind a strict same-origin proxy
- **Widget location:** `frontend/src/components/public-assistant/**`. It is lazy-loaded with `next/dynamic` so the host page's Core Web Vitals don't suffer (WF01: INP ≤200ms, CLS ≤0.1, LCP ≤2.5s).
- **New proxy:** `frontend/src/app/api/public/chat/v1/[...path]/route.ts`. Rules:
  - forwards only to `PUBLIC_ASSISTANT_URL` (default `http://127.0.0.1:3006`);
  - strips all cookies except the assistant's own, and strips `x-tenant-id` and `authorization`;
  - **never fabricates responses**.
  - Do **not** reuse `app/api/v1/[...slug]/route.ts`: it returns simulated 200s when backends are down. That breaks master invariant #4 (no fake success).
- **Mounting:** a `PublicAssistantMount` component, rendered from `app/layout.tsx`, shows the launcher only on routes in an allowlist (`/help`, `/trust`, `/pricing`, `/login`, `/register` for now). It must never mount on authenticated SOC pages.
- **[DECIDE] Where does the real marketing site live?** `web/` is empty. If the marketing site is a separate codebase, we later also ship the widget as an embeddable bundle (same components, built separately). Building the components without coupling them to the app shell keeps that option open.

### D3. One canonical API: `/api/public/chat/v1/*`
The wireframes propose five different prefixes. We adopt the master spec's §6 list and normalize names (full contract in §3). One OpenAPI file, `docs/public-assistant.openapi.yaml`, is written **before** backend coding (GAP-02).

### D4. Retrieval = Postgres full-text search over a published-content table
- **What we use:** no vector database for v1. Approved content is chunked into `public_assistant.source_chunk`, searched with a `tsvector` column plus a GIN index, and filtered by `status='PUBLISHED' AND classification='PUBLIC'`, the effective window, market and locale.
- **Why:**
  - it is deterministic and easy to test;
  - withdrawal is instant (a row update plus a bump of a cache epoch);
  - no new infrastructure;
  - it satisfies WF10's "separate public index with its own credentials" rule, because the table lives in its own schema behind its own DB role.
- **Later:** hybrid semantic search (pgvector) can come after Phase C if quality requires it.

### D5. Content governance: content-as-code
- **Where content lives:** approved public content sits in the repo at `backend/apps/shield-public-assistant/content/`:
  - help articles, guides, trust topics, plans, connectors, discovery rules and route URLs;
  - format is YAML/Markdown with front-matter (owner, reviewer, status, market, locale, effective dates, claim_type).
- **How approval works:**
  - a PR review by the named owner *is* the publication approval;
  - CODEOWNERS enforces the reviewer per claim class (Commercial for pricing, Trust/Legal for certifications, Solutions for connectors).
- **How it reaches the database:** a `content:publish` script validates the schemas, computes checksums and upserts into the DB.
- **Withdrawing content:** set `status: withdrawn` and publish again. The cache epoch bump invalidates answers immediately (GAP-13).
- **Why:** no admin UI is needed for v1, and the audit trail is git.

### D6. The AI pipeline is fail-closed, and the server decides the outcome
- **Pipeline:**
  1. `classify` — deterministic rules: secret patterns, incident phrases, privileged/SOC intents, data-rights intents. Uses the WF12 priority order.
  2. `retrieve` — full-text search, top k.
  3. `generate` — fixed system prompt; sources go in as delimited *data*; the model returns structured JSON `{blocks[], citations[source_id]}`.
  4. `validate` — every citation must be among the retrieved IDs; URLs must be on the allowlist; restricted claim terms (certified/SOC 2/ISO/price/SLA/24×7/uptime) need a matching approved claim source.
  5. `finalize` → outcome `ANSWERED | LIMITED | ABSTAINED | REJECTED | ERROR`.
- **Streaming:** v1 uses **validate-then-stream**. We generate the full answer, validate it, then stream the sanitized blocks over SSE. This removes "partial unvalidated answer" risks (WF12 S8 / AT023). True token streaming can be a later optimisation.
- **Model provider:** **[DECIDE]**. ADR-11 (Vertex/Gemini) is *proposed, not accepted*. Build against the `ModelProvider` interface, with `mock` as the default and `assistant_ai_answers=OFF` until ADR-11 or another provider decision is accepted.

### D7. Guest session
- `POST /sessions` is called **only on the first submitted message or flow action**, never on page load (AT001, AT007).
- **Token handling:**
  - the server creates a 256-bit random token and stores only its SHA-256 hash (in Redis with a TTL, mirrored to `guest_session`);
  - the cookie is `zs_pa_sid`, `HttpOnly; Secure; SameSite=Strict; Path=/api/public/chat`;
  - each session carries a `session_epoch` (bumped on clear or new chat) that rejects stale stream chunks (WF11/WF12).
- **Protection:**
  - CSRF: Origin allowlist check, plus a custom header `X-ZS-Assistant: 1` on every mutation;
  - rate limits: per-IP-hash, per-session and a global token/cost budget, all in Redis. Thresholds come from config and are never exposed to the client (WF12).

### D8. Feature flags, using the master §14.1 names
Flags are stored in `public_assistant.feature_flag`, can be overridden by env, and are read through `GET /config`:

| Flag | Default |
|---|---|
| `assistant_launcher` | ON once G1 passes |
| `assistant_ai_answers` | OFF |
| `assistant_lead_submit` | OFF |
| `assistant_support_submit` | OFF |
| `assistant_trust_gated` | OFF |
| `assistant_public_pricing` | OFF |
| `assistant_connector_claims` | OFF |
| `assistant_privacy_write` | OFF |

There is also a global `assistant_kill` that forces static mode everywhere.

---

## 2. Reconciled conventions (where the wireframes disagree)

| Topic | Conflict | Decision |
|---|---|---|
| API prefix | `/public-assistant`, `/api/public-chat`, `/api/public/trust`, `/api/public/v1/technical`, … | `/api/public/chat/v1/*` everywhere |
| Contact field names | `contact_email` / `email` / `work_email`; `organization_name` / `org_name` / `organization` | `work_email` (≤254), `contact_name` (1–120, optional where the WF has no name field), `organization` (1–160) |
| Free-text limits | 500 (WF03/04), 240 (WF07/08) | Per-journey limits stay as specified; all free text runs through the server-side secret/PII gate |
| Composer limit | 2,000 chars vs code points | 2,000 Unicode code points, validated on the server; counter shown from 1,800 |
| Receipt shape | `public_reference` / `receipt_id` / `request_ref` / `reference`; states ACCEPTED / ACCEPTED_INTAKE / RECEIVED | `{ status: "ACCEPTED" \| "PENDING_CONFIRMATION", public_reference: "ZS-<KIND>-<base32>", submission_id }` |
| Idempotency | Client UUID vs server nonce; 409 on duplicate vs replay | Server-issued key (`POST /submissions/keys`, master §7.3). Same key + same payload → **same receipt (replay)**. Same key + changed payload → **409**. Matches the existing `IdempotencyService` semantics |
| Status lookup | GET nonce / POST secret / optional | `POST /submissions/status` with `{ public_reference, status_token }`. The token is returned once at submit and stored hashed. Ships only if **[DECIDE]** approved; otherwise there is no status endpoint |
| Source status vocabulary | five different enums | One registry: `status ∈ DRAFT, REVIEW, PUBLISHED, WITHDRAWN, EXPIRED`, `classification ∈ PUBLIC, RESTRICTED, TENANT, INTERNAL`. Domain-specific display states (e.g. WF08 `NOT_VERIFIED`, WF07 `PUBLIC_SUMMARY_ONLY`) are *computed projections* |
| Answer outcome | ALLOW/LIMIT/ABSTAIN/REFER vs ANSWERED/LIMITED/… | Wire enum from master §7.1: `ANSWERED, LIMITED, ABSTAINED, PENDING, REJECTED, ERROR`, plus `route_key` for referral (incident → `INCIDENT_ROUTE`) |
| Feedback | WF05 enum only; WF10 `{flow_id,outcome}`; WF11 rating + reason | One endpoint: `{ target_type: message\|flow\|discovery, target_id, rating: helpful\|not_helpful, reason_code? }`. No free text in v1 |
| Market | WF05 uses locale; WF06/08 require an explicit market | Market is always explicit (user picks it, or `undecided`). It is never inferred from IP or locale. Locale only selects language |
| WF01 quick actions | Page link (`WEB_DEMO`) vs in-panel flow (WF03/WF04) | In-panel flow when that journey's flag is ON; otherwise a link to the approved route URL |
| State machines | O/K/P/S/H/D/C/T/I/SD/PC overlap | One typed registry in `public-assistant/state/` (GAP-12): a global `panel` state + `journey` + per-journey `step` + `submission` state |
| ZS025–ZS032 | Undefined | Reserved; not built (GAP-01) |

---

## 3. Canonical API v1

Every response carries `api_version` and `correlation_id`. Errors use the shape `{ error_code, user_safe_message, field_errors?, retry_after?, correlation_id }`. Status codes follow master §6.1.

| Method | Path | Purpose | WF | Phase |
|---|---|---|---|---|
| GET | `/config` | display name and clearance, brand asset refs, route registry, flags, policy versions | 01 | A |
| GET | `/status` | `enabled \| degraded \| disabled`, fallback links | 12 | A |
| POST | `/sessions` | create guest session (cookie) → `{expires_at, limits}` | 01, 02 | A |
| POST | `/sessions/clear` | bump epoch, drop server transcript (if retention allows) | 11 | A |
| POST | `/messages` | `{client_message_id, content, locale, intent_key?, consent_snapshot_id?}` → 202 `{message_id}` or a synchronous LIMITED/REJECTED | 02, 12 | C |
| GET | `/messages/{id}/events` | SSE: `acknowledged, progress, delta, final, safety_limited, error` (monotonic `seq`) | 02 | C |
| POST | `/messages/{id}/cancel` | cancel | 02 | C |
| GET | `/sources/{id}` | public citation metadata | 02, 07, 10 | B |
| GET | `/help/home` | topic tiles | 10 | B |
| POST | `/help/search` | `{query≤200, locale, market, cursor}` | 10 | B |
| GET | `/help/articles/{id}` | article (404 if not eligible) | 10 | B |
| POST | `/help/guides/{id}/steps` | deterministic guide interpreter `{flow_id?, step_id, choice}` | 10 | B |
| GET | `/discovery/catalog` | priorities, roles, environments, disclaimer | 05 | B |
| POST | `/discovery/matches` | `{priority?, role?, environment?, market}` → ≤3 cards + `ruleset_version` | 05 | B |
| GET | `/commercial/plans?market=` | published plans, feature claims, price display decision | 06 | B |
| POST | `/commercial/fit` | `{market, asset_band?, ingestion_band?}` → guidance, no score | 06 | B |
| GET | `/trust/topics` and `/trust/sources/{id}` | trust topics and claims | 07 | B |
| GET | `/integrations/catalog?market=&category=` | connector availability projection | 08 | B |
| POST | `/integrations/deployment-guide` | "topics to confirm" summary | 08 | B |
| GET | `/onboarding/questions` | readiness question pack | 09 | B |
| POST | `/onboarding/checklists` | topic IDs → source-linked steps | 09 | B |
| POST | `/feedback` | unified feedback (see §2) | 02, 05, 10, 11 | B |
| POST | `/submissions/keys` | `{journey}` → `{idempotency_key, expires_at, notice_version}` | all intake | D |
| POST | `/demo-requests` | WF03 | 03 | D |
| POST | `/support/requests` | WF04 (+ `transcript_share` → server-built redacted summary) | 04 | D |
| POST | `/support/summary-preview` | redacted preview before opt-in | 04, 11 | D |
| POST | `/commercial/inquiries` | WF06 quote inquiry | 06 | D |
| POST | `/trust/access-requests` | WF07 restricted material request (human review) | 07 | D |
| POST | `/technical-reviews` | WF08 evaluation | 08 | D |
| POST | `/onboarding/requests` | WF09 contact | 09 | D |
| POST | `/privacy/requests` | WF11 DSR intake (only with a DPO-approved process) | 11 | D |
| POST | `/submissions/status` | optional, see §2 | 03–09 | D |

---

## 4. Data model (Prisma, new file `backend/prisma/schemas/public-assistant.prisma`, schema `public_assistant`)

```
guest_session        id, token_hash, epoch, created_at, expires_at, ip_hash, ua_class, revoked_at
conversation_turn    id, session_id, epoch, client_message_id (unique per session), role, outcome,
                     content_redacted?, source_ids[], policy_version, model_profile, created_at
                     -- content storage governed by retention decision; default: store NOTHING but metadata
public_source        id (opaque), kind (HELP_ARTICLE|GUIDE|TRUST_CLAIM|PLAN|CONNECTOR|CAPABILITY|ONBOARDING|PAGE),
                     title, canonical_url, status, classification, claim_type, market[], locale, edition[],
                     audience, owner, reviewer, approved_claim_hash, checksum, revision,
                     effective_from, expires_at, review_at, withdrawn_at, constraints jsonb
source_chunk         id, source_id, revision, ordinal, text, tsv tsvector (GIN)
route_registry       route_key, market, label, approved_https_url, owner, review_at, status
channel_registry     channel_id, market, label, approved_https_url, availability_source, review_at, owner  (WF04)
plan / feature_claim / price_band / sizing_band / sector_pack      (WF06 projections, FK to public_source)
connector / availability_scope                                      (WF08)
discovery_rule       ruleset_version, priority, ordered_capability_ids[]                     (WF05)
guide / guide_step   guide_id, revision, steps jsonb (allowlisted responses only)           (WF10)
feature_flag         key, enabled, updated_by, updated_at
submission           id, kind (DEMO|SUPPORT|QUOTE|TRUST_ACCESS|TECH_EVAL|ONBOARDING|PRIVACY),
                     public_reference (unique), status (DRAFT→REVIEWED→SUBMITTING→ACCEPTED|PENDING_CONFIRMATION|FAILED),
                     payload_encrypted, payload_hash, market, locale, notice_version,
                     status_token_hash?, created_at, retention_until
submission_delivery  submission_id, target (CRM|HELPDESK|PRIVACY|EMAIL), state, attempts, external_ref, last_error_code
marketing_preference id, work_email_hash, opted_in, notice_version, purpose, source, recorded_at   (segregated)
idempotency_record   key, journey, fingerprint, expires_at, response_body                              (copy of core pattern)
outbox_event         standard outbox (topic `public_assistant.submission.accepted`, etc.)
```

Rules for this data:
- Contact PII (`work_email`, `contact_name`, free text) is stored **only** in `submission.payload_encrypted`. Use the existing `libs/kms` envelope encryption, if it is suitable.
- PII never goes into logs, analytics or the outbox body. The outbox carries the `submission_id`, and the delivery worker decrypts it.

---

## 5. Folder layout

```
backend/apps/shield-public-assistant/
  src/main.ts, app.module.ts
  src/common/          guest-session.guard, origin-csrf.guard, rate-limit.guard, error envelope filter, redaction pipe
  src/config/          config + route registry + flags (WF01)
  src/session/         sessions, clear, epoch (WF01/02/11)
  src/publication/     source registry, eligibility service, FTS retrieval, cache epoch (GAP-13)
  src/safety/          intent classifier (rules), secret/PII detector, claim guard, URL allowlist (WF12)
  src/conversation/    messages, SSE, cancel, answer pipeline, prompt (WF02/12)
  src/help/            search, articles, guide interpreter (WF10)
  src/discovery/       catalog + deterministic matcher (WF05)
  src/commercial/      plans, fit, price-display decision (WF06)
  src/trust/           topics, claims (WF07)
  src/integrations/    catalog, availability projection, deployment guide (WF08)
  src/onboarding/      questions, checklist (WF09)
  src/intake/          keys, per-kind DTOs, submission service, idempotency, outbox, receipts (WF03/04/06–09/11)
  src/delivery/        worker + adapters: CrmAdapter, HelpdeskAdapter, PrivacyAdapter (+ Noop/Log adapters)
  src/feedback/        unified feedback
  src/observability/   metrics (outcome counts, latency buckets, dead letters) — no raw text
  content/             content-as-code (D5)
  test/                e2e + adversarial suites keyed by AT IDs
backend/libs/ai-runtime/   ModelProvider + adapters, RedactionService, injection patterns, citation validator (extracted)

frontend/src/components/public-assistant/
  PublicAssistantMount.tsx, Launcher.tsx, Panel.tsx, Header.tsx
  state/        machine.ts (typed state registry), reducer, events
  api/          client.ts (typed v1 client, SSE reader, idempotent submit helper)
  thread/       MessageList, UserBubble, AssistantTurn, CitationCard, SafeMarkdown, JumpToLatest, Composer
  flows/        demo/, support/, discovery/, commercial/, trust/, integrations/, onboarding/, help/
  shared/       Field, ErrorSummary, ReviewStep, ConsentCheck, SubmissionReceipt, UncertainOutcome, HelpRoute, StatusBanner
  settings/     SettingsPanel, FeedbackControl, ClearConversationDialog, TranscriptExport
  copy/en-US.ts   all strings by key (demo.*, handoff.*, …) — no hard-coded display name
  registry.ts     ZS-ID → component map for test traceability (ZS025–ZS032 reserved)
frontend/src/app/api/public/chat/v1/[...path]/route.ts   strict proxy (D2)
```

---

## 6. Delivery plan (phases follow master §11, "Controlled build order")

### Phase 0 — Foundations (≈1 week)
1. Write **ADR-21: Public Assistant architecture** (D1–D8) and get CTO/AppSec review (gate G2 prerequisite).
2. Write `docs/public-assistant.openapi.yaml` for the full v1 surface (§3).
3. Scaffold `shield-public-assistant`:
   - nest-cli project and npm scripts (`build:public-assistant`, `test:e2e:public-assistant`);
   - Dockerfile target and `docker-compose.yml` service on 3006, with no `SHIELD_*_BASE_URL` env vars;
   - DB role, plus `scripts/apply-database-access.js` grants for the `public_assistant` schema only.
4. Add the Prisma schema file and run the migration.
5. Extract `libs/ai-runtime` from shield-ai. This is a pure move; shield-ai tests must stay green.
6. Write the CI checks:
   - a unit test proving the app module imports no `*Client` for internal services;
   - a lint rule banning `x-tenant-id`;
   - `access:check` passes.

### Phase A — Shell + static help, AI off (≈2 weeks)
**Backend:**
- `/config` and `/status`;
- `/sessions` and `/sessions/clear`;
- the guards (origin/CSRF, rate limit, error envelope);
- the route registry seeded from `content/routes.yaml`.

**Frontend:**
- proxy route, Mount, Launcher, Panel (desktop modeless dialog, mobile modal with `aria-modal`), Header with the AI disclosure and display-name fallback;
- welcome screen with 4 quick actions (links for now), safety notice, privacy link, human route;
- composer UI with validation;
- `StatusBanner` and static fallback;
- settings panel (local parts: analytics preference, privacy link).

**Done when:** AT001–AT014 pass, apart from the AI-dependent parts (AT007 and AT010 are partial until Phase C). Keyboard, NVDA/VoiceOver, 320px and 400% zoom are checked manually.

### Phase B — Content registry + deterministic journeys, AI off (≈3–4 weeks)
1. `publication/`:
   - content schemas, the `content:publish` script, chunking and FTS;
   - the eligibility service (status, classification, window, market, locale);
   - the cache epoch and withdrawal.
2. **WF10 Help:** search, articles, guide interpreter, no-results and degraded states.
3. **WF05 Discovery:** catalog plus the deterministic matcher (max 3 cards, ruleset version, no_match).
4. **WF06 Plans, read side:** plan list and compare, the four-valued feature claims, the price display decision. `quote_required` stays the default until the `assistant_public_pricing` flag is on.
5. **WF07 Trust, read side:** topics and claims with the claim policy matrix (ALLOW/QUALIFY/ABSTAIN).
6. **WF08 Integrations, read side:** availability projection, where any gap means `NOT_VERIFIED`; the deployment "topics to confirm" summary.
7. **WF09 Onboarding:** persona routing, question pack, deterministic checklist, copy/export.
8. Unified `/feedback`.

**Done when:** AT073–AT098 pass, plus the read parts of AT099–AT188, AT189–AT224 and AT225–AT262. A revocation test (withdrawn source disappears within one request) is green.

**Blocked by:** G1 content approvals. Until real content arrives, ship with a small **reviewed seed corpus**.

### Phase C — Controlled AI answers (≈3 weeks, behind `assistant_ai_answers`)
1. `safety/`:
   - rules-based intent classifier using the WF12 priority order: incident > secrets > privileged/SOC > privacy > write intents > info > discovery;
   - secret/PII detector (reusing `RedactionService` plus honeytoken patterns);
   - claim guard; URL allowlist.
2. `conversation/`:
   - message intake with idempotency on `client_message_id`;
   - the pipeline from D6;
   - SSE events, cancel, epoch guard;
   - token and cost budgets; circuit breaker; kill switch → static fallback.
3. Frontend thread:
   - message list with `role="log"`, citation cards, the SafeMarkdown subset (no raw HTML, images or iframes);
   - follow-up chips from allowed intents only;
   - Stop/Retry, Jump to latest, New chat.
4. Adversarial suite (WF12): direct/indirect/Unicode injection, system-prompt extraction, poisoned source, SOAR/tenant requests, certification and price overclaims, over-refusal checks ("malware" and "pen test" must still be answered at a high level).
5. **[DECIDE] model provider + DPA** (ADR-11) before the flag is turned on anywhere except dev.

**Done when:** AT015–AT030 and AT299–AT340 pass, and the citation-correctness evaluation pack (a golden set) passes.

### Phase D — Intake writes + delivery (≈3–4 weeks, one flag per journey)
1. `intake/`:
   - keys endpoint, per-kind DTOs (`class-validator`, `forbidNonWhitelisted`), the secret gate on free text;
   - encrypted payload, idempotency (replay vs 409), durable accept plus outbox in one transaction;
   - `public_reference` generator; optional status token.
2. `delivery/`:
   - an outbox worker with retries, backoff, a DLQ and supervised replay;
   - adapters behind interfaces. Until real systems are chosen, the adapters are `LogOnly`, and the UI shows **"ACCEPTED"** (meaning durable intake), never "booked" or "ticket created".
   - `INTAKE_ACCEPTED`, `CRM_DELIVERY_STATE` and `EMAIL_DELIVERY_STATE` are tracked separately.
3. Frontend: shared `ReviewStep`, `ConsentCheck` (marketing unchecked and separate), `SubmissionReceipt`, and `UncertainOutcome` (retry with the same key). Journeys:
   - WF03 demo;
   - WF04 support (route chooser, incident route with no intake, transcript-summary preview);
   - WF06 quote;
   - WF07 access request;
   - WF08 evaluation;
   - WF09 contact;
   - WF11 privacy request (link-only until DPO approval).
4. Segregated marketing-preference store.

**Done when:** AT031–AT072 pass, plus the write parts of WF06–WF09 and AT263–AT298. Chaos tests also pass: CRM down after accept, timeout before receipt, double submit.

**Blocked by:**
- **[DECIDE]** which CRM and helpdesk (RevOps/Support);
- lawful basis and retention (Privacy);
- notice texts (Legal).

### Phase E — Verification and launch gates (≈2 weeks, overlaps D)
- Import AT001–AT340 into test management. Each automated test name starts with its AT ID (e.g. `it('AT038 double submit → one receipt')`).
- Run the a11y audit (axe in Vitest/Playwright plus manual NVDA, VoiceOver and TalkBack), load and abuse tests, the threat-model review, the DR and rollback drill, and the monitoring dashboards and alerts listed in master §14.2.
- Close gates G0–G6. Roll out: internal → `/help` only → all public routes.

---

## 7. Decisions needed from others (raise these now)

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | Where the launcher lives (this Next app's public routes vs a separate marketing site) | Product/Web | A (mounting) |
| 2 | Public display name ("ZoikoShield Assistant"; "Zhield" pending), logo/favicon assets | Brand/Legal | A release |
| 3 | Canonical route URLs (demo, pricing, support portal, privacy notice, incident channel) | Web/Support | A |
| 4 | Model provider + DPA/region/retention (ADR-11) | AI Risk/Security/Legal | C enablement |
| 5 | Initial public corpus and owners per claim class (help, trust, plans, connectors) | Product/Commercial/Trust/Solutions | B content |
| 6 | Retention per data class (transcript, feedback, each submission kind, abuse logs) | Privacy/DPO | C/D persistence |
| 7 | CRM and helpdesk systems + idempotent API support; does "success" mean intake or CRM delivery? | RevOps/Support | D |
| 8 | Whether submission status lookup ships | Product/Security | D |
| 9 | Rate-limit thresholds, model deadline, cost budget | SRE | C |
| 10 | Pricing publication (or quote-required only) | CFO/Commercial | `assistant_public_pricing` |
| 11 | ZS025–ZS032 resolution | Product/Design | none (reserved) |

---

## 8. Main risks

- **Fake-success proxy reused by accident.** Mitigation: a separate route, plus a test that a stopped backend → 503 in the UI.
- **Public assistant reaches internal services.** Mitigation: no internal clients in the module, no service URLs in env, a network policy in GCP, and an e2e test asserting the denied paths (`/alerts`, `/cases`, `/actions`, `/ai`, `/anchor`, `/tenants`).
- **Ungoverned content enters retrieval.** Mitigation: content-as-code + CODEOWNERS + eligibility filter on every query + epoch invalidation.
- **Scope creep across 12 journeys.** Mitigation: phases with feature flags. Phases A+B already deliver a useful, AI-free assistant.

---

## 9. First tickets (start here)

1. ADR-21 draft (this document §1–§2 condensed).
2. OpenAPI v1 skeleton for Phase A endpoints (`/config`, `/status`, `/sessions`, `/sessions/clear`).
3. Scaffold `shield-public-assistant` + compose service + Prisma schema (`guest_session`, `feature_flag`, `route_registry`).
4. Strict proxy route in the frontend + vitest for header stripping and no-fabrication.
5. Launcher + Panel + Welcome (WF01) with the copy kit and the display-name fallback; AT001–AT006, AT011–AT013.
