# ADR-18 (PROPOSAL) — Google Cloud as the hosting baseline

## Status

**PROPOSAL. Not ratified.** This record exists because the implementation and
the ratified architecture currently disagree, and the CTO assurance review of
24 September 2026 named that disagreement a launch blocker (P0-01). It states
what changed and why so a named approver can ratify or reject it. It does not
ratify itself.

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

## Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| VP Engineering | | | |
| Cloud Platform | | | |
| CISO | | | |
| DPO | | | |

Unratified. Until every row above is completed, the hosting baseline remains
formally unresolved and `europe-west3` is not an approved production cell.
