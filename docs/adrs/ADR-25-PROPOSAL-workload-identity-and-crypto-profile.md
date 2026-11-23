# ADR-25 (Proposal): Workload Identity, Service-to-Service Authentication and Cryptographic Profile

## Status
**Proposed — not accepted.** Nothing in this record is ratified.

| Item | Value |
| --- | --- |
| Owner / acceptor | CTO / Platform Security (workload identity); CISO / Data / Platform (cryptographic profile and HSM/KMS custody) |
| Decision required by | G0 Build Authorization (identity, tenant and crypto baseline); before G1 real-data threat models |
| Default until accepted (from the G0 spec §34.1) | Short-lived workload identity with mTLS for service paths, static service secrets prohibited; managed HSM/KMS, purpose-separated keys, no export for high-value signing roots |
| Acceptance proof | Service-to-service auth test, secret scan showing no static shared tokens, key inventory with purposes and rotation, signing-root custody record |

## Date
Proposed 2026-11-23.

## Context
G0 invariants: **SEC-INV-005** short-lived workload identity (no static shared tokens), **SEC-INV-003** fail closed on identity/key/approval uncertainty, **SEC-INV-004** no secret in code or prompt, and a purpose-specific key hierarchy with per-tenant context, rotation, compromise and crypto-agility contracts.

## Current implementation state (verified in the repo)

- **Key custody.** ADR-18 records that evidence checkpoints, evidence collectors, governed response commands and subject-key wrapping sign/encrypt through Cloud KMS via `backend/libs/kms/` (`@google-cloud/kms` ^6.2.0). ADR-17 covers experimental cryptographic subsystems. The G1 SBOM lists `@noble/post-quantum` (ML-DSA-65) as a dependency.
- **Service-to-service.** Services call each other through internal clients (for example the email `shield-action.client.ts`). The mechanism in use (shared token vs mTLS vs signed identity) has not been verified for this ADR and must be inventoried; treat any static shared secret as non-compliant until shown otherwise.
- **Deployment credentials.** The VM deploy path uses an SSH key stored as a CI secret (see ADR-23).
- **Database.** Service roles are NOLOGIN group roles per service (`access-policy.js`); login users are granted membership per environment.

## Decision required

### D1 — Workload identity and transport
| Option | Description | Trade-off |
| --- | --- | --- |
| **A (recommended default)** | GCP workload identity (service accounts bound to workloads) plus mTLS between services using short-lived certificates; CI uses OIDC federation, no exported keys. | Matches spec default and ADR-18; requires platform work and a service-mesh or certificate authority choice. |
| B | Signed service JWTs with short TTL and audience binding, no mTLS. | Simpler; weaker transport identity. |
| C | Keep shared internal tokens. | Non-compliant with SEC-INV-005; not recommended. |

### D2 — Cryptographic profile and custody
| Option | Description |
| --- | --- |
| **A (recommended default)** | Cloud KMS/HSM-backed keys, purpose-separated (evidence signing, command signing, per-tenant data keys, release signing), non-exportable signing roots, documented rotation and compromise procedure, crypto-agility interface. |
| B | Software-held keys for non-critical purposes only, KMS for roots. |

### D3 — Tenant key context and BYOK
Per-tenant key context for subject-key wrapping is retained; whether BYOK is offered before G3 is a Product/CISO decision.

### D4 — Release signing keys
Release signing identity is independent of the build job and its key is governed by this ADR together with ADR-23.

## Consequences if ratified
- A service-to-service authentication inventory and migration plan is required; static shared tokens are removed.
- Key inventory, purposes, rotation schedule and break-glass custody are documented as controlled (EC-3) records.
- Cost and latency of KMS calls on hot paths must be measured.

## Acceptance evidence
Key inventory; rotation and compromise drill; automated check that services reject unauthenticated or wrongly-audienced calls; secret-scanning result.

## Related
ADR-17, ADR-18, ADR-19, ADR-22 (proposal), ADR-23 (proposal); G0 security document §34.1.
