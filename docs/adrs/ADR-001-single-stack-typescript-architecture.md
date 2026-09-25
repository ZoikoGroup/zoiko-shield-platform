# ADR-001: Single-Stack NestJS / TypeScript Architecture Ratification

## Status
**Accepted** (Ratified per TUT-08 Architecture Reconciliation)

## Date
2026-09-07

## Context
The 18 controlled engineering wireframes and GCP Engineering Build Tutorial (ZS-ENG-TUT-001) originally proposed a polyglot backend stack:
- `shield-core`: Java 25, Spring Boot 4.1, Spring Modulith 2.1, jOOQ, Flyway
- `shield-ingest`: Go, gRPC, Protobuf, OCSF, Managed Kafka
- `shield-action`: Go, Cedar, Cloud KMS/HSM, signed commands
- `shield-anchor`: Go, Cloud Storage retention lock, Merkle proofs, offline verifier
- `shield-ai`: Python 3.14, FastAPI, Vertex AI, Model Armor

The working implementation across the ZoikoShield repository is unified under a single-language **NestJS / TypeScript monorepo** across all five services (`shield-core`, `shield-ingest`, `shield-action`, `shield-anchor`, `shield-ai`), sharing canonical contracts, validation types, and runtime libraries.

Per Rule TUT-08 (*"Stop on ambiguity"*) and the CI/CD doctrine requirement that any technology deviation must be governed by an explicit Architecture Decision Record (ADR), this document formally evaluates and ratifies the single-stack architecture.

## Decision
We formally ratify the **NestJS / TypeScript monorepo architecture** as the standard platform implementation for all ZoikoShield backend services.

### Key Architectural Tenets:
1. **Domain Boundary Preservation**: The modular monolith (`shield-core`) and the four isolated satellite services (`shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`) preserve strict interface and namespace boundaries. No cross-service or cross-module direct table manipulation is permitted.
2. **Canonical Contracts & Types**: Cross-service events, commands, and API models are defined via canonical schemas (OpenAPI 3.1, JSON Schema, and Protobuf) with shared TypeScript types (`packages/contracts` and `libs/contracts`).
3. **Deterministic Governance**: Authorization (Cedar-style policy evaluation), cryptographic signing (KMS/HSM abstractions), and evidence ledger commitments (SHA-256 hash chains and Merkle proofs) are natively implemented in high-performance TypeScript/Node.js LTS runtimes.
4. **Standalone Zero-Dependency Offline Verifier**: The independent evidence verifier (`tools/independent-verifier`) remains a zero-dependency, offline-by-default TypeScript/Node.js CLI package with no proprietary Zoiko runtime dependencies.

## Consequences

### Positive:
- **Zero Cross-Language Type Duplication**: DTOs, domain models, validation schemas, and canonical event envelopes are defined once and reused seamlessly across all five services and the verifier CLI.
- **Unified Dependency & Security Governance**: Single `package.json` lockfile, automated Renovate dependency governance, unified vulnerability scanning, and consistent CI/CD build pools.
- **Fast Cross-Functional Velocity**: Eliminates context switching across three distinct language ecosystems (Java/Go/Python) while maintaining strict architectural isolation and low latency.
- **Deterministic Test Harnessing**: Full end-to-end integration tests, replay determinism tests, and adversarial security suites execute within a unified Jest testing runner.

### Negative / Trade-offs:
- CPU-intensive cryptographic or streaming operations must be monitored for event-loop saturation. Critical hot paths (e.g. Merkle aggregation, OCSF streaming normalization) utilize streaming workers, worker threads, or native C/crypto bindings where necessary.
