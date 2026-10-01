# ADR-20 (Proposal): G4 Sovereign / OT / Critical-Infrastructure Capability Set

## Status
**Proposed — not accepted.** Nothing in this record is ratified. No live use of the capabilities below is authorized.

Eight services citing "G4 Phase …" or "§G4" in their own header comments were added to the codebase on 2026-09-29 (commits `923240d8`, `6246a7f4`) with no accompanying gate record. Per the Combined Engineering Specification §36/§38 ("Workstream Handoff and G0-G4 Approval Gates"), the G4 gate requires:

| Requirement | Specification | As found in this codebase before this ADR |
| --- | --- | --- |
| Authorizer | Board-delegated authority, CTO, CISO, Legal/Compliance and sector specialists | None recorded |
| Precondition | Contracted/funded demand for the sovereign, OT or critical-infrastructure deployment | None recorded |
| Default until accepted | No speculative build (spec: "No speculative sovereign, OT or critical-infrastructure ... deployment"; Master Build Plan §2 lists "sovereign/private/OT deployment" as **out of scope for ERB-01**) | Eight services built, wired into their NestJS modules and reachable, several over public per-tenant HTTP routes |
| Acceptance proof | Gate certification doc + Annex T evidence checklist | `docs/` has `g1-gate-signoff-roster.md` and `g3-ga-launch-gate-certification.md`; **no `g4-*` document exists** |

Three of the eight services also sit on top of `crypto-escrow`, which **ADR-017 (Accepted, 2026-09-18)** already froze: *"No new features or dependencies may be built on top of `homomorphic` or `crypto-escrow` until they are formally prioritized for Phase 2 / Phase 3 and approved via dedicated functional specifications"* and *"These subsystems must remain inactive by default... without an explicit tenant-level feature flag and contract entitlement."* `customer-byok-kms-proxy.service.ts`, `mpc-threshold-key-recovery.service.ts` and `confidential-computing-attestation.service.ts` were all added on 2026-09-29 — eleven days after that freeze — with their HTTP routes reachable by any tenant holding `TENANT_RESOURCE_WRITE`, no feature flag and no entitlement check. That is a direct breach of ADR-017, independent of the G4 question.

## Date
Proposed 2026-09-30.

## Addendum — 2026-10-01: external auditor workspace was not G4

`ExternalAuditorWorkspaceService`'s own docstring names its specification as
*"W26, W31-W32 & G4 Phase 4"* — W26 is the G1 "Auditor workspace" experience
contract (read-only purpose-scoped access, evidence chain inspection, Merkle
path verification), not a sovereign/OT-specific capability. It was swept
into this proposal only because it shares the same "G4 Phase…" comment style
as the genuinely G4 services below, and gating it blocked W26 entirely.
Corrected: `ExternalAuditorController` no longer carries `G4GateGuard`. The
remaining seven services are unaffected — checked each one's
specification docstring directly: none names a W-numbered experience
contract, only §36/§38 (the gate-approval workstream), §C7 (evidence
architecture) or a bare G4 Phase reference.

## Current implementation state (verified against the code)

All eight services below were originally proposed together; the external
auditor workspace is no longer gated as of the 2026-10-01 addendum above, so
seven remain part of this G4 proposal. All eight are functionally
implemented and unit-tested (6 spec files touched directly, 16/16 tests
passing as of this ADR):

| Service | Location | Exposure |
| --- | --- | --- |
| OT protocol threat detection (Modbus/DNP3/OPC-UA) | `shield-core/modules/detection/ot-threat-detector.service.ts` | `OtThreatController` — public tenant HTTP (`api/v1/detection/ot/*`) |
| Safety-critical actuator interlock / emergency fail-safe | `shield-action/safety-interlock/safety-critical-actuator-block.service.ts` | `ShieldActionController` — internal service-to-service only (`InternalAuthGuard`) |
| Airgap compliance package export | `shield-core/modules/audit-package/airgap/airgap-compliance-package.service.ts` | `AirgapComplianceController` — public tenant HTTP (`api/v1/compliance/airgap/*`) |
| Offline telemetry buffering | `shield-core/modules/evidence/offline-telemetry-buffer.service.ts` | consumed by `airgap-ingest.controller.ts` — public tenant HTTP |
| Customer BYOK/HYOK key custody (Topology T4) | `shield-core/modules/crypto-escrow/customer-byok-kms-proxy.service.ts` | `CryptoEscrowController` — public tenant HTTP (`api/v1/crypto-escrow/byok/*`) — **also an ADR-017 breach** |
| MPC threshold key recovery | `shield-core/modules/crypto-escrow/mpc-threshold-key-recovery.service.ts` | `CryptoEscrowController` — public tenant HTTP (`api/v1/crypto-escrow/mpc/*`) — **also an ADR-017 breach** |
| Confidential-computing hardware attestation | `shield-core/modules/crypto-escrow/confidential-computing-attestation.service.ts` | `CryptoEscrowController` — public tenant HTTP (`api/v1/crypto-escrow/attestation/*`) — **also an ADR-017 breach** |
| External auditor workspace (independent assurance) | `shield-core/modules/audit-package/auditor/external-auditor-workspace.service.ts` | `ExternalAuditorController` — public tenant HTTP (`api/v1/auditor/*`) — **not gated; see 2026-10-01 addendum, this is W26** |

`CryptoEscrowController`'s `kms-health/*` routes (multi-cloud KMS failover) are **not** part of this proposal — that is general infrastructure resilience, not a sovereign/OT/G4 capability, and stays live.

## Decision

We propose the eight services above as the initial G4 capability set, for the G4 gate owners (Board-delegated authority, CTO, CISO, Legal/Compliance, sector specialists) to evaluate against contracted/funded sovereign, OT or critical-infrastructure demand.

Until that evaluation produces a ratified `g4-gate-certification.md` (mirroring `g3-ga-launch-gate-certification.md`) naming this ADR as its authorization record:

1. Every HTTP-reachable G4 route (all of the above except the internal-only `ot-interlock/*` routes and `kms-health/*`) is closed with a hard `ForbiddenException` via a new `G4GateGuard`, applied per-route — not per-controller, since `CryptoEscrowController` and the airgap/evidence controllers mix in-scope and G4 routes.
2. The internal-only `ot-interlock/*` routes (safety-critical actuator interlock) also get `G4GateGuard`: they are reachable by any other ZoikoShield service holding a valid workload token, and a fail-safe/interlock override is exactly the kind of live action G1's precedent (`Close the live response path until G1 is ratified`) already treats as requiring an explicit gate.
3. The underlying services and their unit tests are left untouched — this is a reachability gate, not a code deletion. Engineering work is preserved as a reference implementation for whoever evaluates the G4 proposal, consistent with ADR-017's "Asset Preservation" rationale for the crypto-escrow freeze.
4. `docs/g3-ga-launch-gate-certification.md` is corrected separately (see the accompanying commit) where it currently claims coverage the code does not back.

## Consequences

### Positive
- No sovereign/OT/critical-infrastructure capability is reachable by a tenant or another service before Board authorization, closing both the G4 gap and the ADR-017 breach with one mechanism.
- The engineering work is preserved, tested and ready to demonstrate to the G4 gate owners rather than deleted or hidden.
- `check:capability-claims` / GTM governance no longer has a silent gap: these routes now fail closed instead of silently being "in scope" by omission.

### Negative / Trade-offs
- None of the eight services can be exercised end-to-end (including by an internal caller) until this ADR is either ratified or superseded — any team wanting to demo G4 work needs a temporary, explicitly-reviewed carve-out, not a silent flag flip.
