# ADR-017: Classification and Boundary Constraints for Experimental Cryptographic Subsystems

## Status
**Accepted** (Parked as Experimental Tier-2 / [derived])

## Date
2026-09-18

## Addendum — 2026-09-30

`customer-byok-kms-proxy.service.ts`, `mpc-threshold-key-recovery.service.ts` and
`confidential-computing-attestation.service.ts` were added to `crypto-escrow`
on 2026-09-29 (commit `6246a7f4`), with their HTTP routes reachable by any
tenant holding `TENANT_RESOURCE_WRITE` — no feature flag, no contract
entitlement. That breached both the Frozen Code Surface and Zero Default
Activation rules above.

Remedied the same way Zero Default Activation already required: those three
routes' groups (`byok/*`, `attestation/*`, `mpc/*`) on `CryptoEscrowController`
now carry `G4GateGuard`, which fails closed with a `ForbiddenException` on
every call (`apps/shield-core/src/modules/authorization/guards/g4-gate.guard.ts`).
See **ADR-20** for the full G4 capability set this is part of and the
authorization this ADR's freeze rules and G4's Board-authorization requirement
both still await. `kms-health/*` on the same controller is unaffected — that
is general multi-cloud KMS failover, not part of `crypto-escrow`'s frozen
surface.

## Context
A direct code audit of `apps/shield-core/src/modules/` identified two advanced cryptographic subsystems:
1. **`homomorphic`** (`paillier-homomorphic-aggregator.service.ts`): Implements additive homomorphic encryption using the Paillier cryptosystem to enable encrypted aggregation of multi-tenant security metrics without plaintext disclosure.
2. **`crypto-escrow`** (`split-kms-escrow.service.ts`, `kms-health-rebalancer.service.ts`): Implements $(k, n)$ threshold split-key escrow and dynamic multi-cloud KMS health rebalancing across three separate cloud KMS providers, including Google Cloud KMS.

Cross-verification against the 19 authoritative specification documents confirms that while these subsystems represent mathematically valid privacy-preserving and multi-cloud resilience patterns, neither concept is mandated in the baseline **ERB-01 / Gate-1** capability scope. Uncontrolled expansion of ungrounded cryptographic primitives introduces architectural complexity and review ambiguity.

## Decision
We formally classify both `homomorphic` and `crypto-escrow` as **[derived] / Experimental Tier-2 Extensions** and park them under strict boundary rules:

### Boundary Constraints & Invariants:
1. **Critical Path Isolation**: Neither `homomorphic` nor `crypto-escrow` may be placed in the critical execution path of core ERB-01 services (tenant onboarding, telemetry ingestion, OCSF normalization, rule detection, SOAR response brokering, or evidence ledger anchoring).
2. **Zero Default Activation**: These subsystems must remain inactive by default. No tenant environment or production workflow may invoke or depend upon them without an explicit tenant-level feature flag and contract entitlement.
3. **No Upstream Evidence Ledger Mutation**: Neither subsystem may bypass or alter the authoritative evidence ledger, RFC 6962 domain-separated Merkle trees (ZS-MERKLE-V1), or post-quantum hybrid signatures (ML-DSA-65 / ECDSA-P256) managed by `shield-anchor`.
4. **Frozen Code Surface**: No new features or dependencies may be built on top of `homomorphic` or `crypto-escrow` until they are formally prioritized for Phase 2 / Phase 3 and approved via dedicated functional specifications.

## Consequences

### Positive:
- **Scope Grounding**: Strictly aligns the active codebase with the 19 certified specification documents.
- **Architectural Clarity**: Prevents ungrounded security primitives from blocking ERB-01 / G1 release gate certification.
- **Asset Preservation**: Retains the existing implementations as tested, high-quality reference architectures for future multi-party computation (MPC) and sovereign key-escrow requirements without architectural drift.

### Negative / Trade-offs:
- Experimental capabilities remain parked and will not be exposed to general availability tenants in Phase 1.
