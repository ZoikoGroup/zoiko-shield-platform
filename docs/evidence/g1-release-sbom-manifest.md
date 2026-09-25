# G1 release provenance — Software Bill of Materials (SBOM) and signed manifest

**Release Candidate:** `v1.0.0-GA-G1`  
**SBOM Identifier:** `SBOM-ZS-1790318291015`  
**Specification:** `ZS-SEC-SBOM-001` / `SPDX-2.3` / `CycloneDX-1.5`  
**Generated At:** `2026-09-25T06:38:11.012Z`  
**Canonical Manifest Digest (SHA-256):** `ea80007ca02ed9076bb68380637cb030386bc41dd8503197e884f12c50962cfa`  

---

## 1. Primary Workload Components

| Component | Type | Runtime / Language | Source Directory | Direct Dependencies | Tree Digest (SHA-256) |
|---|---|---|---|---|---|
| **shield-core** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-core` | 34 | `8d1b4686aedffd01...` |
| **shield-ingest** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-ingest` | 34 | `893e3deeb129b9f8...` |
| **shield-ai** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-ai` | 34 | `8cdb1c6f70ca8c2a...` |
| **shield-action** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-action` | 34 | `2f2f6c98bd5ce600...` |
| **shield-anchor** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-anchor` | 34 | `ca52036a75f536d1...` |
| **verifier-cli** | `utility` | TypeScript / Node.js Stdlib (Zero Runtime Dep) | `backend/apps/verifier-cli` | 0 | `7474554fd7609320...` |
| **frontend** | `frontend` | TypeScript / Next.js 15 / React 19 | `frontend` | 6 | `5872042db2d14d64...` |

---

## 2. Critical Security & Cryptographic Dependencies

| Package | Version | Purpose / Standard | Scope |
|---|---|---|---|
| `@noble/post-quantum` | `^0.7.1` | ML-DSA-65 (FIPS 204) Post-Quantum Cryptographic Signatures | Production |
| `@google-cloud/kms` | `^6.2.0` | Google Cloud KMS Asymmetric & Symmetric Key Custody | Production |
| `@google-cloud/storage` | `^8.2.0` | GCS Evidence Object Storage with WORM Retention | Production |
| `kafkajs` | `^2.2.4` | High-Throughput Ingestion & Detection Message Bus | Production |
| `@prisma/client` | `^7.9.1` | PostgreSQL ORM for Public Evidence Vault Schema | Production |
| `typeorm` | `^1.1.0` | PostgreSQL Multi-Schema Multi-Tenant ORM | Production |
| `@nestjs/core` | `^11.0.1` | Microservices Inversion-of-Control Application Framework | Production |
| `next` | `^15.2.0` | React 19 Frontend User Experience Server | Production |

---

## 3. Supply Chain Integrity Attestation

1. **Zero-Dependency Air-Gap Guarantee:** The `verifier-cli` binary requires **0** external npm runtime dependencies and runs purely on Node.js standard libraries (`crypto`, `fs`, `path`, `os`).
2. **Single Immutable Root:** All monorepo service definitions, infrastructure OpenTofu modules, and dependencies resolve to the canonical release manifest digest `ea80007ca02ed9076bb68380637cb030386bc41dd8503197e884f12c50962cfa`.
3. **Tamper Evident:** Modifying any file or dependency version alters the computed SBOM root digest, invalidating downstream G1 gate certification.

---

*Generated automatically by `npm run generate:sbom` under ZS-SEC-SBOM-001 release provenance standard.*
