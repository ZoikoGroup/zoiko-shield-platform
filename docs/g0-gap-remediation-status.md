# G0 Gap Remediation Status

**Branch:** `fix/email-security-g0-gaps`
**Source:** G0 spec extract (`g0_specs.txt`) compared against `main` at `2de057e9` (includes PR #148, the email-security feature).
**Prepared:** 2026-11-23

> **Note for maintainers:** rows marked **In progress** are being changed by the main session in code on this branch; it will update their status and evidence when done. Rows marked **ADR drafted** only have a *proposal* ADR. A proposal is not a decision, so the underlying gap stays open until the named owner accepts it and the work is implemented.
>
> Status vocabulary: `Fixed in code` · `ADR drafted` · `In progress` · `Open - needs owner` · `Verified - no change needed`.

## A. Email-security feature (PR #148) vs G0 spec

| # | Gap | Status | Evidence / path |
| --- | --- | --- | --- |
| 1 | Email tables lack RLS / DB-level tenant isolation | **Verified - no change needed.** RLS is applied from `access-policy.js` (any table with NOT NULL `tenant_id` is auto-classified `tenant`); `database-access-policy.spec.ts` passes (8/8). Earlier "missing RLS" finding was wrong; it grepped the migration, not the policy script. | `backend/prisma/access/access-policy.js`, `backend/scripts/apply-database-access.js`, `backend/apps/shield-core/test/database-access-policy.spec.ts` |
| 2 | `EmailAccessAuditEvent` is not immutable or hash-chained | **Fixed in code** (migration verified on a throwaway PostgreSQL 16 cluster; see section D). Per-tenant hash chain (`seq`, `prev_hash`, `event_hash`) written under a per-tenant advisory lock; DB triggers reject UPDATE/TRUNCATE and reject DELETE unless the tenant-erasure transaction sets `zoiko.tenant_erasure`; offboarding sets it; `GET /email/audit/verify` recomputes the chain. | `backend/prisma/migrations/20261123010000_email_audit_hash_chain_append_only/migration.sql`, `email-audit-chain.ts` + spec, `email-security.service.ts` (`appendAudit`, `verifyAuditChain`), `deletion-task.service.ts` + spec |
| 3 | Email action adapter returns fabricated `VERIFIED` receipts; rollback is not real | **Fixed in code.** Mailbox mutation goes only through `EmailProviderMutationPort`; `VERIFIED` requires a provider-issued receipt; provider errors become `UNKNOWN`; with no client bound the result is `NOT_EXECUTED`. Rollback is now a `COMPENSATION_REQUESTED` record with no provider receipt. **Still open:** no real Graph/Gmail mutation client exists, so execution is `NOT_EXECUTED` until one is built, certified and bound (ADR-22). | `backend/apps/shield-action/src/email-actions/email-provider-mutation.port.ts`, `email-action-adapter.service.ts` + spec |
| 4 | Test fault-injection flags in the production input type | **Fixed in code.** `simulateProviderFailure`, `simulatePartialFailureIndex` and `phase2OverrideForTest` removed; tests inject a fake port and set the env gate instead. | `email-action-adapter.service.ts`, `email-action-adapter.spec.ts` |
| 5 | Email actions bypass Cedar, blast-radius, action-authority and freeze broker | **Partly fixed in code.** Adapter now enforces `ActionAuthorityService` (R0-R4), `FreezeControllerService` (global/tenant/action/connector), `BlastRadiusEvaluatorService` per target, mandatory approval freshness, and a 50-target mass-action ceiling. **Still open:** Cedar tenant policy and per-tenant command signing are not applied to email actions; R4 cannot execute because the proposal stores one approver. | `email-action-adapter.service.ts` + spec; ADR-22 D5 |
| 6 | "Guarded LLM" tier takes citations as input; no gateway call, kill switch or trace | **Partly fixed in code.** Client-supplied `llmProposedCitations` are now ignored; the GUARDED_LLM tier is reachable only through `EmailLlmReviewPort`; `EMAIL_AI_KILL_SWITCH` disables LLM review; model version comes from the port. **Still open:** the default port is not configured (no LLM review runs), and the use case is not registered in the AI use-case registry / AI Register with a decision trace (depends on ADR-11). | `backend/apps/shield-ai/src/email-adjudication/email-llm-review.port.ts`, `email-bec-adjudication.service.ts` + spec |
| 7 | Hardcoded placeholder `msg-ref-sample-001` in email actions page | **Fixed in code.** Field starts empty with a placeholder; non-success statuses (`NOT_EXECUTED`, `UNKNOWN`, `PARTIAL`, `FAILED`) show an explicit note so they cannot read as success. | `frontend/src/app/email/actions/page.tsx` |
| 8 | Service DB grants for email tables look incomplete | **Verified - no change needed.** `shield_core_app` has `allSchemas: true`; ingest and AI read grants are present; the grants spec passes. Confirm only if a service needs write access to an email table it does not own. | `backend/prisma/access/access-policy.js` |
| 9 | Thin email tests; no cross-tenant negative tests | **Fixed in code (backend).** 17 new tenant-isolation tests assert every read is filtered by `tenant_id`; 6 audit-chain tests; 13 adapter tests; 3 new adjudication tests; erasure-flag test. Frontend email workflow tests unchanged. | `email-security.tenant-isolation.spec.ts`, `email-audit-chain.spec.ts`, `email-action-adapter.spec.ts`, `email-bec-adjudication.spec.ts` |
| 10 | No CI controls for the email feature | **Fixed in code (workflows not yet run on GitHub; action tags verified to exist).** `supply-chain.yml` adds gitleaks, CodeQL, Trivy, CycloneDX SBOM and OpenTofu fmt/validate; Dependabot added; stale "76 Tests" label removed. Signing, provenance, registry push and digest promotion remain **ADR drafted** (ADR-23). | `.github/workflows/supply-chain.yml`, `.github/dependabot.yml`, ADR-23 |
| 11 | Spec W-contracts still without pages | **Open - needs owner.** Not addressed: these are new product surfaces (freeze center, incident command, shift handover, users/roles/SoD, entitlements) that need Product prioritisation and contract definitions, not a defect fix. | `frontend/src/app/` (absent routes) |
| 12 | Governance: no ADR for email-security design; six "Conflicts with existing code" unresolved | ADR drafted (decisions still open) | `docs/adrs/ADR-22-PROPOSAL-email-security-architecture.md` (open-questions table), `docs/gap-analysis.md` |

## B. Repo-wide G0 gaps from the earlier analysis

| Area | Gap | Status | Evidence / path |
| --- | --- | --- | --- |
| CI/CD | Build once / promote by digest: images are built with `push: false`; deploy builds on a VM over SSH | ADR drafted | `.github/workflows/ci.yml`, `.github/workflows/deploy-vm.yml`; ADR-23 |
| CI/CD | No artifact signing or SLSA provenance | ADR drafted | ADR-23, ADR-25 |
| CI/CD | SBOM is a document, not generated by the build or digest-bound | ADR drafted | `docs/evidence/g1-release-sbom-manifest.md`; ADR-23 |
| CI/CD | No SAST, secret scanning, container scan or IaC scan; only `npm audit` | Fixed in code (workflow unrun; image scan still needs a registry/built image) | `.github/workflows/` |
| CI/CD | No dependency-update automation (Dependabot/Renovate) | Fixed in code | `.github/` |
| CI/CD | No deploy approvals / protected environments; standing SSH key secret | ADR drafted | ADR-23 D5, ADR-25 |
| CI/CD | Release gate is a `grep "findMany({"` proxy, not a real tenant control | Open - needs owner | `.github/workflows/ci.yml` (release-gate job) |
| CI/CD | Frontend CI step label hardcodes "76 Tests" (now stale) | Fixed in code | `.github/workflows/ci.yml` |
| Infrastructure | Only `nonprod` and `production`; spec defines nine environment classes | ADR drafted | `infrastructure/tofu/environments/`; ADR-24 |
| Infrastructure | No OpenTofu plan/policy/drift CI | Partly fixed (fmt/validate/Trivy config in `supply-chain.yml`; plan, policy and drift remain open) | `infrastructure/tofu/` |
| Infrastructure | No K8s admission control (signature/provenance verify) | ADR drafted (ADR-23 D5) | `infrastructure/k8s/base/` |
| Infrastructure | No runtime resource inventory or release manifest | Open - needs owner | — |
| Security | Workload identity / mTLS / key-custody profile unratified; service-to-service auth mechanism not inventoried | ADR drafted | ADR-25; `backend/libs/kms/` |
| Governance | ADR gaps: numbers 3, 4, 9, 10, 12–15 absent; many Gate-0 decisions undecided; ADR-05/06/07/11/20/21 still open or proposed | ADR drafted for 22–25; remainder Open - needs owner | `docs/adrs/` |
| Governance | G1 sign-off roster not ratified (approvals NOT SIGNED) | Open - needs owner (named approvers; cannot be produced by tooling) | `docs/g1-gate-signoff-roster.md` |
| Governance | Threat model not versioned or covered by automated fitness tests | Open - needs owner | `docs/MASTER_BUILD_PLAN.md` |
| Experience | No Experience Contract Registry (ECX-0..5) | Open - needs owner | — |
| Experience | No accessibility testing (axe/Playwright) or visual-regression baseline | Open - needs owner (not addressed) | `frontend/package.json` |
| Operations | Only two runbooks; no on-call, incident, restore, comms or freeze-recovery runbooks | Open - needs owner | `docs/runbooks/` |
| Operations | SLO/error-budget measurement contracts absent | Open - needs owner | `infrastructure/observability/` |
| QA | No migration rehearsal / expand-contract evidence process | Open - needs owner | `backend/prisma/migrations/` |

## C. ADR files written

- `docs/adrs/ADR-22-PROPOSAL-email-security-architecture.md`
- `docs/adrs/ADR-23-PROPOSAL-software-supply-chain-signing.md`
- `docs/adrs/ADR-24-PROPOSAL-environment-model.md`
- `docs/adrs/ADR-25-PROPOSAL-workload-identity-and-crypto-profile.md`
- `docs/g0-gap-remediation-status.md` (this file)

## D. Verification performed on this branch

- Backend: `tsc --noEmit` clean for shield-core, shield-ai, shield-action, shield-ingest, shield-anchor; ESLint 0 errors on changed files; full Jest suite run (the 6 failures it exposed in the deletion spec were fixed); `swagger:check`, `access:check`, `check:ungrounded-terms`, `check:capability-claims` pass.
- Frontend: `tsc --noEmit` clean; 235/235 Vitest tests pass.
- **Migration verified (2026-11-23):** the full migration chain, including `20261123010000`, applied cleanly to a throwaway PostgreSQL 16 cluster, then `apply-database-access.js` ran. Tested on real rows: UPDATE, DELETE and TRUNCATE are rejected; a duplicate `(tenant_id, seq)` is rejected; DELETE succeeds only inside a transaction that sets `zoiko.tenant_erasure` and only for the targeted tenant; the flag does not leak to the next statement. All 10 `email_security` tables have RLS enabled and forced with a policy (confirms gap #1 was a false alarm).
- **Workflow action tags verified** to exist on GitHub (`trivy-action` is `v0.28.0`; the earlier `0.28.0` tag did not exist and was corrected). `@cyclonedx/cyclonedx-npm@1.19.3` exists on npm.
- **Not verified:** the new workflows have not been run on GitHub, so first-run failures from Trivy findings or `tofu fmt -check` are still possible; `tofu` is not installed locally. The mailbox-mutation, LLM-gateway and Cedar items remain open as stated above.
