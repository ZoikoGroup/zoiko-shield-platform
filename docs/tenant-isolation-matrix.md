# ZoikoShield Store-by-Store Tenant Isolation Matrix

In accordance with **Section 6 (Identity, Authorization, Tenancy & Residency)** and **Section 10 (Platform Security Baseline)** of the ZoikoShield Controlled Backend Engineering Guide, every data-store layer must enforce explicit, testable, and non-bypassable tenant isolation boundaries.

## Store-by-Store Isolation Architecture

| Store Layer | Technology | Isolation & Partition Pattern | Access Enforcement Mechanism | Cryptographic & Encryption Boundary |
| :--- | :--- | :--- | :--- | :--- |
| **Relational Authority** | PostgreSQL / AlloyDB | Schema namespaces + mandatory `tenant_id` column on all pooled tables with compound primary/unique indexes `(tenant_id, id)`. | Row-Level Security (RLS) policies + Prisma query middleware / parameterized SQL filters in query plan. | Column-level and tablespace encryption with Cloud KMS tenant-scoped customer-managed encryption keys (CMEK). |
| **Security Events / Backbone** | Apache Kafka (Managed Service) | Canonical topic naming convention: `zs.{region}.{env}.{domain}.v1` with message key strictly partitioned by `tenant_id:entity_key`. | Consumers and stream processors enforce tenant partition keys before processing; dead-letter isolation per tenant. | Payloads serialized with authenticated canonical envelope and tenant integrity hash. |
| **Hot Analytics** | ClickHouse Cloud / BYOC | Partitioning strategy: `PARTITION BY (tenant_id, toYYYYMM(event_time))` and `ORDER BY (tenant_id, event_time, class_name, event_id)`. | All analytical queries are parameterized with mandatory `tenant_id = ?` query plan constraints; no ad-hoc LLM queries. | Private Service Connect (PSC) network isolation with regional storage encryption. |
| **Evidence Vault & Raw Lake** | Google Cloud Storage (GCS) | Dedicated evidence buckets with tenant-prefixed object keys: `gs://{cell}-evidence/{tenant_id}/{year}/{month}/{evidence_id}.json`. | Cloud Storage IAM + Object Retention Lock / Bucket Lock with WORM retention classes per compliance scope. | Tenant-scoped CMEK encryption; cross-region bucket movement prohibited by policy. |
| **AI Retrieval & Vector Index** | AlloyDB Vector Search / PGVector | Partitioned vector embeddings filtered by mandatory `tenant_id` and `data_class` metadata. | Retrieval queries bind tenant namespace before similarity search; cross-tenant similarity traversal is mathematically impossible. | Tenant embedding namespaces isolated from global control plane. |
| **Observability & Telemetry** | Cloud Logging / Managed Prometheus | Log entries pseudonymized; telemetry attributes include `tenant_id_hash` and opaque identifiers only. | Telemetry filter pipelines strip raw customer payloads from general log streams. | OTLP exporter binds regional cell attributes. |

## Mandatory Tenant Isolation Invariants
1. **No Cross-Tenant Queries**: Cross-tenant joins in operational databases build-break CI unless accompanied by an approved Architecture Decision Record (ADR) and dedicated aggregate model.
2. **Query Plan Enforcement**: Tenant filters must be enforced within the database query execution plan, never filtered in-memory after fetching unbounded result sets.
3. **Quarantined Routing**: Unmatched or misrouted tenant telemetry enters an isolated quarantine state rather than falling back to a shared/global pool.
4. **Independent Failure Domains**: Batch processing and stream processing workers checkpoint by tenant, preventing one tenant's backlog from corrupting or delaying another tenant's processing.
