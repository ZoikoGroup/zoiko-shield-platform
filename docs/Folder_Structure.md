zoikoshield-backend/
│
├── apps/
│   │
│   ├── shield-core/
│   │   ├── src/
│   │   │   │
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── database.config.ts
│   │   │   │   ├── redis.config.ts
│   │   │   │   ├── kafka.config.ts
│   │   │   │   └── validation.ts
│   │   │   │
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── middleware/
│   │   │   │   ├── pipes/
│   │   │   │   ├── exceptions/
│   │   │   │   └── types/
│   │   │   │
│   │   │   ├── infrastructure/
│   │   │   │   ├── database/
│   │   │   │   ├── redis/
│   │   │   │   ├── kafka/
│   │   │   │   ├── outbox/
│   │   │   │   ├── inbox/
│   │   │   │   ├── object-storage/
│   │   │   │   ├── search/
│   │   │   │   └── observability/
│   │   │   │
│   │   │   └── modules/
│   │   │       │
│   │   │       ├── identity/
│   │   │       │   ├── authentication/
│   │   │       │   │   ├── local-auth/
│   │   │       │   │   ├── federation/
│   │   │       │   │   ├── oauth/
│   │   │       │   │   └── auth-resolver/
│   │   │       │   │
│   │   │       │   ├── principal/
│   │   │       │   ├── external-identity/
│   │   │       │   ├── credentials/
│   │   │       │   ├── email-verification/
│   │   │       │   ├── password-recovery/
│   │   │       │   ├── mfa/
│   │   │       │   ├── step-up/
│   │   │       │   ├── sessions/
│   │   │       │   ├── invitations/
│   │   │       │   ├── policy-acceptance/
│   │   │       │   ├── controllers/
│   │   │       │   ├── dto/
│   │   │       │   ├── repositories/
│   │   │       │   └── events/
│   │   │       │
│   │   │       ├── authorization/
│   │   │       │   ├── permissions/
│   │   │       │   ├── roles/
│   │   │       │   ├── memberships/
│   │   │       │   ├── relationships/
│   │   │       │   ├── policy/
│   │   │       │   ├── guards/
│   │   │       │   ├── decisions/
│   │   │       │   ├── elevation/
│   │   │       │   └── delegation/
│   │   │       │
│   │   │       ├── tenant/
│   │   │       │   ├── tenant/
│   │   │       │   ├── organization/
│   │   │       │   ├── legal-entity/
│   │   │       │   ├── business-unit/
│   │   │       │   ├── environment/
│   │   │       │   ├── workspace/
│   │   │       │   ├── onboarding/
│   │   │       │   ├── residency/
│   │   │       │   ├── isolation/
│   │   │       │   ├── lifecycle/
│   │   │       │   └── controllers/
│   │   │       │
│   │   │       ├── commercial/
│   │   │       │   ├── catalog/
│   │   │       │   ├── product/
│   │   │       │   ├── subscription/
│   │   │       │   ├── entitlement/
│   │   │       │   ├── metering/
│   │   │       │   ├── usage/
│   │   │       │   └── service-obligation/
│   │   │       │
│   │   │       ├── security-context/
│   │   │       │   ├── assets/
│   │   │       │   │   ├── asset.service.ts
│   │   │       │   │   ├── asset-resolution.service.ts
│   │   │       │   │   ├── asset.repository.ts
│   │   │       │   │   └── asset.types.ts
│   │   │       │   │
│   │   │       │   ├── identities/
│   │   │       │   │   ├── identity-entity.service.ts
│   │   │       │   │   ├── identity-resolution.service.ts
│   │   │       │   │   ├── identity.repository.ts
│   │   │       │   │   └── identity.types.ts
│   │   │       │   │
│   │   │       │   ├── aliases/
│   │   │       │   ├── relationships/
│   │   │       │   ├── vulnerabilities/
│   │   │       │   ├── exposures/
│   │   │       │   ├── business-services/
│   │   │       │   ├── data-assets/
│   │   │       │   └── context-snapshots/
│   │   │       │
│   │   │       ├── detection/
│   │   │       │   ├── definitions/
│   │   │       │   ├── versions/
│   │   │       │   ├── registry/
│   │   │       │   ├── runtime/
│   │   │       │   ├── enrichment/
│   │   │       │   ├── evaluation/
│   │   │       │   ├── correlation/
│   │   │       │   ├── replay/
│   │   │       │   ├── suppression/
│   │   │       │   ├── rules/
│   │   │       │   │   └── suspicious-login/
│   │   │       │   └── consumers/
│   │   │       │
│   │   │       ├── alert/
│   │   │       │   ├── controllers/
│   │   │       │   ├── services/
│   │   │       │   ├── repositories/
│   │   │       │   ├── consumers/
│   │   │       │   ├── assignment/
│   │   │       │   ├── suppression/
│   │   │       │   ├── state-machine/
│   │   │       │   ├── events/
│   │   │       │   └── tests/
│   │   │       │
│   │   │       ├── case-management/
│   │   │       │   ├── controllers/
│   │   │       │   ├── services/
│   │   │       │   ├── repositories/
│   │   │       │   ├── state-machine/
│   │   │       │   ├── assignment/
│   │   │       │   ├── timeline/
│   │   │       │   ├── notes/
│   │   │       │   ├── hypotheses/
│   │   │       │   ├── decisions/
│   │   │       │   ├── communications/
│   │   │       │   ├── events/
│   │   │       │   └── tests/
│   │   │       │
│   │   │       ├── incident/
│   │   │       │   ├── declaration/
│   │   │       │   ├── lifecycle/
│   │   │       │   ├── chronology/
│   │   │       │   ├── impact/
│   │   │       │   └── post-incident-review/
│   │   │       │
│   │   │       ├── playbook/
│   │   │       │   ├── definitions/
│   │   │       │   ├── versions/
│   │   │       │   ├── simulation/
│   │   │       │   └── runs/
│   │   │       │
│   │   │       ├── evidence/
│   │   │       │   ├── records/
│   │   │       │   ├── collection/
│   │   │       │   ├── hashing/
│   │   │       │   ├── canonicalization/
│   │   │       │   ├── lineage/
│   │   │       │   ├── completeness/
│   │   │       │   ├── freshness/
│   │   │       │   ├── ledger/
│   │   │       │   ├── vault/
│   │   │       │   ├── verification/
│   │   │       │   ├── retention/
│   │   │       │   ├── legal-hold/
│   │   │       │   └── events/
│   │   │       │
│   │   │       ├── controls/
│   │   │       │   ├── frameworks/
│   │   │       │   ├── obligations/
│   │   │       │   ├── objectives/
│   │   │       │   ├── implementations/
│   │   │       │   ├── tests/
│   │   │       │   └── mappings/
│   │   │       │
│   │   │       ├── assessments/
│   │   │       │   ├── evaluators/
│   │   │       │   ├── runs/
│   │   │       │   └── results/
│   │   │       │
│   │   │       ├── risk/
│   │   │       │   ├── risks/
│   │   │       │   ├── factors/
│   │   │       │   ├── treatments/
│   │   │       │   ├── acceptances/
│   │   │       │   └── exceptions/
│   │   │       │
│   │   │       ├── audit-package/
│   │   │       │   ├── builder/
│   │   │       │   ├── manifest/
│   │   │       │   ├── freeze/
│   │   │       │   ├── verification/
│   │   │       │   └── export/
│   │   │       │
│   │   │       ├── reporting/
│   │   │       │   ├── operational/
│   │   │       │   ├── executive/
│   │   │       │   └── snapshots/
│   │   │       │
│   │   │       ├── notification/
│   │   │       │   ├── notification.service.ts
│   │   │       │   ├── channels/
│   │   │       │   ├── preferences/
│   │   │       │   └── acknowledgement/
│   │   │       │
│   │   │       └── audit/
│   │   │           ├── audit-event.service.ts
│   │   │           ├── audit.repository.ts
│   │   │           └── audit.types.ts
│   │   │
│   │   └── test/
│   │       ├── integration/
│   │       ├── e2e/
│   │       ├── tenant-isolation/
│   │       └── fixtures/
│   │
│   │
│   ├── shield-ingest/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │
│   │   │   ├── connectors/
│   │   │   │   ├── core/
│   │   │   │   │   ├── connector.interface.ts
│   │   │   │   │   ├── connector.types.ts
│   │   │   │   │   ├── connector-context.ts
│   │   │   │   │   ├── connector-errors.ts
│   │   │   │   │   └── connector-registry.ts
│   │   │   │   │
│   │   │   │   ├── services/
│   │   │   │   │   ├── connector.service.ts
│   │   │   │   │   ├── credential.service.ts
│   │   │   │   │   ├── permission.service.ts
│   │   │   │   │   ├── checkpoint.service.ts
│   │   │   │   │   ├── sync.service.ts
│   │   │   │   │   └── health.service.ts
│   │   │   │   │
│   │   │   │   └── providers/
│   │   │   │       ├── microsoft-entra/
│   │   │   │       │   ├── entra.connector.ts
│   │   │   │       │   ├── entra.auth.ts
│   │   │   │       │   ├── entra.graph-client.ts
│   │   │   │       │   ├── entra.permissions.ts
│   │   │   │       │   ├── entra.user-sync.ts
│   │   │   │       │   ├── entra.signin-sync.ts
│   │   │   │       │   ├── entra.normalizer.ts
│   │   │   │       │   ├── entra.health.ts
│   │   │   │       │   └── tests/
│   │   │   │       │
│   │   │   │       ├── github/
│   │   │   │       ├── aws/
│   │   │   │       ├── google-workspace/
│   │   │   │       ├── crowdstrike/
│   │   │   │       ├── jira/
│   │   │   │       └── servicenow/
│   │   │   │
│   │   │   ├── connector-registry/
│   │   │   ├── connector-runtime/
│   │   │   ├── connector-health/
│   │   │   │
│   │   │   ├── ingestion-gateway/
│   │   │   │   ├── controllers/
│   │   │   │   ├── authentication/
│   │   │   │   ├── rate-limit/
│   │   │   │   └── validation/
│   │   │   │
│   │   │   ├── raw-event-vault/
│   │   │   │   ├── raw-event.service.ts
│   │   │   │   ├── payload-storage.service.ts
│   │   │   │   └── hashing.service.ts
│   │   │   │
│   │   │   ├── schema-registry/
│   │   │   │
│   │   │   ├── deduplication/
│   │   │   │
│   │   │   ├── normalization/
│   │   │   │   ├── normalizer.interface.ts
│   │   │   │   ├── normalization.service.ts
│   │   │   │   └── schema-validation.service.ts
│   │   │   │
│   │   │   ├── quarantine/
│   │   │   │
│   │   │   ├── replay/
│   │   │   │
│   │   │   ├── residency-routing/
│   │   │   │
│   │   │   ├── stream-publisher/
│   │   │   │
│   │   │   ├── workers/
│   │   │   │   ├── connector-sync.worker.ts
│   │   │   │   ├── normalization.worker.ts
│   │   │   │   └── replay.worker.ts
│   │   │   │
│   │   │   └── observability/
│   │   │
│   │   └── test/
│   │       ├── connectors/
│   │       ├── ingestion/
│   │       ├── replay/
│   │       ├── resilience/
│   │       └── tenant-isolation/
│   │
│   │
│   ├── shield-ai/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── gateway/
│   │   │   │   ├── ai-gateway.service.ts
│   │   │   │   ├── routing/
│   │   │   │   ├── policy/
│   │   │   │   └── fallback/
│   │   │   │
│   │   │   ├── providers/
│   │   │   │
│   │   │   ├── model-registry/
│   │   │   ├── provider-registry/
│   │   │   ├── prompt-registry/
│   │   │   ├── agent-registry/
│   │   │   │
│   │   │   ├── retrieval/
│   │   │   │   ├── retrieval-broker/
│   │   │   │   ├── acl/
│   │   │   │   ├── provenance/
│   │   │   │   └── pgvector/
│   │   │   │
│   │   │   ├── tools/
│   │   │   │   ├── tool-broker/
│   │   │   │   ├── allowlist/
│   │   │   │   └── authorization/
│   │   │   │
│   │   │   ├── redaction/
│   │   │   ├── memory-policy/
│   │   │   ├── evaluation/
│   │   │   ├── usage-control/
│   │   │   ├── incident/
│   │   │   └── observability/
│   │   │
│   │   └── test/
│   │       ├── prompt-injection/
│   │       ├── tenant-isolation/
│   │       ├── evaluation/
│   │       └── fallback/
│   │
│   │
│   ├── shield-action/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── proposals/
│   │   │   ├── policy/
│   │   │   ├── approval/
│   │   │   ├── credential-exchange/
│   │   │   ├── command-signing/
│   │   │   ├── rate-control/
│   │   │   ├── dispatcher/
│   │   │   │   └── providers/
│   │   │   │       ├── microsoft-entra/
│   │   │   │       ├── crowdstrike/
│   │   │   │       └── aws/
│   │   │   │
│   │   │   ├── receipt-verification/
│   │   │   ├── reconciliation/
│   │   │   ├── rollback/
│   │   │   ├── simulation/
│   │   │   ├── freeze-controller/
│   │   │   └── observability/
│   │   │
│   │   └── test/
│   │       ├── authorization/
│   │       ├── replay/
│   │       ├── rate-limit/
│   │       └── rollback/
│   │
│   │
│   └── shield-anchor/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   │
│       │   ├── tenant-chain-head/
│       │   ├── checkpoint-builder/
│       │   ├── merkle/
│       │   ├── signing/
│       │   ├── key-management/
│       │   ├── witnesses/
│       │   ├── anti-equivocation/
│       │   ├── verification-receipts/
│       │   └── observability/
│       │
│       └── test/
│           ├── merkle/
│           ├── signing/
│           ├── witnesses/
│           └── tamper/
│
│
├── packages/
│   │
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── events/
│   │   │   ├── commands/
│   │   │   ├── schemas/
│   │   │   └── enums/
│   │   └── package.json
│   │
│   ├── event-envelope/
│   │   ├── src/
│   │   │   ├── event-envelope.ts
│   │   │   ├── event-builder.ts
│   │   │   └── event-validator.ts
│   │   └── package.json
│   │
│   ├── auth-context/
│   │   ├── src/
│   │   │   ├── auth-context.ts
│   │   │   ├── principal-context.ts
│   │   │   └── tenant-context.ts
│   │   └── package.json
│   │
│   ├── authorization-sdk/
│   │   ├── src/
│   │   │   ├── authorize.ts
│   │   │   ├── actions.ts
│   │   │   └── decision.types.ts
│   │   └── package.json
│   │
│   ├── database/
│   │   ├── src/
│   │   │   ├── prisma.service.ts
│   │   │   ├── transaction.ts
│   │   │   └── database.types.ts
│   │   └── package.json
│   │
│   ├── evidence-sdk/
│   │   ├── src/
│   │   │   ├── evidence-client.ts
│   │   │   ├── evidence.types.ts
│   │   │   └── evidence-context.ts
│   │   └── package.json
│   │
│   ├── kafka/
│   │   ├── src/
│   │   │   ├── producer.ts
│   │   │   ├── consumer.ts
│   │   │   ├── retry.ts
│   │   │   └── topics.ts
│   │   └── package.json
│   │
│   ├── observability/
│   │   ├── src/
│   │   │   ├── logging/
│   │   │   ├── tracing/
│   │   │   ├── metrics/
│   │   │   └── correlation/
│   │   └── package.json
│   │
│   ├── validation/
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   └── validators/
│   │   └── package.json
│   │
│   ├── security/
│   │   ├── src/
│   │   │   ├── hashing/
│   │   │   ├── crypto/
│   │   │   ├── redaction/
│   │   │   └── constant-time/
│   │   └── package.json
│   │
│   ├── storage/
│   │   ├── src/
│   │   │   ├── object-storage.interface.ts
│   │   │   ├── minio.adapter.ts
│   │   │   └── storage.types.ts
│   │   └── package.json
│   │
│   └── test-utils/
│       ├── src/
│       │   ├── factories/
│       │   ├── fixtures/
│       │   ├── synthetic-tenant/
│       │   └── helpers/
│       └── package.json
│
│
├── prisma/
│   ├── schema.prisma
│   │
│   ├── schemas/
│   │   ├── identity.prisma
│   │   ├── authorization.prisma
│   │   ├── tenant.prisma
│   │   ├── commercial.prisma
│   │   ├── security-context.prisma
│   │   ├── detection.prisma
│   │   ├── alert.prisma
│   │   ├── case-management.prisma
│   │   ├── evidence.prisma
│   │   ├── controls.prisma
│   │   ├── risk.prisma
│   │   ├── audit.prisma
│   │   └── operations.prisma
│   │
│   ├── migrations/
│   └── seed.ts
│
│
├── infrastructure/
│   │
│   ├── docker/
│   │   ├── shield-core.Dockerfile
│   │   ├── shield-ingest.Dockerfile
│   │   ├── shield-ai.Dockerfile
│   │   ├── shield-action.Dockerfile
│   │   └── shield-anchor.Dockerfile
│   │
│   ├── compose/
│   │   ├── docker-compose.yml
│   │   └── docker-compose.dev.yml
│   │
│   ├── kubernetes/
│   │   ├── base/
│   │   ├── dev/
│   │   ├── staging/
│   │   └── production/
│   │
│   ├── terraform/
│   │   ├── modules/
│   │   └── environments/
│   │
│   ├── kafka/
│   │   ├── topics/
│   │   └── schemas/
│   │
│   ├── opensearch/
│   │   ├── mappings/
│   │   └── templates/
│   │
│   ├── minio/
│   │
│   └── monitoring/
│       ├── prometheus/
│       ├── grafana/
│       └── otel/
│
│
├── scripts/
│   ├── dev/
│   ├── database/
│   ├── kafka/
│   ├── seed/
│   ├── migration/
│   └── testing/
│
├── docs/
│   ├── adr/
│   ├── api/
│   ├── events/
│   ├── architecture/
│   └── runbooks/
│
├── tests/
│   ├── architecture/
│   ├── cross-tenant/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── replay/
│   ├── resilience/
│   └── security/
│
├── .github/
│   └── workflows/
│
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md