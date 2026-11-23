# ADR-24 (Proposal): Environment Model and Promotion Path

## Status
**Proposed — not accepted.** Nothing in this record is ratified.

| Item | Value |
| --- | --- |
| Owner / acceptor | CTO / Head of Platform Engineering (accountable); Platform Engineering, SRE, Cloud Infrastructure, CISO |
| Decision required by | G0 Build Authorization (environment model and regional-cell blueprint are G0 infrastructure evidence); no later than before the G1 production cell |
| Default until accepted | Two environments (`nonprod`, `production`) as they exist today; no production data in non-production |
| Acceptance proof | Environment inventory in code, parity evidence between STAGE and PROD, one canary release and one restore exercise |

## Date
Proposed 2026-11-23.

## Context
The G0 infrastructure document defines nine environment classes and invariants INF-04 (immutable promotion), INF-05 (environment independence: identity, keys, data, routes do not cross by default) and INF-06 (no standing privilege). It also states that production data must not be copied to lower environments merely to ease testing.

## Current implementation state (verified in the repo)

| Spec class | Purpose (spec) | In repo today |
| --- | --- | --- |
| LOCAL | developer build, synthetic data | `docker-compose.yml` (local) |
| PREVIEW | per-change, TTL, synthetic tenant | none |
| DEV | shared integration | none distinct from nonprod |
| INT | contract/connector/migration tests | none distinct |
| SEC/PERF | adversarial, scale, chaos, restore | none (load/DR results exist only as documents in `docs/evidence/`) |
| STAGE | production-equivalent rehearsal | `infrastructure/tofu/environments/nonprod` (32 lines, one regional cell) |
| PROD | customer operation | `infrastructure/tofu/environments/production` (106 lines) |
| RECOVERY | scheduled restore/failover | none; `ADR-16` holds failover parameters only |
| SYNTHETIC CANARY | Zoiko-owned tenant on full prod path | none |

Other facts: there is no CI job for OpenTofu plan, policy or drift; the VM-based deploy (`deploy-vm.yml`) targets one host.

## Decision required

| Option | Description | Trade-off |
| --- | --- | --- |
| **A (recommended default for G0/G1)** | Stage the model: keep LOCAL + one shared nonprod acting as DEV/INT/STAGE for G0; add **PREVIEW (TTL)**, **SYNTHETIC CANARY** and a scheduled **RECOVERY** exercise before G1; add a dedicated **SEC/PERF** environment before G2. | Meets G1 evidence with bounded cost; STAGE parity must be proven, not assumed. |
| B | Implement all nine classes before G1. | Highest assurance; highest cost and delay for a pre-production platform. |
| C | Keep two environments. | Cheapest; cannot satisfy canary, restore-evidence or parity gates. |

Sub-decisions: (i) per-environment GCP projects/folders and separate keys (INF-05); (ii) data rules per class (synthetic only below STAGE); (iii) who may deploy to each class; (iv) whether PREVIEW is exposed to the internet.

## Consequences if ratified
- `infrastructure/tofu/environments/` gains modules per class; CI gains plan/policy/drift checks.
- Promotion is by digest (ADR-23) through DEV → INT → STAGE → canary → PROD.
- Cost guardrails and TTLs are needed for PREVIEW and SEC/PERF.
- Release evidence can reference environment-bound results.

## Acceptance evidence
Environment inventory; STAGE vs PROD parity report; canary release record; restore exercise result per the RECOVERY class; proof that production data is absent below STAGE.

## Related
ADR-16, ADR-18, ADR-19, ADR-23 (proposal), ADR-25 (proposal); G0 infrastructure document §4 and environment table.
