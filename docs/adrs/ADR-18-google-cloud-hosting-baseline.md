# ADR-18 — Google Cloud as the hosting baseline

## Status

**ACCEPTED for development and non-production, 2026-09-25.**

Decided by the platform owner on the basis that ZoikoShield is pre-production:
no production tenants, no customer data, no external commitments. A formal
multi-signature ratification would be ceremony over a decision that is already
reflected in the code and the infrastructure, and nothing is at risk while the
platform is in development.

**This acceptance does not authorise production.** The CTO assurance review of
24 September 2026 made the hosting baseline a precondition for accepting
live-cloud evidence (P0-01), and that remains true: this record settles *which
provider*, not *whether the cell is proven*. Before G1, the consequences listed
below must be evidenced, not merely decided.

## Date

2026-09-25

## Context

The prior ratified platform baseline was AWS-first and managed-first, citing
EKS, S3/Iceberg and OpenTofu. The assurance review observed `europe-west3` in
a compliance status line — Google Cloud's Frankfurt region — and correctly
identified it as unexplained drift: a hosting change cannot arrive incidentally
inside a status report.

Since that review, the drift has become substantive rather than incidental. On
24 September 2026 the platform's two cloud-specific subsystems were migrated to
Google Cloud on instruction:

- **Key management.** `@aws-sdk/client-kms` was removed entirely. Four signers
  — evidence checkpoints, evidence collectors, governed response commands and
  subject-key wrapping — now use Cloud KMS through `backend/libs/kms/`.
- **Evidence storage.** A native Cloud Storage implementation was added for
  both shield-core and shield-ingest, selected when `EVIDENCE_GCS_BUCKET` and
  `GOOGLE_CLOUD_PROJECT` are set.
- **Kafka.** The client gained TLS and SASL, including OAUTHBEARER, which is
  how Google's Managed Service for Apache Kafka authenticates.

So the position is no longer "a region name appeared in a status line". The
code now targets Google Cloud, and the controlled architecture still says AWS.
One of the two has to move.

## Decision required

Name the authoritative cloud provider for each ZoikoShield regional cell.

## What the code does today

| Concern | Implementation | Portable? |
|---|---|---|
| Signing and key custody | Cloud KMS (`asymmetricSign`, `encrypt`/`decrypt`) | No. A different provider needs a new implementation behind the existing signer interface. |
| Evidence storage | Cloud Storage native API, per-object retention `mode: 'Locked'` | No. S3 Object Lock and GCS object retention are different APIs; the S3 client remains only for MinIO in non-production. |
| Event backbone | Kafka protocol, TLS/SASL configurable | Yes. Any Kafka-API service. |
| Database | PostgreSQL over a standard libpq URL | Yes. |
| Cache | Redis | Yes. |
| Compute | Stateless HTTP containers | Yes, with the caveat that three services run Kafka consumers and schedulers and must not scale to zero. |

Two of the six are provider-specific by necessity: key custody and WORM
storage are exactly the places where a cloud's guarantees, not just its API,
are what the control depends on.

## Consequences if ratified

- `docs/GCP_DEPLOYMENT_GUIDE.md` becomes the controlled deployment document,
  and the AWS-oriented sections of the prior architecture baseline are
  superseded rather than merely stale.
- The following must be re-derived for Google Cloud before G1: threat model,
  provider risk assessment, DR and residency mapping, cost model, IAM
  boundaries, and the regional-cell definition including `europe-west3`.
- Evidence WORM depends on a bucket created with per-object retention, which
  cannot be retrofitted. Any bucket created before this decision must be
  replaced, not amended.
- Subprocessor and data-transfer records change, which is a DPO matter, not an
  engineering one.

## Consequences if rejected

The KMS and storage migrations must be reverted or made multi-provider behind
the interfaces they already sit behind, and `europe-west3` must not be treated
as a production regional-cell baseline.

## What this record does not decide

Whether a multi-cloud or provider-portable posture is required. If it is, the
signer and storage seams already support it — each has an interface with
per-environment implementations — but no second implementation exists today
and none should be claimed.

## What this record settles, and what it does not

| | |
|---|---|
| **Settled** | Google Cloud is the hosting baseline. `europe-west3` is a legitimate development cell. The KMS, storage and Kafka migrations stand. The AWS-first sections of the prior architecture baseline are superseded. |
| **Not settled** | Whether any regional cell is *proven*. No cell has been applied, health-checked, attacked negatively, restored or failed over. |
| **Still required before G1** | Threat model and provider risk assessment for Google Cloud; DR and residency mapping; live cell conformance and cross-cell negative tests; DPO review of subprocessors and transfers. |

Recorded in `docs/G1_EVIDENCE_INDEX.md`, which carries the live-cell gate as
`NOT_RUN` and does not treat this acceptance as evidence of anything beyond
the provider choice.

## Infrastructure alignment

Reviewing the infrastructure against this decision found the OpenTofu regional
cell was already Google Cloud — GKE, Cloud Storage, Cloud KMS — which is where
`europe-west3` came from. The drift the review identified was between the
*documents* and the build, not within the build.

Two mismatches between that infrastructure and the application were corrected
at the same time:

- The evidence bucket had no `enable_object_retention`, so the per-object
  `mode: 'Locked'` retention the application sets would have had nothing to
  attach to. Writes would have succeeded with no immutability.
- A bucket-wide seven-year `retention_policy` would have made every object
  undeletable for seven years, including a tenant's 90-day STANDARD evidence,
  turning every offboarding erasure under ZS-ENG-OFF-DEL-001 into a permanent
  residual. Retention is now set per object, from the record's profile.

The cell also defined only a symmetric CMEK for bucket encryption and none of
the three asymmetric signing keys the services refuse to start without. Those
are now declared, along with the subject-key wrapping key.
