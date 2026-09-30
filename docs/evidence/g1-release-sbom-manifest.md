# G1 release provenance — Software Bill of Materials (SBOM) and signed manifest

**Release Candidate:** `v1.0.0-GA-G1`  
**SBOM Identifier:** `SBOM-ZS-1790759135966`  
**Specification:** `ZS-SEC-SBOM-001` / `SPDX-2.3` / `CycloneDX-1.5`  
**Generated At:** `2026-09-30T09:05:35.964Z`  
**Canonical Manifest Digest (SHA-256):** `9de1cca2ed6a789763c9eb22c3009d6c4a2b1836b974e9f56e650e1d8e338ea0`  

---

## 1. Primary Workload Components

| Component | Type | Runtime / Language | Source Directory | Direct Dependencies | Tree Digest (SHA-256) |
|---|---|---|---|---|---|
| **shield-core** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-core` | 32 | `1d5b416124fc3a04...` |
| **shield-ingest** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-ingest` | 32 | `b2f899aeee7ed948...` |
| **shield-ai** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-ai` | 32 | `22499ed20e41a716...` |
| **shield-action** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-action` | 32 | `6e73729b1a2f1817...` |
| **shield-anchor** | `microservice` | TypeScript / Node.js 20 | `backend/apps/shield-anchor` | 32 | `f533e51f2d3f835e...` |
| **verifier-cli** | `utility` | TypeScript / Node.js Stdlib (Zero Runtime Dep) | `backend/apps/verifier-cli` | 0 | `71f9aab7e2614e79...` |
| **frontend** | `frontend` | TypeScript / Next.js 15 / React 19 | `frontend` | 6 | `7e94db39bdeeaa43...` |

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
2. **Single Immutable Root:** All monorepo service definitions, infrastructure OpenTofu modules, and dependencies resolve to the canonical release manifest digest `9de1cca2ed6a789763c9eb22c3009d6c4a2b1836b974e9f56e650e1d8e338ea0`.
3. **Tamper Evident:** Modifying any file or dependency version alters the computed SBOM root digest, invalidating downstream G1 gate certification.

---

*Generated automatically by `npm run generate:sbom` under ZS-SEC-SBOM-001 release provenance standard.*
