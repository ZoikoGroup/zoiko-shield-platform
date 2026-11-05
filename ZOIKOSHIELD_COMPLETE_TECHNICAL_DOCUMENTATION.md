# ZOIKOSHIELD PLATFORM: COMPLETE TECHNICAL DOCUMENTATION & ARCHITECTURE SPECIFICATION

**Document Version:** 3.0 • Production & Evaluation Master Specification  
**Classification:** Enterprise Engineering Documentation  
**Repository Branch:** `Aditya`  
**Platform Scope:** Next.js 15 App Router Frontend + NestJS Multi-Schema Microservices Core + RFC 6962 / ML-DSA-65 Merkle Evidence Ledger  

---

## TABLE OF CONTENTS

1. [Executive Overview & Platform Philosophy](#1-executive-overview--platform-philosophy)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
   - 2.1 [Repository Structure & Codebase Topology](#21-repository-structure--codebase-topology)
   - 2.2 [Frontend Architecture (`frontend/`)](#22-frontend-architecture-frontend)
   - 2.3 [Backend Architecture (`backend/`) & Microservices Topology](#23-backend-architecture-backend--microservices-topology)
   - 2.4 [Database Architecture & Multi-Schema PostgreSQL Engine](#24-database-architecture--multi-schema-postgresql-engine)
3. [End-to-End User Journey: Stage 1 to Stage 8](#3-end-to-end-user-journey-stage-1-to-stage-8)
   - 3.1 [Stage 1 — Initial Application Access & Environment Bootstrap](#31-stage-1--initial-application-access--environment-bootstrap)
   - 3.2 [Stage 2 — Login, Multi-Factor Authentication & Identity Resolution](#32-stage-2--login-multi-factor-authentication--identity-resolution)
   - 3.3 [Stage 3 — Organization Registration & Evaluation Tenant Provisioning](#33-stage-3--organization-registration--evaluation-tenant-provisioning)
   - 3.4 [Stage 4 — Complete Audit of All 3 Customer Dashboards & 14 Sidebar Sections](#34-stage-4--complete-audit-of-all-3-customer-dashboards--14-sidebar-sections)
   - 3.5 [Stage 5 — Comprehensive Deep-Dive into Every Functional Module](#35-stage-5--comprehensive-deep-dive-into-every-functional-module)
   - 3.6 [Stage 6 — Notification Lifecycle, Email Templates & Dispatch Delivery](#36-stage-6--notification-lifecycle-email-templates--dispatch-delivery)
   - 3.7 [Stage 7 — Reports, Analytics, Forensic Audits & Export Pipelines](#37-stage-7--reports-analytics-forensic-audits--export-pipelines)
   - 3.8 [Stage 8 — Settings, Administration, Identity & Platform Governance](#38-stage-8--settings-administration-identity--platform-governance)
4. [Complete Frontend-to-Backend Communication Chain](#4-complete-frontend-to-backend-communication-chain)
5. [Database Schema, Table Ownership & Tenant Isolation Model](#5-database-schema-table-ownership--tenant-isolation-model)
6. [Role-Based Access Control (RBAC) & Tenant Permission Matrix](#6-role-based-access-control-rbac--tenant-permission-matrix)
7. [Comprehensive User Input & Field Validation Reference](#7-comprehensive-user-input--field-validation-reference)
8. [API & Swagger Specification Audit](#8-api--swagger-specification-audit)
9. [Architecture Decision Records & Business Rationale](#9-architecture-decision-records--business-rationale)
10. [Known Issues, Fallback Behaviors & Implementation Status](#10-known-issues-fallback-behaviors--implementation-status)

---

## 1. EXECUTIVE OVERVIEW & PLATFORM PHILOSOPHY

### 1.1 What is ZoikoShield?
**ZoikoShield** is a sovereign-grade, multi-tenant Cyber Defense, AI Security Copilot, Autonomous SOAR, and Cryptographic Evidence Assurance platform designed for high-assurance enterprises, government institutions, financial organizations, and managed security service providers (MSSPs).

Unlike legacy SIEM/SOAR appliances that rely on black-box heuristics and disconnected dashboards, ZoikoShield enforces a strict invariant across the entire system:
> **The Core Invariant:** *No AI investigation, security alert, compliance assertion, or autonomous containment action is represented as valid without tenant-scoped, attributable, cryptographically anchored evidence.*

### 1.2 The 4 Pillars of ZoikoShield
1. **Continuous Real-Time Telemetry & OCSF v1.1 Ingestion:** Normalizes raw events from AWS CloudTrail, Google Cloud Audit, Microsoft Azure Event Hubs, Okta, and CrowdStrike into Open Cybersecurity Schema Framework (OCSF) v1.1 events with HMAC-SHA256 signature verification and replay prevention.
2. **Governed AI Security Copilot:** Employs a hardened, multi-tier LLM pipeline with pre-execution Prompt Sanitization (Model Armor), grounded citation verification, and Spec §16.1 10-Field Decision Review Envelopes to prevent hallucinated remediations.
3. **Autonomous SOAR with Human Authority Gates (R0–R4):** Executes response playbooks partitioned into five distinct authority tiers, requiring multi-party cryptographic approvals (4-eyes quorum) for destructive actions (e.g., host isolation, firewall drops).
4. **Post-Quantum Cryptographic Merkle Ledger (RFC 6962 + ML-DSA-65):** Anchors all operational decisions, audit certificates, and forensic evidence into an immutable Merkle tree with dual Ed25519 and Post-Quantum ML-DSA-65 cryptographic signatures and RFC 3161 timestamps.

---

## 2. END-TO-END SYSTEM ARCHITECTURE

```mermaid
flowchart TD
    subgraph Browser ["Frontend Client (Next.js 15 App Router - Port :3000)"]
        UI["React 19 Components / Workspaces"]
        API_CLIENT["ZoikoShieldApiClient (lib/api-client.ts)"]
        API_PROXY["Resilient API Proxy (/api/v1/[...slug]/route.ts)"]
        VERIFIER["WebCrypto Merkle Verifier (lib/forensic-verifier.ts)"]
        UI --> API_CLIENT
        API_CLIENT --> API_PROXY
        UI --> VERIFIER
    end

    subgraph BackendSpine ["Backend Microservices Ecosystem (NestJS Monorepo)"]
        CORE["shield-core (:3001)\nAuth, RBAC, Cedar, Cases, Alerts, Notifications"]
        INGEST["shield-ingest (:3002)\nOCSF v1.1 Ingestion, Tier-A Detections, Rate Limiter"]
        AI["shield-ai (:3003)\nCopilot Engine, Model Armor, Attack Path Synthesis"]
        ACTION["shield-action (:3004)\nSOAR Playbooks, R0-R4 Containment, Blast Radius"]
        ANCHOR["shield-anchor (:3005)\nRFC 6962 Merkle Ledger, ML-DSA-65 Post-Quantum Witness"]
        CLI["verifier-cli\nAir-Gapped Audit Package Verifier"]
    end

    subgraph StorageEngine ["Persistent Data Engine"]
        PG[("PostgreSQL 16 (Multi-Schema + RLS)\n49 Schemas: identity, tenant, alert, case...")]
        CH[("ClickHouse\nHigh-Throughput Raw Telemetry Store")]
        REDIS[("Redis Cache\nSession Tokens, Rate Limiters, Nonces")]
        S3[("S3 Object Lock / WORM\nImmutable Evidence Archives")]
    end

    API_PROXY --> CORE
    API_PROXY --> INGEST
    API_PROXY --> AI
    API_PROXY --> ACTION
    API_PROXY --> ANCHOR

    CORE --> PG
    CORE --> REDIS
    INGEST --> CH
    INGEST --> REDIS
    ACTION --> PG
    ANCHOR --> PG
    ANCHOR --> S3
```

### 2.1 Repository Structure & Codebase Topology

The repository is organized as a unified, enterprise monorepo:
```
zoiko-shield-platform/
├── frontend/                               # Next.js 15 App Router Frontend
│   ├── src/
│   │   ├── app/                            # Route pages & API routes
│   │   │   ├── (public)/                   # /login, /register, /trust, /verify-certificate, /help
│   │   │   ├── customer/                   # /customer/dashboard & 14 /customer/[section] views
│   │   │   ├── admin/                      # /admin, /admin/platform-health, /admin/g1-gate, /admin/tenant
│   │   │   ├── auditor/                    # /auditor compliance cockpit
│   │   │   ├── alerts/, cases/, copilot/   # Core SOC investigation workflows
│   │   │   └── api/v1/[...slug]/route.ts   # Multi-service proxy & offline fallback engine
│   │   ├── components/                     # Reusable UI widgets & domain workspaces
│   │   │   ├── customer/                   # Customer dashboard views, headers, and sidebars
│   │   │   └── layout/                     # Operator AppShell, TopHeader, Sidebar
│   │   ├── lib/                            # API client, types, demo-state, forensic verifiers
│   │   └── __tests__/                      # 20 Vitest suites (149/149 tests passing)
│   ├── package.json
│   └── vitest.config.mts
├── backend/                                # NestJS Multi-Schema Microservices Ecosystem
│   ├── apps/
│   │   ├── shield-core/                    # Port :3001 - Identity, Cedar, Cases, Alerts, SMTP
│   │   ├── shield-ingest/                  # Port :3002 - OCSF Telemetry, Tier-A Detectors, DLQ
│   │   ├── shield-ai/                      # Port :3003 - Governed AI Copilot, Model Armor
│   │   ├── shield-action/                  # Port :3004 - SOAR R0-R4 Containment Engine
│   │   ├── shield-anchor/                  # Port :3005 - RFC 6962 Merkle Ledger, ML-DSA-65
│   │   └── verifier-cli/                   # Standalone Air-Gapped Audit Verifier Binary
│   ├── prisma/                             # Multi-schema Prisma 7.9.1 engine
│   │   ├── schema.prisma                   # Master datasource configuration
│   │   └── schemas/                        # 49 domain schemas (core, ingest, tenant, identity...)
│   ├── scripts/                            # Linters, migration tools, and seed harnesses
│   └── package.json
└── docs/                                   # Architecture blueprints & compliance registers
```

### 2.2 Frontend Architecture (`frontend/`)

- **Next.js 15 App Router & React 19:** Utilizes React Server Components where appropriate and `"use client"` interactive cockpits for real-time SOC operations.
- **Resilient API Proxy ([`frontend/src/app/api/v1/[...slug]/route.ts`](frontend/src/app/api/v1/[...slug]/route.ts)):**
  - Forwards frontend calls to backend microservices based on route prefixes (`auth/`, `alerts/`, `cases/`, `ai/`, `actions/`, `anchor/`).
  - Implements **Hop-by-Hop Header Stripping** (`transfer-encoding`, `keep-alive`, etc.) and sets `x-zoiko-fallback: true` when answering with offline fallback responses.
  - Implements strict **Zero Mock Data Policy** in live browser runtime (`process.env.NODE_ENV !== "test"`), preventing fabricated alerts, false percentages, or hardcoded statistics when databases are empty.
- **Client State & API Client ([`frontend/src/lib/api-client.ts`](frontend/src/lib/api-client.ts)):**
  - Manages session lifecycle, automatic Bearer JWT header injection, tenant header propagation (`x-tenant-id`), and environment isolation (`x-environment-id`).
  - Stores offline registered credentials safely in encrypted client cookie `zoiko_offline_accounts` and `localStorage` to survive serverless cold starts.
- **Browser WebCrypto Forensic Engine ([`frontend/src/lib/forensic-verifier.ts`](frontend/src/lib/forensic-verifier.ts)):**
  - Verifies Merkle tree inclusion proofs directly inside the client browser without sending confidential documents to external servers.

### 2.3 Backend Architecture (`backend/`) & Microservices Topology

1. **`shield-core` (Port `:3001`):**
   - **Main Controller & Identity Adapter:** Implements WebAuthn FIDO2 ceremonies, BCrypt credential hashing, session tokens, and Cedar policy evaluation.
   - **Case Management & Alerts:** Manages threat triage, state machines (`NEW` → `TRIAGED` → `CONTAINING` → `RESOLVED` → `CLOSED`), and forensic notes.
   - **Notification & SMTP Dispatch:** Manages transactional email dispatches, HTML templates, and delivery logs in schema `notification.deliveries`.
2. **`shield-ingest` (Port `:3002`):**
   - **OCSF v1.1 Normalization:** Maps raw telemetry payloads into typed OCSF categories (`Security Finding`, `Network Activity`, `Authentication`).
   - **Dead Letter Queue (DLQ):** Quarantines unparseable or malicious events in table `ingest.dlq_messages` with replay controls.
3. **`shield-ai` (Port `:3003`):**
   - **Model Armor Gateway:** Sanitizes operator prompts to prevent prompt-injection, canary token leaks, and system prompt bypasses.
   - **Spec §16.1 Decision Review Envelope:** Enforces 10 mandatory fields (Hypothesis, Confidence, Blast Radius, MITRE Technique, Grounded Citations, etc.) before operator sign-off.
4. **`shield-action` (Port `:3004`):**
   - **SOAR Execution Engine:** Executes actions categorized by authority: R0 (Telemetry Read), R1 (Enrichment), R2 (Reversible Containment), R3 (Destructive Containment), R4 (Identity Deprovisioning).
   - **Emergency Freeze Circuit Breakers:** Allows immediate global suspension of all autonomous playbooks.
5. **`shield-anchor` (Port `:3005`):**
   - **Merkle Ledger Engine:** Batches events into RFC 6962 binary Merkle trees.
   - **Dual-Signature Scheme:** Signs ledger roots with Ed25519 (classical) and ML-DSA-65 (NIST FIPS 204 Post-Quantum).

### 2.4 Database Architecture & Multi-Schema PostgreSQL Engine

ZoikoShield utilizes PostgreSQL 16 partitioned into **49 distinct domain schemas**. Cross-module direct writes are strictly prohibited by CI policy ([`database-access-policy.spec.ts`](backend/apps/shield-core/test/database-access-policy.spec.ts)):
- `identity`: User accounts (`principals`), passwords (`local_credentials`), and FIDO2 passkeys (`webauthn_credentials`).
- `tenant`: Multi-tenant boundaries (`tenants`), isolation rules, and policies.
- `authorization`: Role assignments (`user_roles`) and tenant memberships (`tenant_memberships`).
- `alert`: Detection alarms (`alerts`) and correlation clusters.
- `case_management`: Incident cases (`cases`) and timeline logs.
- `ingest`: Telemetry feeds, event buffers, and `dlq_messages`.
- `ai`: Model configurations, audit envelopes, and investigation traces.
- `action`: Remediation playbooks, action logs, and rollback state machines.
- `anchor`: Merkle nodes, epoch roots, and cryptographic receipts.
- `notification`: Delivery queues (`deliveries`) and email dispatch state.

---

## 3. END-TO-END USER JOURNEY: STAGE 1 TO STAGE 8

### 3.1 Stage 1 — Initial Application Access & Environment Bootstrap

#### Startup Sequence & Prerequisites
To start the platform locally or in containerized staging:
1. **Database Baseline:** Ensure PostgreSQL 16 is accessible with `DATABASE_URL` configured in `backend/.env`.
   ```bash
   cd backend
   npx prisma generate
   npm run migrate:deploy
   ```
2. **Backend Microservices:**
   ```bash
   cd backend
   npm run build:all
   npm run start:dev  # Starts shield-core on http://localhost:3001
   ```
3. **Frontend Application:**
   ```bash
   cd frontend
   npm run dev        # Starts Next.js on http://localhost:3000
   ```

#### Environment Variables Reference
| Variable | Component | Description | Example / Default |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Backend | PostgreSQL multi-schema connection string | `postgresql://postgres:postgres@localhost:5432/zoikoshield` |
| `JWT_SECRET` | Backend | Cryptographic secret for signing session tokens | `pqc-secops-jwt-token-signing-key-32b` |
| `BACKEND_URL` | Frontend | Target microservices gateway | `http://localhost:3001` |
| `NEXT_PUBLIC_DEMO_FALLBACK`| Frontend | Fallback flag (**must be false** in prod) | `false` |
| `PORT` | Backend | HTTP port for primary microservice | `3001` |

#### Unauthenticated Landing Experience
When an unauthenticated user opens `http://localhost:3000`, the Next.js edge middleware ([`frontend/src/middleware.ts`](frontend/src/middleware.ts)) evaluates the incoming request:
- If cookies `zoiko_auth` or `zoiko_shield_access_token` are absent, the user is redirected to `/login`.
- Public routes (`/login`, `/register`, `/trust`, `/verify-certificate`, `/help`) are exempted from redirection.

---

### 3.2 Stage 2 — Login, Multi-Factor Authentication & Identity Resolution

#### Frontend Page: [`frontend/src/app/login/page.tsx`](frontend/src/app/login/page.tsx)
The login gate presents a clean, enterprise authentication interface without hardcoded demo role cards:

```mermaid
sequenceDiagram
    autonumber
    actor User as Security Operator / Admin
    participant UI as Login Page (frontend/src/app/login/page.tsx)
    participant Client as ZoikoShieldApiClient (frontend/src/lib/api-client.ts)
    participant Proxy as API Proxy (/api/v1/[...slug]/route.ts)
    participant Core as Auth Service (backend/.../auth.service.ts)
    participant DB as PostgreSQL (schemas: identity, tenant)

    User->>UI: Enter Email & Password, Click "Sign In"
    UI->>Client: ZoikoShieldApiClient.login(email, password)
    Client->>Proxy: POST /api/v1/auth/login
    Proxy->>Core: Forward request to :3001/api/v1/auth/login
    Core->>DB: Query identity.principals by lowercased email
    DB-->>Core: Return Principal & identity.local_credentials
    Core->>Core: BCrypt comparison of password
    alt Invalid Password / Non-existent User
        Core-->>Proxy: HTTP 401 Unauthorized ("Invalid credentials")
        Proxy-->>Client: Forward 401
        Client-->>UI: Display error message "Invalid credentials"
    else Password Matches
        Core->>DB: Query authorization.tenant_memberships & roles
        DB-->>Core: Return Tenant ID & Assigned Role
        Core->>Core: Sign JWT Bearer Token (expiry: 8h)
        Core-->>Proxy: Return User Session + Token Pair
        Proxy->>Proxy: Set session cookies (zoiko_auth, shield_access_token)
        Proxy-->>Client: HTTP 200 OK
        Client->>UI: Resolve role & redirect to appropriate dashboard
        UI->>User: Redirect to /customer/dashboard, /admin, or /auditor
    end
```

#### Login Form Fields & Validation
| Field | Type | Required | Validation Rules | Purpose |
| :--- | :--- | :---: | :--- | :--- |
| `email` | `email` | Yes | Valid email format; auto-lowercased and trimmed. | Principal lookup in `identity.principals`. |
| `password` | `password` | Yes | Minimum 8 characters. Masked with toggle. | Verified against `identity.local_credentials`. |
| `rememberMe` | `checkbox` | No | Optional boolean. | Saves email to client-side localStorage. |

#### Role-Based Redirection Matrix
After authentication succeeds, [`login/page.tsx`](frontend/src/app/login/page.tsx) automatically routes the user based on their official role:
- **`SUPER_ADMIN`:** Routes to `/admin` (Platform Multi-Tenant Operations Center).
- **`AUDITOR`:** Routes to `/auditor` (Third-Party Compliance & Evidence Verification Cockpit).
- **`TENANT_OWNER`:** Routes to `/customer/dashboard` (or `/admin/tenant` if email prefix is `admin@`).
- **`SECURITY_ANALYST`:** Routes to `/customer/dashboard`.

---

### 3.3 Stage 3 — Organization Registration & Evaluation Tenant Provisioning

#### Frontend Page: [`frontend/src/app/register/page.tsx`](frontend/src/app/register/page.tsx)
Allows new enterprise organizations to self-provision an isolated sovereign tenant cell.

#### Registration Form Fields
| Field Name | Type | Mandatory | Accepted Values / Format | Why Required / Storage Location |
| :--- | :--- | :---: | :--- | :--- |
| `Organization Name` | `text` | Yes | String (3–60 chars), e.g., `"Acme Financial"` | Saved to `tenant.tenants.name`. |
| `Workspace Slug` | `text` | Yes | Lowercase alphanumeric, e.g., `"acme-fin"` | Unique identifier in `tenant.tenants.slug`. |
| `Full Name` | `text` | Yes | String, e.g., `"Aditya Sharma"` | Saved to `identity.principals.fullName`. |
| `Work Email Address` | `email` | Yes | Corporate email, e.g., `"aditya@zoiko.com"` | Primary key in `identity.principals.email`. |
| `Password` | `password` | Yes | Min 8 chars, mixed case, numbers, symbol | BCrypt hashed in `identity.local_credentials`. |
| `Data Residency Region` | `select` | Yes | `us-east-1`, `eu-west-1`, `ap-southeast-1` | Enforces sovereign data residency boundary. |
| `Compliance Packs` | `checkbox` | Yes | `SOC2_TYPE2`, `ISO27001`, `EU_AI_ACT`, `HIPAA` | Binds automated continuous audit controls. |

#### Backend Execution Flow (`auth.service.ts:register`)
1. **Uniqueness Verification:** Queries `identity.principals` where `email = normalizedEmail`. If found, throws `409 ConflictException`.
2. **Principal Creation:** Inserts record into `identity.principals` with `status: 'ACTIVE'`, `principalType: 'HUMAN'`.
3. **Password Hashing:** Hashes password with 10 salt rounds and creates `identity.local_credentials`.
4. **Tenant Provisioning:** Inserts record into `tenant.tenants` with assigned data residency cell.
5. **Role Assignment:** Grants role `TENANT_OWNER` via `authorization.tenant_memberships` and `authorization.user_roles`.
6. **Automatic Environment Seeding:** Auto-provisions the primary production environment within tenant scope.
7. **Client Session Establishment:** Issues token, sets cookies, and establishes local offline credential backup.

---

### 3.4 Stage 4 — Complete Audit of All 3 Customer Dashboards & 14 Sidebar Sections

ZoikoShield separates its user interfaces into distinct role-based views.

#### Dashboard 1: Customer Executive View (CISO / Executive Level)
- **Primary Route:** `/customer/dashboard` (with tab `executive`)
- **Key Metrics Displayed:**
  - **Security Posture Score (0–100):** Aggregated from passing control evaluations. Clean/empty tenants start at 0.
  - **Critical Exposures:** Count of unmitigated exposures from `/api/v1/customer/exposures`.
  - **Protection Coverage (%):** Percentage of assets with active connector agents.
  - **Active Incidents:** Count of non-closed cases from `/api/v1/cases`.
- **Priority Actions Card:** Displays top open cases requiring executive escalation. Displays `"No priority actions required at this time."` when clean.
- **Threat Activity Stream:** Real-time chart of incoming telemetry.

#### Dashboard 2: Customer SOC View (Lead Security Analyst)
- **Primary Route:** `/customer/dashboard` (with tab `soc`)
- **Key Metrics Displayed:**
  - **Alert Triage Pipeline:** Live count of `NEW`, `TRIAGED`, and `ESCALATED` alerts.
  - **Active SOAR Playbooks:** Status of automated containment actions.
  - **Detection Rule Coverage:** Rules loaded from `shield-ingest`.

#### Dashboard 3: Customer Account View (Compliance & Legal Officer)
- **Primary Route:** `/customer/dashboard` (with tab `account`)
- **Key Metrics Displayed:**
  - **Data Retention Tiers:** Status of 7-class retention policy (Hot, Warm, Cold, Legal Hold).
  - **Cryptographic Receipts:** Total Merkle tree receipts anchored to S3/Ledger.
  - **Commercial Entitlements:** Plan tier (`ENTERPRISE`), consumed telemetry quotas, and SLA credits.

---

#### The 14 Customer Sidebar Navigation Sections (`/customer/*`)

Every sidebar menu item is routed dynamically through [`CustomerWorkspaceSectionRouter`](frontend/src/components/customer/CustomerWorkspaceViews.tsx):

| # | Sidebar Item | Route Path | Backend API Connected | Database Tables Involved | Empty State Behavior |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **Command Center** | `/customer/dashboard` | `/api/v1/cases`, `/api/v1/alerts` | `case_management.cases`, `alert.alerts` | Shows clean 0 KPIs |
| **2** | **Security Overview** | `/customer/security-overview` | `/api/v1/customer/remediations` | `action.remediations` | "No active remediations" |
| **3** | **Threats & Incidents** | `/customer/threats-incidents` | `/api/v1/cases`, `/api/v1/alerts` | `case_management.cases` | "No active incidents" |
| **4** | **Exposure Management** | `/customer/exposure-management`| `/api/v1/customer/exposures` | `findings.exposures` | "No open exposures" |
| **5** | **Assets & Inventory** | `/customer/assets-inventory` | `/api/v1/customer/assets` | `resources.assets` | "No assets discovered" |
| **6** | **Vulnerabilities** | `/customer/vulnerabilities` | `/api/v1/customer/vulnerabilities` | `findings.vulnerabilities` | "No vulnerabilities recorded" |
| **7** | **Detection & Response**| `/customer/detection-response`| `/api/v1/connectors`, `/api/v1/alerts`| `ingest.connectors` | "No detection rules triggered"|
| **8** | **Identity & Access** | `/customer/identity-access` | `/api/v1/jit`, `/api/v1/auth/me` | `identity.principals`, `jit_sessions` | "No elevated sessions active" |
| **9** | **Data Security** | `/customer/data-security` | `/api/v1/customer/exposures` | `findings.data_exposures` | "No data exposures detected" |
| **10**| **Cloud Security** | `/customer/cloud-security` | `/api/v1/connectors` | `ingest.connectors` | "No cloud accounts linked" |
| **11**| **Compliance & Risk** | `/customer/compliance-risk` | `/api/v1/control-evaluations` | `controls.evaluations` | "No compliance gaps detected" |
| **12**| **Reports & Analytics** | `/customer/reports-analytics` | `/api/v1/audit-packages` | `audit_package.packages` | "No audit packages compiled" |
| **13**| **Integrations** | `/customer/integrations` | `/api/v1/connectors` | `ingest.connectors` | "No active integrations" |
| **14**| **Settings** | `/customer/settings` | `/api/v1/customer/settings` | `tenant.tenants`, `tenant.settings` | Displays real workspace slug |

---

### 3.5 Stage 5 — Comprehensive Deep-Dive into Every Functional Module

#### Module 1: Real-Time Telemetry & OCSF Ingestion (`/ingestion`)
- **Business Purpose:** Ingests security event streams from cloud providers, SaaS applications, and network appliances into a uniform schema (OCSF v1.1).
- **Access Control:** `SECURITY_ANALYST`, `TENANT_OWNER`, `SUPER_ADMIN`.
- **Frontend Page:** [`frontend/src/app/ingestion/page.tsx`](frontend/src/app/ingestion/page.tsx), [`console.tsx`](frontend/src/app/ingestion/console.tsx)
- **Backend Controller:** [`backend/apps/shield-ingest/src/ingest.controller.ts`](backend/apps/shield-ingest/src/ingest.controller.ts)
- **Endpoints:**
  - `POST /api/v1/events` (Batch event ingestion)
  - `GET /api/v1/events?limit=50` (Live event tail)
  - `GET /api/v1/ingest/dlq` (Dead Letter Queue management)
- **Security Check:** Validates `x-webhook-signature` using per-connector HMAC secrets; rejects duplicate payloads using nonces cached in Redis.

#### Module 2: Security Alerts & Incident Management (`/alerts`, `/cases`)
- **Business Purpose:** Centralizes threat alarms, clusters related alerts into investigations, and tracks mean time to acknowledge (MTTA) and resolve (MTTR).
- **Access Control:** `SECURITY_ANALYST`, `TENANT_OWNER`.
- **Frontend Pages:** [`frontend/src/app/alerts/page.tsx`](frontend/src/app/alerts/page.tsx), [`frontend/src/app/alerts/[alertId]/page.tsx`](frontend/src/app/alerts/[alertId]/page.tsx), [`frontend/src/app/cases/page.tsx`](frontend/src/app/cases/page.tsx)
- **Backend Controllers:** [`alert.controller.ts`](backend/apps/shield-core/src/modules/alert/alert.controller.ts), [`case.controller.ts`](backend/apps/shield-core/src/modules/case/case.controller.ts)
- **State Machine:** `NEW` → `TRIAGED` → `CONTAINING` → `RESOLVED` → `CLOSED`.
- **Actions:** Assign Analyst, Adjust Severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), Promote Alert to Major Case, Attach Forensic Note.

#### Module 3: Governed AI Security Copilot (`/copilot`, `/ai-governance`)
- **Business Purpose:** Accelerates forensic analysis of attack chains without allowing autonomous execution of unverified AI recommendations.
- **Access Control:** `SECURITY_ANALYST`, `TENANT_OWNER`.
- **Frontend Page:** [`frontend/src/app/copilot/page.tsx`](frontend/src/app/copilot/page.tsx), [`console.tsx`](frontend/src/app/copilot/console.tsx)
- **Backend Service:** [`backend/apps/shield-ai/src/copilot.service.ts`](backend/apps/shield-ai/src/copilot.service.ts)
- **The Spec §16.1 Decision Review Envelope:**
  Every Copilot response includes 10 required fields:
  1. Hypothesis
  2. Confidence Score (0.00–1.00)
  3. Blast Radius Assessment
  4. MITRE ATT&CK Technique
  5. Grounded Citations (OCSF Event IDs)
  6. Recommended Playbook
  7. Estimated Execution Duration
  8. Authority Tier (R0–R4)
  9. Rollback Feasibility
  10. Operator Attributable Rationale Field (Mandatory on Accept)

#### Module 4: Autonomous SOAR & Containment Actions (`/actions`)
- **Business Purpose:** Orchestrates automated response actions (e.g. revoke session, isolate host, block IP) while enforcing human dual-custody approval.
- **Access Control:** `TENANT_OWNER`, `SUPER_ADMIN`.
- **Frontend Page:** [`frontend/src/app/actions/page.tsx`](frontend/src/app/actions/page.tsx)
- **Backend Controller:** [`backend/apps/shield-action/src/action.controller.ts`](backend/apps/shield-action/src/action.controller.ts)
- **Authority Levels:**
  - `R0`: Read-only telemetry enrichment (Automatic).
  - `R1`: Low-risk reversible containment (Automatic if policy permits).
  - `R2`: High-risk isolation (Single operator approval).
  - `R3`: Destructive network blocking (Dual-custody 4-eyes approval).
  - `R4`: Emergency identity revocation (Dual-custody + HSM signing).

#### Module 5: RFC 6962 Merkle Evidence Ledger (`/ledger`, `/verify-certificate`)
- **Business Purpose:** Provides undeniable mathematical proof that security records, compliance snapshots, and incident decisions have not been altered.
- **Access Control:** Public verification on `/verify-certificate`; internal ledger on `/ledger`.
- **Frontend Page:** [`frontend/src/app/ledger/page.tsx`](frontend/src/app/ledger/page.tsx), [`frontend/src/app/verify-certificate/page.tsx`](frontend/src/app/verify-certificate/page.tsx)
- **Backend Service:** [`backend/apps/shield-anchor/src/merkle.service.ts`](backend/apps/shield-anchor/src/merkle.service.ts)
- **Verification Math:**
  - Leaf hash: $H(0x00 \ || \ M)$
  - Internal node hash: $H(0x01 \ || \ LeftChild \ || \ RightChild)$
  - Root signature: Post-quantum ML-DSA-65 + RFC 3161 timestamp.

---

### 3.6 Stage 6 — Notification Lifecycle, Email Templates & Dispatch Delivery

#### Notification Trigger Architecture
```mermaid
flowchart LR
    Event[Security Incident / JIT Request] --> Trigger[Notification Dispatcher]
    Trigger --> DB[Insert into notification.deliveries]
    Trigger --> SMTP[NodeMailer / AWS SES / Mailgun]
    SMTP --> Influx[External Mail Delivery]
    Trigger --> WS[SSE / Polling /api/v1/notifications/deliveries]
    WS --> Bell[TopHeader Notification Bell & Drawer]
```

#### Implemented Email Templates
Located in [`backend/apps/shield-core/src/modules/notification/templates/`](backend/apps/shield-core/src/modules/notification/templates/):
1. **`ZS-EML-IAM-001` (Account Verification OTP):** Dispatched upon self-registration with a 6-digit numeric token.
2. **`ZS-EML-ORG-001` (Workspace Provisioned):** Dispatched to Tenant Owner containing sovereign cell metadata and attestation hashes.
3. **`ZS-EML-JIT-002` (Break-Glass Quorum Request):** Dispatched to approvers when high-privilege JIT access is requested.
4. **`ZS-EML-INC-003` (Critical Incident War Room Trigger):** Dispatched to Incident Responders on Sev-1 escalation.

#### Delivery Auditing & Status Tracking
Every email attempt is recorded in PostgreSQL table `notification.deliveries`:
- Columns: `id`, `event_id`, `channel`, `recipient`, `status` (`PENDING`, `ACKNOWLEDGED`, `FAILED`), `attempt_count`, `delivered_at`, `error_code`.
- Visible to operators in [`/notifications`](frontend/src/app/notifications/page.tsx) and to Tenant Admins in [`/admin/email-templates`](frontend/src/app/admin/email-templates/page.tsx).

---

### 3.7 Stage 7 — Reports, Analytics, Forensic Audits & Export Pipelines

- **Export API Endpoints:**
  - `GET /api/v1/exports/data/alerts?format=csv` (Streamed CSV export of filtered alerts).
  - `GET /api/v1/exports/data/risk?format=csv` (Risk register export).
  - `GET /api/v1/audit-packages/:id/download` (Sealed `.tar.gz` compliance package containing Merkle tree proofs, OCSF evidence, and cryptographic receipts).
- **Integrity Validation:** Downloaded packages can be audited offline using the standalone `verifier-cli`:
  ```bash
  verifier-cli verify --package ./audit-package-2026.tar.gz
  ```

---

### 3.8 Stage 8 — Settings, Administration, Identity & Platform Governance

- **Tenant Isolation & Residency ([`/admin/tenant`](frontend/src/app/admin/tenant/page.tsx)):**
  Enforces regional data isolation boundaries (e.g. EU data stays in `eu-west-1`).
- **Platform Health & Non-Destructive Restore Drill ([`/admin/platform-health`](frontend/src/app/admin/platform-health/page.tsx)):**
  Monitors the live status of all 6 microservices and provides a verified on-demand restore drill (G05).
- **G1 Launch Gate Cockpit ([`/admin/g1-gate`](frontend/src/app/admin/g1-gate/page.tsx)):**
  Requires 8 canonical domain approvers (Security, Cryptography, Compliance, Legal, SRE, etc.) to ratify production release bundles.
- **JIT Privileged Access Elevation ([`/admin/jit-elevation`](frontend/src/app/admin/jit-elevation/page.tsx)):**
  Provides 2-party quorum break-glass access with WebAuthn passkey step-up authentication.

---

## 4. COMPLETE FRONTEND-TO-BACKEND COMMUNICATION CHAIN

### Universal Request-Response Trace
For any user interaction (e.g., Acknowledging an Alert):
1. **User Action:** Operator clicks *"Acknowledge Alert"* on `/alerts/alt-2026-001`.
2. **Component:** [`AlertDetailDrawer.tsx`](frontend/src/components/alerts/AlertDetailDrawer.tsx) calls `ZoikoShieldApiClient.updateAlertStatus("alt-2026-001", "TRIAGED")`.
3. **API Client:** [`api-client.ts`](frontend/src/lib/api-client.ts) serializes payload, injects `Authorization: Bearer <token>`, `x-tenant-id: <tenantId>`, and calls `fetch("/api/v1/alerts/alt-2026-001/status")`.
4. **Resilient Proxy:** [`route.ts`](frontend/src/app/api/v1/[...slug]/route.ts) maps route to `http://localhost:3001/api/v1/alerts/alt-2026-001/status`, verifies headers, and opens an HTTP keep-alive connection.
5. **Backend Controller:** [`AlertController.updateStatus`](backend/apps/shield-core/src/modules/alert/alert.controller.ts) receives request, runs class-validator DTO check.
6. **Backend Service:** [`AlertService`](backend/apps/shield-core/src/modules/alert/alert.service.ts) verifies tenant isolation and executes:
   ```sql
   UPDATE alert.alerts 
   SET status = 'TRIAGED', updated_at = NOW() 
   WHERE id = 'alt-2026-001' AND tenant_id = 'tenant-current';
   ```
7. **Ledger Anchor Dispatch:** Fires event to `shield-anchor` to record state transition in Merkle leaf queue.
8. **HTTP Response:** Returns updated Alert JSON object with HTTP 200 OK.
9. **UI Update:** React state updates optimistically; notification toast confirms success; notification bell updates unread count.

---

## 5. DATABASE SCHEMA, TABLE OWNERSHIP & TENANT ISOLATION MODEL

### Master Schema Ownership Matrix
```
+-------------------------------------------------------------------------------+
| MODULE SCHEMA OWNERSHIP (Spec §11.1, §19.1 - Direct Cross-Module Writes FORBIDDEN)|
+-----------------------------+--------------------+----------------------------+
| Microservice Owner          | Schema Name        | Core Entity Tables         |
+-----------------------------+--------------------+----------------------------+
| shield-core                 | identity           | principals, local_cred,    |
|                             |                    | webauthn_credentials       |
| shield-core                 | tenant             | tenants, settings, domains |
| shield-core                 | authorization      | user_roles, memberships    |
| shield-core                 | alert              | alerts, alert_tags         |
| shield-core                 | case_management    | cases, case_notes, timeln  |
| shield-core                 | notification       | deliveries, templates      |
| shield-ingest               | ingest             | events, dlq_messages       |
| shield-ai                   | ai                 | ai_decisions, model_armor  |
| shield-action               | action             | playbooks, remediations    |
| shield-anchor               | anchor             | merkle_trees, receipts     |
+-----------------------------+--------------------+----------------------------+
```

---

## 6. ROLE-BASED ACCESS CONTROL (RBAC) & TENANT PERMISSION MATRIX

| Feature / Workspace | `SECURITY_ANALYST` | `TENANT_OWNER` | `SUPER_ADMIN` | `AUDITOR` |
| :--- | :---: | :---: | :---: | :---: |
| **Customer Dashboard (`/customer/dashboard`)** | Read / Write | Full Control | Full Control | Read-Only |
| **Alerts & Cases (`/alerts`, `/cases`)** | Read / Write | Full Control | Full Control | Read-Only |
| **AI Copilot Investigations (`/copilot`)** | Read / Write | Full Control | Full Control | Read-Only |
| **SOAR Containment Execution (`/actions`)** | R0–R1 Only | R0–R3 | R0–R4 (Full) | Read-Only |
| **Tenant Settings (`/admin/tenant`)** | **DENIED** | Full Control | Full Control | **DENIED** |
| **Platform Health & DR (`/admin/platform-health`)** | **DENIED** | **DENIED** | Full Control | Read-Only |
| **G1 Launch Gate (`/admin/g1-gate`)** | **DENIED** | **DENIED** | Full Control | Read-Only |
| **JIT Break-Glass Approval (`/admin/jit-elevation`)** | Request Only | Quorum Approver| Quorum Approver| Audit Witness |
| **Certificate Verifier (`/verify-certificate`)** | Verified | Verified | Verified | Full Forensic |

---

## 7. COMPREHENSIVE USER INPUT & FIELD VALIDATION REFERENCE

### Form 1: Self-Service Organization Provisioning (`/register`)
- **Organization Name:** 3–60 characters. Disallows special shell characters (`<`, `>`, `;`, `&`).
- **Workspace Slug:** Lowercase letters, numbers, hyphens. Checked for global uniqueness.
- **Corporate Email:** RFC 5322 regex validation. Rejects generic public mailboxes (`gmail.com`, `yahoo.com`) if corporate domain enforcement is toggled.
- **Master Password:** Minimum 8 characters with at least one uppercase, one lowercase, one number, and one symbol (`!@#$%^&*`).

### Form 2: Manual Incident Creation (`/cases`)
- **Case Title:** 5–120 characters. E.g. `"Suspected Lateral Movement from Workstation 104"`.
- **Severity Level:** Must be one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- **Primary MITRE Technique:** E.g. `T1078.004` (Valid Cloud Accounts).
- **Assignee:** Valid user email belonging to the active tenant workspace.

### Form 3: JIT Break-Glass Elevation Request (`/admin/jit-elevation`)
- **Target Role:** E.g. `SUPER_ADMIN_BREAKGLASS`.
- **Duration (Minutes):** Integer between 15 and 240 (capped at 4 hours).
- **Statutory Justification:** Minimum 20 characters explaining the operational emergency.
- **WebAuthn Passkey Assertion:** Hardware FIDO2 token touch / biometric prompt.

---

## 8. API & SWAGGER SPECIFICATION AUDIT

All endpoints are fully documented in [`docs/swagger.yaml`](docs/swagger.yaml) and pass the automated CI security audit (`npm run swagger:check`):
- `POST /api/v1/auth/login` — Principal authentication & JWT issue.
- `POST /api/v1/auth/register-org` — Enterprise tenant self-provisioning.
- `POST /api/v1/auth/logout` — Revokes session cookies & terminates JWT.
- `GET /api/v1/alerts` — Retrieves paginated OCSF alerts.
- `POST /api/v1/alerts/:id/triage` — Updates alert classification and assignees.
- `GET /api/v1/cases` — Lists multi-stage incident investigations.
- `POST /api/v1/copilot/chat` — Submits operator queries to Model Armor.
- `POST /api/v1/actions/execute` — Triggers R0–R4 response playbooks.
- `GET /api/v1/anchor/receipts/:id` — Fetches cryptographic Merkle inclusion proofs.

---

## 9. ARCHITECTURE DECISION RECORDS & BUSINESS RATIONALE

- **ADR-01: Multi-Schema Partitioning over Database-per-Tenant:** Enabled horizontal scalability with strict logical separation without the operational overhead of running thousands of individual PostgreSQL instances.
- **ADR-02: Next.js API Proxy (`route.ts`) Architecture:** Eliminates CORS complexity, allows zero-trust cookie encapsulation (`httpOnly`, `sameSite: 'lax'`), and provides resilient client-side fallback when downstream services are warming up.
- **ADR-03: Separation of Customer and Operator Shells:** Completely isolates customer-facing CISO views from raw platform administration cockpits, guaranteeing that enterprise customers never see internal infrastructure controls.
- **ADR-04: Merkle Tree Anchoring with Post-Quantum Dual Signatures:** Guarantees that historical audit trails remain tamper-proof and legally defensible even against future quantum computing decryption threats.

---

## 10. KNOWN ISSUES, FALLBACK BEHAVIORS & IMPLEMENTATION STATUS

| Feature Area | Status | Implementation Details / Verified Behavior |
| :--- | :---: | :--- |
| **All 3 Customer Dashboards** | **100% COMPLETE** | Fully connected to dynamic APIs; 0 mock metrics in browser runtime. |
| **14 Customer Sidebar Views** | **100% COMPLETE** | Dynamic routing through `CustomerWorkspaceSectionRouter`. |
| **User Registration & Re-login** | **100% COMPLETE** | Case-insensitive email normalization + client-side credential persistence. |
| **Multi-Microservice Webpack Build** | **100% COMPLETE** | All 6 services compile cleanly with Webpack 5. |
| **Vitest Frontend Suites** | **100% COMPLETE** | 149 of 149 tests passing across all 20 test files. |
| **Live Database RLS Access** | **100% COMPLETE** | 8 of 8 isolation tests passing with 0 cross-module write violations. |
| **External Production SMTP** | *Config-Ready* | Dispatches locally to `notification.deliveries`; requires valid `SMTP_HOST` in production `.env`. |
| **Post-Quantum HSM Signing** | *Config-Ready* | Implemented with ML-DSA-65 software provider; connects to Cloud KMS / PKCS#11 HSM via environment flag. |

