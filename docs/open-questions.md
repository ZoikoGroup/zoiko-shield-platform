# Open Questions, Ambiguities & Cross-Document Contradictions

All ambiguities, missing specifications, and contradictions discovered across `ZS-ZM-ENG-003 V3.0` (**Doc 1**), `ZS-UX-EMTI-001 V1.0` (**Doc 2**), the user prompt, and the `zoiko-shield-platform` codebase are recorded below **without guessing or assuming**.

---

## 1. Product Scope, Ownership & Workspace Availability

1. **Where is the Zoiko Mail codebase & how does the manager instruction reconcile with Doc 1's architecture split?**
   - *Contradiction:* The manager instruction says *"The work must be implemented Zoiko Shield. It covers cyber security for emails, messages, and downloads"*, whereas **Doc 1** (`ZS-ZM-ENG-003 V3.0` §01, §03, §04) specifies a **two-platform split** where **Zoiko Mail** owns native inbound/outbound MX/SMTP, MIME parsing, malware/attachment scanning, quarantine, GoDaddy migration, and `Alet` AI, and **ZoikoShield** only owns read-only MDR telemetry & assurance; meanwhile **Doc 2** (`ZS-UX-EMTI-001 V1.0` Executive Decision & §01) states *"No new security product, client application or mailbox gateway is approved"* and references an unavailable companion spec (*`Zoiko Mail Security Foundation — Detailed Engineering Implementation Handoff V1.0`*).
   - *Codebase fact:* Only `zoiko-shield-platform` exists in this workspace; no Zoiko Mail repo or inbound MX/MIME codebase exists here (`REQ-001`).
   - *Question for Manager / CTO:* Should this team **only** implement the ZoikoShield track (`Track B`) here and obtain/assign a separate repo for Zoiko Mail (`Track A`), OR is ZoikoShield actually expected to ingest raw emails/messages/downloads natively?
2. **What is the concrete near-term scope for `"messages, and downloads"`?**
   - *Ambiguity:* Doc 1 §06.4 & §14 (`C01`) and Doc 2 §01 relegate collaboration platforms (Teams/Slack/chat), shared file links, calendar invitations, and AI-assisted messaging to **Workstream C / P2 discovery** ("separate customer-demand evidence, platform scopes, threat models... not an excuse to expand the current release") and explicitly prohibit any standalone consumer AV/endpoint download scanner.
   - *Question:* For this urgent release, does `"messages, and downloads"` strictly mean **email messages and email attachments** within Doc 1/Doc 2 (`P0`/`P1`), or must Workstream C (`C01`) be pulled forward?
3. **Where is the live marketing website (`zoikoshield.com`) & which specific external pricing-menu URLs returned 404?**
   - *Missing Repo:* `c:\Users\aparaziitha nitta\zoiko-shield-platform\web\` contains **only `node_modules/`** with zero pages/routes. Inside this repo, `/pricing` exists, while `/pricing/success`, `/pricing/cancelled`, `/pricing/cancel`, and unauthenticated access to `/pricing`, `/services`, `/sector-packs` fail/redirect.
   - *Question:* Is there a separate marketing-site repository (or CMS/Webflow/WordPress/Vercel project) hosting the pricing dropdown menu links that returned 404 to the manager? Can those exact broken URLs be shared so they are added to the remediation list?

---

## 2. Unratified Governance & ADRs Blocking Implementation

4. **Urgent implementation vs. `DRAFT / NOT RATIFIED` release gates (`G0` / `Gate A–D`)**
   - Both Doc 1 (`V3.0`) and Doc 2 (`V1.0`) are explicitly marked **`NOT RATIFIED`** and prohibit production connector permissions, live mail transport, or product screens beyond research until **Gate G0** (`ADR-ZMSEC-01`, `ADR-ZSSEC-01`, signed Crown-Jewel Threat Model `ZS-EW02`, named owners, Privacy/Legal DPIA, Finance budgets) is signed.
   - *Question:* Does urgent priority mean we may proceed immediately into **Phase 0 dev/lab implementation behind feature flags** after G0 ADRs, or is executive sign-off on `D01`–`D10` expedited first?
5. **Satellite-count conflict (`D02` in Doc 1; `D06` in Doc 2)**
   - `ADR-001` (`docs/adrs/ADR-001-single-stack-typescript-architecture.md`) describes a 5-service backend (`shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`), yet `backend/apps/` already runs a 6th service (`shield-public-assistant` port `3006`, plus `verifier-cli` and legacy dirs `shield-ingest-legacy`, `zoikoshield-backend`).
   - *Question:* Confirm under `ADR-ZSSEC-01` that cross-product Zoiko Mail event ingestion and M365/Google Alert Center connectors will extend `shield-ingest` (port `3002`) rather than adding a new microservice.
6. **Authorized Mail transport provider & regions (`ADR-ZMSEC-01` / `D01` in Doc 1)**
   - Doc 1 §02 notes Amazon SES was "proposed" in Zoiko Mail reconciliation, while ZoikoShield itself ratified Google Cloud hosting in `ADR-18` (`docs/adrs/ADR-18-google-cloud-hosting-baseline.md`). Also exact AV/OEM scanner vendor (Doc 1 §05.1), licensed regions, RPO/RTO targets, and p95 latency SLOs (§09 `D06`) are undefined.
   - *Question:* Which inbound/outbound MX/SMTP transport and AV/sandbox vendors/regions are approved for Zoiko Mail?
7. **Missing controlling specifications listed as prerequisites**
   - Doc 1 §02/§18 and Doc 2 §00/App B require reconciling against latest controlled copies of `ZS-T0-BE-ARCH-001`, `ZS-T0-TECH-001`, `ZS-COM-PRC-001`, `ZS-COM-PART-001`, `ZS-T0-DOC-EST-001`, `ZS-STR-EMG-001`, `Zoiko Mail Architecture Dashboard Reconciliation Master v1.0`, and `Zoiko Mail Security Foundation — Detailed Engineering Implementation Handoff V1.0` — **none of which are present in `docs/`**.
   - *Question:* Where can the engineering team obtain the latest ratified versions of those specs?

---

## 3. Technical Contract & Data-Model Conflicts

8. **`SecurityEventEnvelope v1` vs. existing `CanonicalEvent` (`backend/libs/contracts/src/canonical-event.ts`)**
   - Doc 1 §07.1 / Appendix A defines `schema_version`, `tenant_binding_id`, `threat_class`, `subject_ref`, `policy_id`, `policy_version`, `source_verdict`, `action_state`, `coverage_state`, `data_class`, `residency_code`, `payload_hash`, `signature`, `evidence_ref`. Existing `CanonicalEvent` uses `contract_id`, `contract_version`, `tenant_id`, `source`, `integrity`, `data` without `tenant_binding_id`, `coverage_state`, or `data_class`.
   - *Question:* Should `SecurityEventEnvelopeV1` wrap/adapt into `CanonicalEvent` at `shield-ingest` ingress, or become a versioned union alongside `CanonicalEvent` in `backend/libs/contracts/`?
9. **Permission naming convention & role mapping (`email.*` vs `email:*`)**
   - Doc 2 §02 proposes dot-separated codes (`email.connector.view/manage`, `email.threat.read`, `email.case.investigate`, `email.coverage.read`, `email.policy.read/manage`, `email.evidence.export`, `email.action.propose/approve/execute`). Existing `PERMISSION_CODES` (`backend/apps/shield-core/src/modules/authorization/constants.ts`) uses colon-separated codes (`case:read`, `policy:config:read`, `response_proposal:approve`, `export:create`). Additionally, Doc 2 references roles `Tenant Security Admin`, `SOC Lead / Incident Commander`, `GRC / Assurance Owner`, `Platform Support` whereas existing roles in code are `TENANT_OWNER`, `TENANT_ADMIN`, `SECURITY_ANALYST`, `AUDITOR`, `SUPER_ADMIN`.
   - *Question:* Normalize email permissions to `email:<resource>:<action>` matching existing `constants.ts` (recommended) or adopt dot notation cleanly via migration, and confirm exact role-to-permission matrix?
10. **Route prefix conflict in `WF-01`–`WF-14` vs. existing `/connectors`, `/alerts`, `/cases`, `/audit`, `/policies`**
    - Doc 2 §03 maps workflows into existing top-level sidebar groups (`Sec-Ops & Investigation / Email Threats`, `Connectivity & Compliance / Email Connections`, `Assurance / Email Control Coverage`, `Policy & Governance / Email Detection Policies`) with `/api/v1/email/*` contracts, yet `nav-config.ts` currently uses flat labels (`Detect & Investigate`, `Compliance & Governance`, `Evidence & Audit`) and `/customer/*` uses 14 separate sections (`CustomerSidebar.tsx`).
    - *Question:* Should Email Security live as new nav entries in the main operator shell AND/OR inside the `/customer/*` portal? Should `WF-07` link to existing `/cases/[caseId]` directly?
11. **Existing `'microsoft-entra'` connector label vs. M365 Graph `/security/alerts_v2`**
    - `connector-catalog.service.ts:131-136` labels `'microsoft-entra'` as `"Microsoft 365 / Entra ID"` (collection of Entra audit/sign-in logs only), while `MicrosoftDefenderProvider` (`'microsoft-defender-edr'`) is currently a mock implementation (`latencyMs: 38`, `Alert.Read.All`).
    - *Question:* Confirm renaming `'microsoft-entra'` accurately to `"Microsoft Entra ID (Identity & Sign-In)"` while creating dedicated read-only M365 Graph `/security/alerts_v2` connector (`microsoft-365-email`) under Doc 2 `D03`.
12. **Commercial plan taxonomy, checkout UX, and public availability (ADR-06 / ADR-07 / Compliance)**
    - Four conflicting sources exist in the repo:
      - `plan-tier.entity.ts` (`DRAFT_PLAN_TIERS`): `SHIELD_ESSENTIAL`, `SHIELD_PROFESSIONAL`, `SHIELD_ADVANCED`, `SHIELD_ENTERPRISE` (`Contract Only`, null prices & null SLAs).
      - `shield-public-assistant` (`corpus.ts:356, 654-753`): `Essential`, `Advanced`, `Enterprise`, `MSSP` (no `Professional`).
      - `ZOIKOSHIELD_PAYMENT_AND_EMAIL_TESTING_GUIDE.md` + `api-client.ts:3772` + `copilot/console.tsx`: `$2,000 / $4,000 / $8,000 / mo` + `4h/1h/15m` SLAs.
      - `api/v1/[...slug]/route.ts:3979-3995`: `$12,000 / $24,000 / $48,000 / year` + `1h` SLA.
      - `docs/ZoikoShield_Commercial_Billing_Entitlement_Security_Services_Operating_Standard.md:74`: rejects invented Essential/Professional tiers in favor of two entry offers (`Managed Defense`, `Continuous Assurance`) + `ADR-06`.
    - Also: `middleware.ts` blocks unauthenticated `/pricing`, `/services`, `/sector-packs`, whereas `corpus.ts` and `DEPLOYED_APPLICATION_LINKS_ONLY.html` expect `/pricing` and `/services` to be public.
    - *Question for Manager:* Confirm (a) which routes under `/pricing*` and `/services` should be publicly accessible vs authenticated, (b) whether Stripe checkout modals (`/pricing/success`, `/pricing/cancelled`) should be removed/replaced with quote requests while `ADR-06` is open, and (c) which plan taxonomy (`Managed Defense / Continuous Assurance` vs 4 plan tiers vs `corpus.ts`) is canonical.
13. **GoDaddy migration authority & scope (`Doc 1 §02, §05.4`)**
    - Details pending for the ~200 GoDaddy mailboxes: legal owner sign-off, exact domain list, target hosting region(s), IMAP/POP vs PST import format, attachment size bounds, and source retention/cutoff policy.
14. **Phase 1 & 2 regulatory & AI decisions (`D04`, `D08`, `D09` across Doc 1 & Doc 2)**
    - Need Legal/DPO approval of subprocessors (Microsoft, Google, Vertex/Gemini under `ADR-11` which is still *proposed*), retention periods vs legal holds per jurisdiction, and explicit customer consent language before any Phase 1 scoped message metadata/body inspection or Phase 2 automated pull-back/quarantine is enabled.
