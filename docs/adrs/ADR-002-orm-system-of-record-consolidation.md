# ADR-002: ORM System of Record Consolidation (Prisma Standardization)

## Status
**Accepted**

## Date
2026-09-07

## Context
During the codebase gap analysis against the 18 controlled engineering wireframes (Section 13.2 of the Backend Engineering Build Guide), an architectural duality was identified:
- **Prisma**: 14 files, primary `schema.prisma` defining authoritative domain entities, relations, client generation, and `prisma/migrations`.
- **TypeORM**: 57 files, entities across several modules, and a dedicated `typeorm-migrations/` folder.

Maintaining two ORMs concurrently against shared domain databases creates significant risks:
1. **Migration Drift**: Two independent migration histories can easily diverge or introduce competing DDL locks in production.
2. **Type Inconsistency**: Separate entity representations can drift in field types, nullability, or relation mappings.
3. **Transaction Context Disconnection**: Transactions opened in Prisma cannot coordinate transactional outbox rows managed by TypeORM, risking atomicity violations.

## Decision
We designate **Prisma** as the single authoritative **System of Record (Schema, Migrations, and Query Engine)** for all ZoikoShield backend services.

### Consolidation Strategy:
1. **Authoritative Schema**: `prisma/schema.prisma` is the sole source of truth for database schema definitions, indices, and constraints.
2. **Unified Migration Pipeline**: Database migrations will be generated and applied exclusively via `prisma migrate deploy` in CI/CD and deployment environments.
3. **TypeORM Deprecation & Safe Phased Consolidation**:
   - Existing TypeORM migration history is reconciled into Prisma migrations.
   - Module repositories will migrate queries to `PrismaService` or raw parameterized SQL (`$queryRaw`) using tenant-scoped query plans.
   - TypeORM runtime dependencies will be phased out across all 64 domain modules.

## Consequences

### Positive:
- **Single System of Record**: Eliminates dual-migration risk and ensures reproducible schema state across non-prod, staging, and production regional cells.
- **Strict Tenant Context in Queries**: Prisma Client extensions and custom query wrappers enforce mandatory `tenant_id` query-plan filtering across all domain tables.
- **Clean Transactional Outbox Integration**: All domain writes and outbox insertions execute atomically within unified Prisma transactions (`prisma.$transaction`).

### Negative / Migration Tasks:
- Modules with existing TypeORM entity models will undergo refactoring to use Prisma Client queries and repositories.
