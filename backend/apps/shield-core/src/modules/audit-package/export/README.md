# Audit Package Export Services Architecture

This module contains two complementary export services designed for distinct verification scopes:

---

## 1. `AuditPackageExportService`
- **Location**: `apps/shield-core/src/modules/audit-package/export/audit-package-export.service.ts`
- **Purpose**: Low-level packaging for the standalone offline verifier tool (`verifier-cli`).
- **Specification Reference**: Combined Engineering Specifications §43 & LAB 11.
- **Output Artifacts**:
  - `manifest.json`: Full canonical manifest envelope with inclusion proofs and signature.
  - `envelope.json`: Package metadata (`packageId`, `packageVersion`, `packageEnvelopeHash`) stored outside the manifest.
  - `evidence/*.json`: Exact raw content bytes for zero-dependency byte-level integrity verification.
- **Usage**: Invoked during formal audit package generation when export to directory or ZIP archive is requested for offline verifier execution.

---

## 2. `AuditorEvidenceExportService`
- **Location**: `apps/shield-core/src/modules/audit-package/export/auditor-evidence-export.service.ts`
- **Purpose**: High-level continuous assurance compilation for SOC 2 Type II and ISO/IEC 27001:2022 compliance reviews.
- **Specification Reference**: Master Build Plan §8 (Weeks 33–40) & §9 (Compliance Assurance).
- **Key Capabilities**:
  - Compiles mapped control evaluations across all 8 standard SOC 2 (CC6.1, CC6.6, CC7.1, CC7.2) and ISO 27001 (A.5.15, A.8.7, A.8.16, A.8.24) controls.
  - Generates domain-separated Merkle root over all control leaf digests.
  - Attests chain of custody with post-quantum (ML-DSA-65 / Dilithium3) and classical (Ed25519) signature digests.
- **Usage**: Invoked by compliance controllers and auditor dashboards for real-time compliance posture certification.
