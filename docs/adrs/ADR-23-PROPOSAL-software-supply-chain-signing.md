# ADR-23 (Proposal): Software Supply Chain — Registry, Build-Once Promotion, SBOM/Provenance and Signing

## Status
**Proposed — not accepted.** Nothing in this record is ratified.

| Item | Value |
| --- | --- |
| Owner / acceptor | CTO / Developer Platform (accountable); Security / DevSecOps, SRE, Release Engineering |
| Decision required by | Before G0 Build Authorization closes the CI/CD decision set (G0 spec §37.1); before any G1 canary release |
| Default until accepted (from the G0 spec) | Private immutable registry/mirror with digest, retention, audit and recovery; ephemeral isolated runners, no shared persistent production runner; standards-based attestations with HSM/KMS-backed signing and independent verification |
| Acceptance proof | One end-to-end signed release to staging and a production canary, with SBOM/provenance verified at admission and a rollback demonstrated |

## Date
Proposed 2026-11-23.

## Context
The G0 CI/CD invariants require: **CICD-04** build once (the same digest is tested, signed and promoted), **CICD-05** ephemeral builders with no standing production credentials, **CICD-07** no builder-held signing key, **CICD-08** no artifact advances without provenance and SBOM.

## Current implementation state (verified in the repo)

- `.github/workflows/ci.yml` builds five service images with `push: false`; nothing is pushed to a registry and no digest is recorded.
- `.github/workflows/deploy-vm.yml` deploys by SSH (`appleboy/ssh-action`) running `~/deploy-zoikoshield.sh` on a VM, using `GCP_SSH_HOST/USER/KEY` secrets. The artifact that runs is built on the VM, not the one CI tested, and the SSH key is a standing credential.
- The only supply-chain scan is `npm audit --audit-level=high --omit=dev`. No SAST, secret scanning, container scan, IaC scan, dependency-update automation, SBOM generation in CI, provenance or signing.
- `docs/evidence/g1-release-sbom-manifest.*` is a generated document with a manifest digest; it is not produced by the build or bound to an image digest.
- `.github/CODEOWNERS` already routes `/.github/` and `/infrastructure/` to infra and security leads.
- Cloud KMS signing exists for evidence/commands via `backend/libs/kms` (ADR-18).

## Decision required

### D1 — Artifact registry
| Option | Notes |
| --- | --- |
| **A (recommended default)** | Google Artifact Registry (consistent with ADR-18), private, immutable tags, digest-pinned deploys, retention and audit logging. |
| B | GitHub Container Registry. Simpler; weaker alignment with GCP IAM and residency. |
| C | Self-hosted registry. Highest operating burden. |

### D2 — Build and promotion
Build once in CI on ephemeral runners (workload identity federation to GCP, no long-lived keys), push by digest, and **promote the digest** through environments (see ADR-24). Rebuilding per environment and mutable tags (`latest`) are prohibited. A release manifest binds digest, config bundle, schema/policy versions and approvals.

### D3 — SBOM and provenance
Generate a CycloneDX or SPDX SBOM per image during the build and a SLSA-compatible provenance attestation; attach both to the digest. (G0 spec default: SLSA v1.2-compatible provenance.)

### D4 — Signing
| Option | Notes |
| --- | --- |
| **A (recommended default)** | Keyless or KMS-backed **cosign** signing performed by a separate gated job/identity, not the build job; key custody per ADR-25. |
| B | Binary Authorization attestations only. Tighter GCP coupling. |

### D5 — Admission and deployment
Replace SSH-script deployment with a pull/GitOps or deploy-job path to the target (Cloud Run/GKE per ADR-18/ADR-24) that verifies signature, provenance and policy before admission (e.g. Binary Authorization or an admission controller). Deploy approvals use GitHub Environments with required reviewers; author, approver and releaser are separated (CICD-03). Emergency path is a compressed but controlled workflow, not a bypass.

### D6 — Scanning and dependency intake
Add SAST, secret scanning (push protection plus CI), container and IaC scanning, and dependency-update automation with risk-based intake. Exceptions are time-boxed and owned.

## Consequences if ratified
- CI gains registry push, SBOM, provenance, signing and verification jobs; `deploy-vm.yml` is retired or reduced to a break-glass path.
- The SSH secret and VM deploy script leave the trust path.
- Release evidence (G1/G2) can cite digest-bound artifacts instead of document-only SBOMs.
- Cost: runner minutes, registry storage, added pipeline time.

## Acceptance evidence
Signed image digest in the registry; verification output at admission; SBOM and provenance attached to that digest; rollback to the previous digest; negative test showing an unsigned or rebuilt image is rejected.

## Related
ADR-18, ADR-24 (proposal), ADR-25 (proposal); G0 spec CI/CD document §37 and invariants CICD-01..08.
