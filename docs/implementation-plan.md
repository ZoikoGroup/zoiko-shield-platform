# Implementation Plan — Zoiko Mail & ZoikoShield Email Security

**Sources:** `ZS-ZM-ENG-003 V3.0` (Master Architecture) & `ZS-UX-EMTI-001 V1.0` (Detailed Wireframe Handoff)  
**Target Workspace:** `zoiko-shield-platform` (Note: Zoiko Mail codebase is NOT currently in this workspace; Mail track deliverables live in the Zoiko Mail repository unless explicitly moved per manager confirmation).

---

## Mandatory Sequencing & Release Gates
- **No implementation merges to production** before `Gate G0` (architectural reconciliation, signed ADRs `ADR-ZMSEC-01` & `ADR-ZSSEC-01`, signed Crown-Jewel Threat Model `ZS-EW02`, named owners, Privacy/Legal approval, Finance budget approval).
- **Separate tracks** operate in parallel after `Phase 0 / G0`, decoupled by versioned `SecurityEventEnvelope v1` contracts so **Zoiko Mail delivery never blocks on ZoikoShield** (`REQ-003` / `T29`) and **ZoikoShield works cleanly without Zoiko Mail** (`T30`).
- **Website Corrections Track (Pricing & Site-Wide Hygiene):** Can execute immediately as non-email platform hygiene, subject to manager confirmation that **all unapproved prices/plan claims/SLAs stay unpublished** (`ADR-06`, `ADR-07`).

---

## Pre-Track Phase 0: Governance Reconciliation & Website Corrections (Gate G0 Prerequisites)

### Track 0A — Immediate Website Corrections & Site-Wide Hygiene (Shield Repo)
- **Scope:** Fix pricing 404 redirects (`/pricing/success`, `/pricing/cancelled`), public route middleware mismatches, DTO/fallback mismatches in `/pricing`, remove remaining unapproved dollar figures/SLA claims/hardcoded `"Acme"`/`"Sarah Chen"`/`DEMO_FALLBACK_RUNS` fixtures, and disable blanket silent-200 masking on unmatched endpoints. See [pricing-404-audit.md](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/docs/pricing-404-audit.md) and [site-wide-audit.md](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/docs/site-wide-audit.md).
- **Key Files to Change:**
  - `frontend/src/middleware.ts`, `frontend/src/components/layout/AppShell.tsx` (align public routes `/pricing`, `/services`, `/trust`, `/help`, `/sector-packs` with manager confirmation).
  - `frontend/src/app/pricing/success/page.tsx`, `frontend/src/app/pricing/cancelled/page.tsx` (create safe confirmation/cancel landing pages OR repoint `PaymentService` & `StripePaymentProvider` consistently).
  - `frontend/src/app/pricing/page.tsx`, `frontend/src/lib/api-client.ts`, `frontend/src/app/api/v1/[...slug]/route.ts`, `frontend/src/app/billing/page.tsx`, `frontend/src/app/copilot/console.tsx`, `frontend/src/app/operations/retainers/page.tsx` (strip unapproved dollar amounts/SLAs; fix `recommendedTier` vs `recommendedPlan` & DTO boolean mismatch).
  - `frontend/src/components/customer/CustomerSidebar.tsx` (remove broken `matchPaths` `/incident-command`, `/assessments`, `/settings`).
  - `frontend/src/app/verify-certificate/page.tsx` (skip authenticated `getAuditorWorkspace()` call on mount when unauthenticated).
  - `frontend/src/components/layout/TopHeader.tsx` (replace `fetch("/health")` HTML redirect probe with `/api/v1/health` or public health endpoint).
  - `frontend/src/lib/webauthn.ts` (remove or strictly gate `mockAuthData` fallback in production builds).
  - `backend/tools/independent-verifier/` (fix failing baseline `verify.spec.ts` assertion) and `backend/apps/shield-core/test/app.e2e-spec.ts` (fix `beforeAll` 5s timeout).

### Track 0B — Cross-Program Decisions & Security Artifacts (`ZS-EW01`, `ZS-EW02`, `G0`)
- **Files to Create (ADRs & Governance Docs):**
  - `docs/adrs/ADR-ZMSEC-01-zoiko-mail-transport-and-scanning.md` (inbound regional MX/SMTP provider, MIME store, AV engines, fail-closed vs fail-open policy, outbound reputation).
  - `docs/adrs/ADR-ZSSEC-01-mail-shield-integration-boundary.md` (ratify whether Mail ingestion adapter sits in `backend/apps/shield-ingest/` or a new approved service under satellite-count rules; clarify `shield-public-assistant` count = 6 vs 5-service baseline).
  - `docs/threat-models/ZS-EW02-email-security-crown-jewel-threat-model.md`.
  - Feature-flag & permission registration table reconciling `email.*` vs `email:*` syntax in `backend/apps/shield-core/src/modules/authorization/constants.ts`.

---

## Track A: Zoiko Mail Foundation (Separate Zoiko Mail Repository / Codebase)

> **Prerequisite Dependency:** Access to the Zoiko Mail codebase (`Mail architecture reconciliation v1.0`) and ratified `ADR-ZMSEC-01` + Finance budget sign-off (`D09`).

### Phase M1 — Inbound Security & Canonical Disposition Pipeline (`M01`, Days 0–60)
- **Deliverables:**
  1. Regional MX/SMTP ingress integration enforcing recipient/domain policies, TLS context verification, and pre-parse rate/envelope limits.
  2. Header provenance verifier (SPF, DKIM, DMARC alignment, ARC chain evaluation trusting approved ingress headers only).
  3. Isolated/sandboxed safe MIME parser with strict recursion, size, decompression/zip-bomb bounds classifying encrypted/malformed payloads as `UNSCANNABLE`.
  4. Anti-spam + URL/QR safe parser (non-SSRF time-of-click resolver) + licensed AV/OEM scanner emitting `MALICIOUS | SUSPICIOUS | CLEAN | UNSCANNABLE | ENGINE_ERROR`.
  5. Versioned policy engine & idempotent disposition state machine (`RECEIVED -> VALIDATING -> SCANNING -> POLICY_EVALUATION -> DELIVERED | QUARANTINED | REJECTED | DEFERRED`), failing closed (defer/hold) on engine crash (`A04`).
- **Exit Gate:** Tests `A01`–`A05` pass against real test domains in approved region.

### Phase M2 — Quarantine, Outbound Anti-Abuse & Account Security (`M02`, `M03`, Days 0–75)
- **Deliverables:**
  1. Encrypted per-tenant quarantine store, retention/legal-hold flags, 4-eyes high-risk release approval + immutable release receipts (`A09`).
  2. Mail UX integration (`Mail Inbox` warnings & report-phishing CTA, `Mail Quarantine`, `Mail Security Centre`) with WCAG 2.2 AA & 7 UI error/degraded states (`O02`).
  3. Authenticated outbound submission (zero open relay), per-account/domain rate limits, staged burst holds, outbound AV/prohibited-file scanning, bounce/complaint loops, and fan-out/geo/OAuth compromise holds (`A06`).
  4. Mailbox RBAC & shared-mailbox scoping (`A07`), revoke-all sessions, OAuth grant inventory, immutable forwarding/delegation logs (`A08`), and tenant DMARC/SPF/DKIM posture dashboard.
  5. `Alet` AI Email Assistant safety wrappers: per-mailbox/per-message ACL verification at retrieval + execution, delimited untrusted-data prompt builder, typed human approval diffs (`S04`).
- **Exit Gate:** Tests `A06`–`A09`, `S04`, `O02`.

### Phase M3 — Cross-Product Event Emitter (`I01` Mail Side, Days 0–75)
- **Deliverables:**
  1. Mail transactional outbox table + mTLS/signed HTTP or Kafka producer emitting `SecurityEventEnvelope v1` for the 5 Mail -> Shield events (`inbound_verdict.v1`, `outbound_hold.v1`, `quarantine_changed.v1`, `account_risk.v1`, `coverage_report.v1`) with opaque `tenant_binding_id`, monotonic checkpoints, and bounded retry buffering when Shield is down (`I03`, `T29`).
- **Exit Gate:** Tests `I01`–`I03`.

### Phase M4 — GoDaddy ~200 Mailbox Migration Security (`M04`, Days 30–90)
- **Deliverables:**
  1. 6-stage migration pipeline (Discover/Authorise -> Preflight -> Encrypted least-privilege Import -> Per-mailbox folder/count/ID/hash Reconciliation -> Cutover check + rollback -> Credential rotation & sign-off) + `Mail Migration Console` UI.
- **Exit Gate:** `A10` + `Gate A` sign-off before live customer mailbox migration.

---

## Track B: ZoikoShield Enterprise Email Threat Intelligence & Assurance (`zoiko-shield-platform`)

> **Constraint:** Runs within existing `shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`, and `frontend/` shell (`ZS-EW01`–`ZS-EW12`). Can deploy behind per-tenant `EMAIL_THREAT_INTEL_PHASE0` feature flags.

### Phase S0 — Phase 0 Read-Only Telemetry, MDR Triage & Assurance (`ZS-EW03`–`ZS-EW09`, Pilot Gate `G1`/`Gate B`)
- **Step S0.1 — Contracts, DB Schemas, RLS & RBAC (`ZS-EW03`, `ZS-EW06` foundation):**
  - **Files to Create:**
    - `backend/libs/contracts/src/security-event-envelope.ts` (`SecurityEventEnvelopeV1` validator + mapper to OCSF/`CanonicalEvent` without breaking existing pipelines).
    - `backend/libs/contracts/src/email-events.ts` (`mail.security.*` schemas).
    - `backend/prisma/schemas/email-security.prisma` (or extension to `ingest.prisma` & `case-management.prisma`): `EmailSourceConnection`, `EmailConnectionIntent`, `SourceCoverageWindow`, `EmailThreatFinding`, `EmailThreatAdjudication`, `EmailPolicyVersion`, `TenantMailBinding`.
    - Prisma migration + update `backend/prisma/access/access-policy.js` (per `ADR-19`, add RLS isolation classification for every new table).
  - **Files to Change:**
    - `backend/apps/shield-core/src/modules/authorization/constants.ts` (add email permission codes & seed role mappings).
    - `backend/apps/shield-core/src/modules/authorization/` & seeded role mappings (add scoped permissions + external auditor expiry guard).

- **Step S0.2 — Ingestion Connectors & Reconciliation (`ZS-EW04`, `ZS-EW05`, `ZS-EW06`):**
  - **Files to Create:**
    - `backend/apps/shield-ingest/src/connectors/providers/microsoft-365-email/` (`m365-email.provider.ts`, `m365-email.normalizer.ts`, `m365-email.permissions.ts`, polling/backfill for Graph v1.0 `/security/alerts_v2` with PKCE `ConnectorOauthState`, 429 backoff, license & Exchange App RBAC pre-check, zero `Mail.ReadWrite`).
    - `backend/apps/shield-ingest/src/connectors/providers/google-workspace-alert-center/` (`gw-alert-center.provider.ts`, `gw-alert-center.normalizer.ts`, calling `https://alertcenter.googleapis.com/v1beta1/alerts`, explicit license/scope capability checks, zero unrestricted Gmail read).
    - `backend/apps/shield-ingest/src/connectors/providers/zoiko-mail/` (`zoiko-mail.adapter.ts`, `zoiko-mail.controller.ts` for signed `SecurityEventEnvelope v1` webhook/Kafka ingestion + monotonic checkpoint + DLQ).
    - `backend/apps/shield-ingest/src/email-reconciliation/` (`coverage-window.service.ts` computing expected vs observed vs duplicate vs rejected vs missing intervals + admin-approved bounded backfill).
  - **Files to Change:**
    - `backend/apps/shield-ingest/src/connectors/connector-catalog.service.ts` (disambiguate `'microsoft-entra'` label so it no longer implies full M365 email security; add `'microsoft-365-email'`, `'google-workspace-alerts'`, `'zoiko-mail'`).
    - `backend/apps/shield-ingest/src/connectors/providers/microsoft-defender/microsoft-defender.provider.ts` (replace mock `HEALTHY` latency & permission list with honest unconfigured/API check or deprecate into real Graph security integration).
    - `backend/apps/shield-ingest/src/shield-ingest.module.ts` (register new providers).

- **Step S0.3 — Core APIs (`/api/v1/email/*`) & Anchor Evidence Integration (`ZS-EW07`–`ZS-EW09` Backend):**
  - **Files to Create:**
    - `backend/apps/shield-core/src/modules/email-security/` (`email-security.module.ts`, `email-overview.controller.ts`, `email-connectors.controller.ts`, `email-threats.controller.ts`, `email-coverage.controller.ts`, `email-evidence.controller.ts`, `email-policies.controller.ts`, `email-settings.controller.ts`, services + strict DTOs + Swagger decorators for `npm run swagger:check` and `npm run access:check`).
    - `backend/apps/shield-anchor/src/` (email evidence manifest builder combining `EvidenceRecord` hashes, `SourceCoverageWindow` missing-gap disclosures, detached checksums, and expiring auditor access grants).
  - **Files to Change:**
    - `backend/apps/shield-core/src/app.module.ts` & `backend/docs/swagger.yaml` (register module & document every new endpoint).
    - `backend/apps/shield-core/src/modules/case-management/` (add email finding linkage & optimistic concurrency version column/ETag check on case updates/decisions).

- **Step S0.4 — Frontend In-Shell Wireframes (`WF-01`..`WF-10` [read], `WF-14`):**
  - **Files to Create (`frontend/src/app/` & `frontend/src/components/email/`):**
    - `frontend/src/app/email/page.tsx` (`WF-01` Overview)
    - `frontend/src/app/email/connectors/page.tsx` (`WF-02` Connections & Capabilities)
    - `frontend/src/app/email/connectors/setup/page.tsx` (`WF-03` 5-Step Setup Wizard)
    - `frontend/src/app/email/connectors/health/page.tsx` (`WF-04` Health & Reconciliation)
    - `frontend/src/app/email/threats/page.tsx` (`WF-05` Threat Queue)
    - `frontend/src/app/email/threats/[threatId]/page.tsx` (`WF-06` Threat Detail & Provenance)
    - `frontend/src/app/email/coverage/page.tsx` (`WF-08` Control Coverage)
    - `frontend/src/app/email/evidence/page.tsx` (`WF-09` Evidence Pack & Verifier link)
    - `frontend/src/app/email/policies/page.tsx` (`WF-10` Read-only Policy Versions & Exceptions)
    - `frontend/src/app/email/settings/page.tsx` (`WF-14` Tenant Email Settings, Privacy & Revocation)
    - Reuse `frontend/src/app/cases/[caseId]/page.tsx` for `WF-07` (`EmailInvestigation`) via conditional email provenance panel instead of duplicating case pages.
  - **Files to Change:**
    - `frontend/src/components/layout/nav-config.ts`, `frontend/src/components/layout/TopHeader.tsx` (add in-shell email navigation groups, UTC/local timestamp display toggle, responsive layouts >=1280 / 768-1279 / <768 px & WCAG 2.2 AA).
    - `frontend/src/lib/api-client.ts` & `frontend/src/lib/types.ts` (typed `/api/v1/email/*` methods, no fake demo fallback).
    - `frontend/src/app/api/v1/[...slug]/route.ts` (ensure `/api/v1/email/*` fails closed without returning blanket `{ data: [] }` 200).
- **Phase S0 Verification (`G1` / `Gate B`):** Pass tests `T01`–`T22`, `I01`–`I05`, `S01`–`S02`, `S05`, `O01`–`O02`, plus WCAG 2.2 AA & cross-tenant penetration tests.

### Phase S1 — Differentiated BEC/ATO Intelligence & Policy Governance (`ZS-EW10`, Gate `G2`/`Gate C`)
- **Prerequisites:** Gate `G1`/`Gate B` passed; approved `D08` (content/metadata access + retention notice) and `D07`/`ADR-11` (Vertex AI provider ratification).
- **Deliverables:**
  1. `backend/apps/shield-ingest/src/email-detectors/` & `backend/apps/shield-ai/src/email-adjudication/`: deterministic rules + behavioral graph features (bank-detail change, executive lookalike, OAuth/forwarding/impossible-travel correlation) + bounded `<=2%` LLM adjudication with strict prompt-injection boundary and `ABSTAIN` (`T23`).
  2. `backend/apps/shield-ai/src/email-benchmark/`: blinded native-baseline comparison harness computing recall, precision, false-positive burden, CI bounds (`S03`, `T24`, `T25`).
  3. `WF-11` (`frontend/src/app/email/intelligence/page.tsx`) & `WF-12` (`frontend/src/app/email/analyses/[id]/page.tsx`) + `WF-10` P1 dual-custody policy draft/approve/rollback UI & `/api/v1/email/policies/*`, `/behaviour/*`, `/analyses/*`.
- **Exit Gate:** `S03`, `T23`–`T25`, Finance gross-margin & SOC cost sign-off (`Gate C` / `G2`).

### Phase S2 — Gated Post-Delivery Remediation (`ZS-EW11`, Gate `G3`/`Gate D`)
- **Prerequisites:** `Gate C` / `G2` passed; `D09` action register, risk classes, dual custody, and rollback matrix ratified; separate write OAuth/app credentials approved (`SEC-04`, `SEC-11`).
- **Deliverables:**
  1. `backend/apps/shield-action/src/email-actions/` (`m365-postdelivery.adapter.ts`, `gw-postdelivery.adapter.ts`, `zoiko-mail-command.adapter.ts`) + `/api/v1/email/actions/*` endpoints supporting dry-run simulation, distinct-person dual-custody WebAuthn approval (`T26`), rollback/compensation (`T27`), and partial-failure reconciliation (`T28`). Replace stubbed `LiveGoogleWorkspaceExecutor` (`live-google-workspace.executor.ts`) and remove `mockAuthData` fallback (`webauthn.ts`).
  2. `WF-13` (`frontend/src/app/email/actions/page.tsx`) + `mail.security.action_proposal.v1` / `action_receipt.v1` integration with Zoiko Mail (`W07`).
- **Exit Gate:** `T26`–`T28`, `S05`, `Gate D` / `G3`, followed by full scale readiness (`G4`).

### Phase S3 — Workstream C P2 Discovery (Messages, Shared Links, Calendar & Downloads)
- **Prerequisites:** Explicit customer-demand case, manager clarification of non-email `"messages, and downloads"` scope, new threat model, consent terms, and dedicated ADR (`C01`). Do **not** commingle into P0/P1 schedules.

---

## Key Risks & Mitigations
| Risk | Severity | Impact | Mitigation |
|---|---|---|---|
| **Missing Zoiko Mail codebase in workspace** | Critical | All Mail track work (`REQ-005`–`REQ-016`, `M01`–`M04`) cannot execute in `zoiko-shield-platform`. | Confirm repo location & ownership immediately before assigning engineering sprints (`Gate G0`). |
| **Blanket `200 OK` fallback in `route.ts:4852` & mockup overlays** | Critical | Masks real API errors / missing endpoints during testing and misleads analysts with fake data. | Fix `route.ts` to proxy errors honestly (`404`/`502`/`503`) when `NEXT_PUBLIC_DEMO_FALLBACK !== 'true'` and strip legacy mockup overlays. |
| **Over-privileged OAuth scopes (`Mail.ReadWrite`)** | Critical | Violates `SEC-04` / `S01` / `T18` and creates regulatory/breach liability before G1/G3. | Physically isolate read-only Phase 0 app registration from Phase 2 action credentials; enforce server-side feature flags. |
| **Unapproved prices/SLAs already hardcoded in FE** | High | Direct conflict with `ADR-06`, `ADR-07`, and `ZS-COM-BILL-001` despite backend `check:capability-claims` passing. | Extend CI capability/claim linter to scan `frontend/src/**` and remove all unratified prices/SLAs immediately. |
