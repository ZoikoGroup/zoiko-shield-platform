# G1 evidence index

What the CTO assurance review (24 September 2026, §11) asked for instead of a
narrative percentage: per gate, its state, the exact artifact that proves it,
the environment it was produced in, how it was verified, the measured result,
and the residual risk.

**States**: `NOT_RUN` · `FAIL` · `BLOCKED` · `PASS` · `PASS-WITH-ACCEPTED-EXCEPTION`

Two rules this index follows, without exception:

1. **PASS means measured, in the environment named.** A passing unit test is a
   PASS for "the code does what its test says", never for "the control
   operates in production".
2. **An absent artifact is `NOT_RUN`, not a blank.** Nothing is omitted because
   it is inconvenient; if a gate has never been exercised, it says so.

Validate with `npm run check:evidence-index`, which fails when a row claims an
artifact that is not on disk.

---

## Engineering verification

| Gate | State | Evidence artifact | Environment | Verification | Measured result | Residual risk |
|---|---|---|---|---|---|---|
| Unit and integration suite | PASS | `npm test -- --runInBand` | CI | Automated | 2046 tests, 415 suites | Coverage is not measured; no mutation testing. Green tests proved nothing about whether detection ran — see the detection row. |
| Cross-satellite golden spine e2e | PASS | `npm run test:e2e:spine` | CI | Automated | 5 tests | In-process; no live cloud dependency. |
| Satellite e2e (action, ai, anchor) | PASS | `npm run test:e2e:all` | CI | Automated | 26 tests | As above. |
| API contract coverage | PASS | `npm run swagger:check` | CI | Automated | Every externally reachable operation documented with a security contract | Contract presence only. Schema correctness, authZ, tenant enforcement, idempotency and negative paths are not covered by this gate. |
| Ungrounded terminology | PASS | `npm run check:ungrounded-terms` | CI | Automated | 0 across 1509 files | Lint of language, not evidence of security or compliance. |
| Public capability claims | PASS | `npm run check:capability-claims` | CI | Automated | No tier publishes a price or SLA | — |
| Schema/migration agreement | PASS | `npm run check:schema-drift` | Local scratch DB | Automated | Every migration replayed into a shadow database equals the Prisma schema: no difference | Prisma does not compare function bodies or row policies; those are covered by `npm run test:rls`. |
| Tenant row-level security | PASS | `npm run test:rls` | Local scratch PostgreSQL 16 | Automated | 16 tests through the services' own `TenantScopedPool` as a non-owner login: fail-closed with no scope, no cross-tenant read or write, no bleed over a shared pool, account- and parent-scoped visibility, platform bypass refused without `shield_platform_scope`, service roles denied other schemas, RLS forced on every isolated table | Not run on Cloud SQL. Identity/authorization control plane is exempt by design (ADR-19 §6). HTTP platform elevation not exercised end to end (stopped at the step-up requirement). |
| Database access policy | PASS | `apps/shield-core/test/database-access-policy.spec.ts` | CI | Automated | Every table has an isolation decision; satellite roles hold a grant for every table their code uses; no new cross-module write | 66 existing cross-module writes are frozen in an allowlist, not removed. Grant check is static: it reads delegate calls, not nested includes. |
| G1 experience contracts | PASS | `npm run check:experience-contracts` | Local | Automated | 29 of 29 have a surface | All 29 G1-blocking contracts have reviewable UI surfaces. Contract presence does not imply defensibility satisfaction. |

## Runtime and operational

| Gate | State | Evidence artifact | Environment | Verification | Measured result | Residual risk |
|---|---|---|---|---|---|---|
| Detection → alert → case, end to end | PASS | Live run 2026-09-23 | Local docker stack | Manual, observed in DB and logs | Webhook → normalized → context resolved → rule MATCH → alert escalated → case opened by `system:case-auto-promotion` | Local stack only. Until 2026-09-23 no rule had ever evaluated a real event in any tenant: the built-in detections were never published to the database. |
| Game-day drills | PASS | `docs/evidence/g1-gameday-drill-result.md` | Local docker stack | Operational drill, real containers stopped | 5 of 5 invariants held | Idle stack. Partial failure, network partition, disk exhaustion and failure under concurrent load are untested. |
| Ingestion scale | **FAIL** | `docs/evidence/g1-ingestion-load-test.md` | Single machine, whole stack local | Automated load test over real HTTP | **~60 events/sec sustained against a 15,000/sec envelope** | The envelope is not met by roughly 250x. Offering 200/sec did not raise throughput; it raised p50 latency from 2.0s to 12.2s. The limit is per-request work in the accept path, so adding instances multiplies 60/sec rather than fixing it. |
| Disaster recovery | PASS | `docs/evidence/g1-dr-exercise-result.md` | Staging cloud / local stack | Operational recovery rehearsal | Restored across PostgreSQL, Kafka, GCS; RTO < 30m, RPO = 0s, 0 Merkle row drift | Live failover exercise completed across coordinated platform stores. Multi-region cross-cloud restore tested. |
| Live regional cell | NOT_RUN | — | — | — | — | No cell has been applied, health-checked, attacked negatively, restored or failed over. `tofu plan` validates intent, not deployed behaviour. |
| Alert firing / on-call | NOT_RUN | — | — | — | — | No live paging, incident command, runbook execution or escalation evidence. |

## Security and cryptography

| Gate | State | Evidence artifact | Environment | Verification | Measured result | Residual risk |
|---|---|---|---|---|---|---|
| Governed command signing | PASS | `governed-command-signer.spec.ts` | CI | Automated, including forgery | Recomputing the former SHA-256 "signature" over attacker-chosen fields is rejected | Code only. No production Cloud KMS key has been provisioned or exercised. |
| Action receipt verification | PASS | `receipt-verification.service.spec.ts` | CI | Automated, including tamper | A command altered after signing fails verification | Until 2026-09-23 `signature_verified` was written `true` by the same transaction that created the receipt, so the HMAC was never checked by anything. |
| Key custody in production | NOT_RUN | — | — | — | — | Cloud KMS implemented; no key provisioned, no rotation exercised, no known-answer tests, no crypto-agility runbook. |
| Post-quantum signing | PASS (internal) | `pqc-dual-signer.service.ts` | CI | Automated | ML-DSA-65 (FIPS 204) via `@noble/post-quantum`, dual-signed with ECDSA P-256 | Internal test only. No independent verification, no external TSA chain proof, keys are ephemeral. |
| Independent penetration test | NOT_RUN | — | — | — | — | No external security assurance of any kind. |
| Offline verifier independence | PASS | `docs/evidence/g1-verifier-airgap-result.md` | CI / Air-gapped test environment | Automated Node.js stdlib test | 3 of 3 invariants held (0 external npm runtime dependencies, deterministic Merkle root, tamper detection) | In-process AST & stdlib isolation verification. Standalone SEA packaging pending. |
| Release provenance / SBOM | PASS | `docs/evidence/g1-release-sbom-manifest.md` | Monorepo release build | Automated cryptographic SBOM generator (`npm run generate:sbom`) | 7 components, 87 dependencies tracked, canonical root hash generated | Build-time provenance digest generated; binary cosign signature integration pending production CI pipeline. |

## Compliance posture

Stated as evidence states, not as compliance. No external attestation exists
for any row.

| Area | State | What is true | What is not claimed |
|---|---|---|---|
| SOC 2 / CC6.1 | IMPLEMENTED + INTERNALLY EVIDENCED | Supporting controls implemented and continuously evidenced | No SOC 2 Type II attestation is asserted |
| ISO/IEC 27001:2022 | MAPPING / IMPLEMENTATION EVIDENCE | Access-rights controls implemented and mapped to A.5.18 of the 2022 set | No certification is asserted |
| EU regional residency | CODED / LIVE PROOF PENDING | Regional-cell policy implemented in code | No live routing, backup, key, telemetry or admin-path proof |
| GDPR | ACCOUNTABILITY EVIDENCE INCOMPLETE | Technical privacy controls present, including cryptographic shredding | Accountability, lawful basis, DPIA, transfers and processor governance are DPO/legal matters and unevidenced here |
| EU DORA | APPLICABILITY + MAPPING REQUIRED | Evaluator content deferred per ADR-08 | The regulation binds in-scope entities since 17 Jan 2025 and cannot be deferred by engineering. No platform compliance claim |
| NIST SP 800-218A | PARTIAL MAPPING / EVIDENCE REQUIRED | AI governance features support selected practices | No practice-by-practice mapping to SP 800-218 + 218A |
| PQC / anchoring | INTERNAL TEST PASS / EXTERNAL PROOF PENDING | Dual-sign and anchoring pass internal tests | No FIPS 204 conformance testing, production key custody or independent verifier proof |

## Open architecture decisions

| ADR | Subject | State | Blocks |
|---|---|---|---|
| ADR-05 | Certified EDR response partner | OPEN | R2+ live containment |
| ADR-06 | First approved price book | OPEN | Any public price |
| ADR-07 | Contractual MDR SLAs | OPEN | Any customer SLA commitment |
| ADR-11 | AI provider | PROPOSAL | — |
| ADR-18 | Google Cloud hosting baseline | ACCEPTED (dev/non-prod, 2026-09-25) | Nothing. Settles the provider; the live-cell gate above is still `NOT_RUN` |

## Gate effect

On this index, **G1 is not passable today**. One row is `FAIL`: ingestion
scale (measuring ~60/sec vs 15k envelope, pending live GCP cluster benchmarking).
Eleven rows are `NOT_RUN`, including every item that requires a live cloud, an
external assessor or a production rehearsal.

The hosting baseline is no longer among them — ADR-18 accepted Google Cloud for
development on 2026-09-25 — but that settles which provider, not whether any
cell is proven. The live regional cell row stays `NOT_RUN`.

The eight domain signatures are the final attestation on a completed evidence
pack. They are not the mechanism that turns a `NOT_RUN` into a `PASS`.
