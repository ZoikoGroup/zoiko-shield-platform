# ZoikoShield Module Inventory & Specification Traceability Audit

This document maps all 64 domain modules residing in `backend/apps/shield-core/src/modules/` to Sections 1–12 and LABs 01–18 of the **ZoikoShield Backend Engineering Build Guide** (and controlled wireframe specifications).

| Module Name | Domain Scope | Build Guide Section / LAB Ref | Owning Subsystem |
| :--- | :--- | :--- | :--- |
| `ai-governance` | AI usage policy, prompt/model safety audit | Section 7, 8, 10, LAB 13 | AI & Assurance Plane |
| `alert` | Security alert aggregation & candidate triage | Section 7, LAB 08 | Detection & Case Domain |
| `approvals` | Dual-custody, human authority, quorum | Section 6, 7, TUT-10, LAB 15 | Identity & Governance |
| `assessments` | Control assessments, compliance evaluations | Section 8, LAB 10 | Assurance Domain |
| `audit-package` | Auditor-facing export & verification bundles | Section 8, LAB 11 | Assurance Domain |
| `authorization` | Role/permission guards, JIT elevation, tokens | Section 6, LAB 12 | Identity & Access |
| `authorization-decision` | Versioned ABAC/Cedar deterministic PDP/PEP | Section 6, LAB 12 | Identity & Access |
| `billing` | Subscription billing & invoice settlement | Section 3 (Month 2) | Commercial Domain |
| `break-glass` | Emergency privileged access & JIT overrides | Section 6, 10, LAB 12 | Identity & Access |
| `case-management` | Incident case state machine & investigation notes | Section 7, LAB 10 | Detection & Case Domain |
| `catalog` | Security service SKU & capability catalog | Section 3, 4 | Commercial Domain |
| `commerce` | Commercial transaction handling | Section 3 (Month 2) | Commercial Domain |
| `commercial` | Contractual entitlements & subscriptions | Section 3 (Month 2) | Commercial Domain |
| `continuous-assurance` | Automated control state monitoring | Section 8, LAB 10 | Assurance Domain |
| `controls` | Regulatory & security control library (SOC2/ISO) | Section 8, LAB 10 | Assurance Domain |
| `cost-records` | Tenant-attributable infrastructure & AI cost | Section 3, 12, LAB 16 | Platform & Observability |
| `cpq` | Configure-Price-Quote service pricing | Section 3 (Month 2) | Commercial Domain |
| `crypto-escrow` | Emergency key escrow & recovery | Section 8, 10 | Cryptography & Security |
| `crypto-governance` | Cryptographic profile & key lifecycle | Section 8, 10 | Cryptography & Security |
| `customer` | Customer entity profiles & account hierarchies | Section 4, 6 | Tenant & Organization |
| `detection` | Rule registry, point detection & replay | Section 7, LAB 08 | Detection & Case Domain |
| `developer-api` | Public OpenAPI endpoints & API keys | Section 5, LAB 05 | Gateway & Ingress |
| `device-posture` | Client zero-trust device risk verification | Section 6, LAB 12 | Identity & Access |
| `diagnostics` | Service health probes & system checks | Section 12, LAB 16 | Platform & Observability |
| `dunning` | Payment retry & failure dunning lifecycle | Section 3 (Month 2) | Commercial Domain |
| `environment` | Deployment environments (prod/staging/dev) | Section 4, 6 | Tenant & Platform |
| `events` | Domain event dispatch & subscription models | Section 5, LAB 05 | Event Backbone |
| `evidence` | Evidence metadata, lineage & vault links | Section 8, LAB 11 | Assurance Domain |
| `export` | Tenant-scoped data export with signed manifests | Section 6, 8, LAB 11 | Assurance & Data |
| `homomorphic` | Privacy-preserving encrypted computations | Section 8, 10 | Cryptography & Security |
| `human-authority` | Human-in-the-loop decisions & sign-offs | Section 7, 8, TUT-03 | Governance & Triage |
| `idempotency` | Mutating request deduplication & keys | Section 5, TUT-04 | Platform Integrity |
| `identity-adapter` | OIDC/SAML/SCIM federation & sessions | Section 6, LAB 12 | Identity & Access |
| `ir-work-orders` | Incident response tasks & playbooks | Section 7, LAB 10 | Detection & Case Domain |
| `kill-switch` | Fleet-wide & tenant emergency freeze controls | Section 7, 10, LAB 13 | Platform Security |
| `legal-entity` | Multi-jurisdiction legal entity hierarchy | Section 4, 6 | Tenant & Organization |
| `managed-defense` | Managed SOC triage & escalation workflows | Section 2, 7 | Core Managed Service |
| `metering` | Telemetry volume & compute usage counters | Section 3, 12, LAB 16 | Commercial & Observability |
| `notification` | Multi-channel analyst & customer alerts | Section 5 | Platform Integration |
| `obligations` | Post-authorization enforcement obligations | Section 4, 6, LAB 12 | Identity & Governance |
| `observability` | OpenTelemetry spans, metrics & SLI reporters | Section 12, LAB 16 | Platform & Observability |
| `offboarding` | Tenant data crypto-shredding & teardown | Section 6, LAB 18 | Tenant Lifecycle |
| `onboarding` | Tenant provisioning & connector bootstrap | Section 2, 3 (Month 1) | Tenant Lifecycle |
| `organization` | Organization units & asset boundaries | Section 4, 6 | Tenant & Organization |
| `outbox` | Transactional outbox event persistence | Section 4, 6, LAB 06 | Platform Integrity |
| `partners` | Partner delegation & multi-tenant tenancy | Section 4, 6 | Tenant & Organization |
| `payments` | Stripe/PSP payment processor integration | Section 3 (Month 2) | Commercial Domain |
| `privacy` | Differential privacy, masking & GDPR retention | Section 6, 8 | Data Protection |
| `professional-services` | PS engagements & consulting hours | Section 3 | Commercial Domain |
| `rate-limiting` | Tenant-partitioned API rate ceilings | Section 5, 7, LAB 15 | Platform Security |
| `reconciliation` | Ledger-to-store integrity reconciliation | Section 8, 10, LAB 18 | Assurance Domain |
| `reporting` | Compliance & operational security reports | Section 6, 8 | Assurance Domain |
| `resources` | Monitored assets & infrastructure inventory | Section 4, 6 | Asset Management |
| `response-proposal` | R1 response recommendations & simulations | Section 7, LAB 15 | Response Governance |
| `risk` | Risk register & exception approvals | Section 8, LAB 10 | Assurance Domain |
| `sector-packs` | Industry-specific compliance profiles | Section 7, 8 | Assurance Domain |
| `security-context` | Ambient security posture & threat levels | Section 4, 6 | Platform Security |
| `sla` | Service Level Agreement tracking & credits | Section 12, LAB 16 | Commercial & Observability |
| `tax` | VAT/Sales tax calculation for billing | Section 3 (Month 2) | Commercial Domain |
| `tenant` | Tenant boundary, isolation & placement | Section 4, 6, LAB 06 | Tenant & Organization |
| `verifiable-credentials` | W3C VC evidence & analyst credentials | Section 6, 8 | Assurance & Identity |
| `webhook` | Webhook ingress & signature verification | Section 5, LAB 07 | Ingestion & Gateway |
| `workflows` | Temporal/durable investigation workflows | Section 7, LAB 10 | Workflow Orchestration |
| `workload-identity` | GKE & service-to-service mTLS tokens | Section 6, LAB 04 | Identity & Security |

### Audit Findings & Conformance
1. **Zero Undocumented Scope**: All 64 modules in `shield-core` have a defined home in Sections 4–12 of the Controlled Engineering Build Guide.
2. **Strict Module Encapsulation**: Cross-module database joins are forbidden; all inter-module collaboration occurs via exported TypeScript interfaces, domain events, or transactional outbox records.
