# ADR-22 (Proposal): Email Security Architecture — Phased Authority, Connector Scopes, Isolation, Audit and Action Routing

## Status
**Proposed — not accepted.** Nothing in this record is ratified. It documents the design the email-security feature (PR #148, commits 059c384 / 4ba7c91 / 7af8c77) was built against, and the target controls that G0/G1 require, so that the named owners can accept, amend or reject them.

| Item | Value |
| --- | --- |
| Owner / acceptor | Chief Architect (accountable); CISO, SOC Lead, AI Risk, Evidence/GRC (co-owners) |
| Decision required by | Before any Phase 2 (post-delivery mailbox mutation) is enabled for a design partner; before G1 sign-off |
| Default until accepted | **Phase 0/1 read-only. `ENABLE_EMAIL_PHASE2_ACTIONS` stays unset/false. No write scopes requested.** |
| Acceptance proof | Items listed under "Acceptance evidence" below |

## Date
Proposed 2026-11-23.

## Context
The email-security module adds, across five services: M365 and Google Workspace connectors (shield-ingest), the `email_security` schema, API and policy lifecycle (shield-core), BEC adjudication (shield-ai), an email action adapter (shield-action) and manifest anchoring (shield-anchor). No ADR covered it. The G0 spec (security, AI, detection/response and evidence documents) requires an ADR for each trust-boundary or action-authority change.

## Current implementation state (verified against the code at proposal time)

- **Phase gating.** `shield-core` exposes `isPhase2ActionsEnabled()`; `shield-action` `EmailActionAdapterService.isPhase2Enabled()` reads `ENABLE_EMAIL_PHASE2_ACTIONS === 'true'`. Both reject with `EMAIL_PHASE2_GATE_LOCKED`. Execution additionally requires `hasDedicatedWriteCredential` (core derives it from `EMAIL_PHASE2_WRITE_CREDENTIAL_CONFIGURED`), a distinct approver, an unexpired approval and a pre-flight simulation.
- **Connector scopes.** The Microsoft Graph provider reads `/security/alerts_v2` with `SecurityAlert.Read.All`; `Mail.Read`, `Mail.ReadBasic.All`, `Mail.ReadWrite` and `Mail.Send` are in a forbidden list. The Google provider calls Alert Center (`apps.alerts`); `https://mail.google.com/`, `gmail.readonly` and `gmail.modify` are in a restricted list. Core rejects these with `PROHIBITED_WRITE_SCOPE_BLOCKED` while Phase 2 is off.
- **Tenant isolation.** All ten `email_security.*` tables carry `tenant_id TEXT NOT NULL`. Row-level security is not written in the migration; it is applied by `backend/scripts/apply-database-access.js` from `backend/prisma/access/access-policy.js`, which classifies any table with a NOT NULL `tenant_id` as `tenant` and refuses to finish while a managed table is unclassified. `apps/shield-core/test/database-access-policy.spec.ts` covers this in CI (8 tests pass at proposal time). Service grants for the email tables are in `access-policy.js` (`shield_core_app` holds all schemas; ingest and AI hold read grants on selected tables).
- **Audit.** `EmailAccessAuditEvent` is written by `appendAudit` in `email-security.service.ts`. Immutability and hash-chaining are **being added** on branch `fix/email-security-g0-gaps` (see the remediation status file); the record below describes the target.
- **Evidence.** `shield-anchor` `EmailEvidenceService` builds Merkle roots with `TREE_PROFILE_V2` (RFC 6962 style) and states that a valid proof is not proof of source completeness.
- **AI.** `EmailBecAdjudicationService` runs deterministic and behavioural tiers first, neutralises prompt-injection patterns, and rejects ungrounded citations (ABSTAIN). The "guarded LLM" tier takes `llmProposedCitations` as input; it does not itself call a model through the shield-ai gateway.
- **Action execution.** The adapter implements its own R3/R4 dual-custody and simulation rules. It does not call the existing Cedar policy, blast-radius, freeze or action-authority services in `shield-action`.

## Decision required
Ratify (or amend) the following design points.

### D1 — Phased mailbox authority
| Option | Description | Trade-off |
| --- | --- | --- |
| **A (recommended default)** | Phase 0/1 read-only. Phase 2 mutation (quarantine, pull-back, rule/token revoke) only behind the gate, a **separate** write OAuth grant per tenant, R-level policy, and dual custody for R3+. | Slower to demonstrate remediation; smallest blast radius; matches spec default "no standing customer-estate authority" (SEC-INV-002). |
| B | Single connector grant with read+write from day one. | Faster UX; violates SEC-INV-002 and the spec's separate-credential intent. Not recommended. |
| C | Never mutate; detect and advise only. | Safest; limits the product to detection. |

### D2 — Connector scopes
Least privilege before consent: Graph `SecurityAlert.Read.All`; Google `apps.alerts` only. Mailbox read scopes are not requested in Phase 0/1. Any later expansion needs a new ADR revision, tenant consent receipt and scope-hash record.

### D3 — Tenant isolation
Isolation is enforced by RLS applied from `access-policy.js` classification, not by hand-written policies in feature migrations. Any new email table with a NOT NULL `tenant_id` inherits it. Owners to confirm this is the standing pattern.

### D4 — Audit trail
`EmailAccessAuditEvent` is append-only (no UPDATE; DELETE only inside the tenant-erasure path of `ZS-ENG-OFF-DEL-001`) and hash-chained per tenant (`prev_hash`, `event_hash`) so tampering is detectable, with periodic anchoring through shield-anchor.

### D5 — Action routing
Email actions MUST be proposed, simulated, approved and executed through the existing shield-action broker (Cedar policy, action authority, blast-radius calculation, rate ceilings, freeze switch), not a parallel implementation. The email adapter becomes a *provider command adapter* behind that broker. An action may not report `VERIFIED` without a provider-issued receipt; absent a receipt the outcome is `UNKNOWN`/`FAILED` with reconciliation required (spec T28; "no assertion without evidence"). Test fault-injection flags must not be part of the production request type.

### D6 — Evidence anchoring
Email evidence manifests are anchored with the RFC 6962 profile already used by shield-anchor. Verification output must distinguish "proof valid" from "source coverage complete".

### D7 — AI adjudication
LLM-assisted adjudication runs only through the shield-ai gateway under an AI Register use case, with provider/model pinned per ADR-11 (still proposed), per-tenant kill switch, budgets and a stored decision trace. Until ADR-11 is accepted the default stands: **gateway only, no customer training, deterministic fallback.**

## Consequences if ratified
- Phase 2 stays dark by default; enabling it becomes a per-tenant, evidenced act.
- D4 and D5 require code change (audit chain migration; broker integration; removal of fake receipts). These are tracked in `docs/g0-gap-remediation-status.md`.
- D7 depends on ADR-11; email LLM tier cannot be called "production AI" before then.
- A migration touching `EmailAccessAuditEvent` must not block tenant offboarding.

## Acceptance evidence
1. Cross-tenant negative tests on every `email_security` table and on the email API.
2. Audit chain verification test and a trigger test proving UPDATE is rejected.
3. Broker-routed execute path test showing freeze, blast-radius and Cedar denial block an email action.
4. Provider-failure test proving no `VERIFIED` without a receipt.
5. AI red-team result for the email tier (G1 AI gate).

## Open questions — "Conflicts with existing code" from `docs/gap-analysis.md`
These six rows were marked as conflicts between the email specifications and existing code. Each needs an owner decision; none is resolved by this ADR.

| Req | Conflict | Question for owner |
| --- | --- | --- |
| REQ-010 | `QuarantinedEvent`/`DlqMessage` quarantine malformed telemetry, not customer mail. No mail quarantine store, inbox UI or 4-eyes release. | Is mail quarantine in scope before G1, and does it reuse or replace the existing term "quarantine"? |
| REQ-017 | Existing `CanonicalEvent<T>` lacks the `SecurityEventEnvelope v1` fields. | Add a new contract beside it (as done in `libs/contracts/src/security-event-envelope.ts`) or migrate `CanonicalEvent`? |
| REQ-021 | Permission codes use colon style (`case:read`); spec text uses `email.threat.read`. | Confirm the colon convention (`email:threat:read`) is canonical and amend the spec. External-auditor evidence grants remain unbacked in `/verify-certificate`. |
| REQ-023 | Catalog entry "Microsoft 365 / Entra ID" collects Entra logs only; `MicrosoftDefenderProvider` uses hardcoded mock `testConnection`/`getPermissions`; `ConnectorConfigModal` prefills fake credentials and simulates TLS tests. | Rename/split the catalog entries; remove or label the mocks as simulation per spec P0 (non-complete state shown healthy). |
| REQ-033 | Independent verifier baseline test `verify.spec.ts:97` fails; `/verify-certificate` calls an authenticated endpoint although listed public; email evidence manifest/export endpoints were missing at analysis time. | Which owner fixes the verifier test, and is `/verify-certificate` public or authenticated? |
| REQ-040 | `/pricing/success` and `/pricing/cancelled` redirects 404 (pages later added in PR #148); middleware blocks public `/pricing`; conflicting unapproved prices and SLAs contradict ADR-06 / ADR-07 (both still open). | Close ADR-06 and ADR-07, then purge unapproved price/SLA strings. |

## Related
ADR-02, ADR-06, ADR-07, ADR-11 (proposal), ADR-19, ADR-23 (proposal), ADR-25 (proposal); `docs/gap-analysis.md`; `docs/g0-gap-remediation-status.md`.
