# ZoikoShield Step-by-Step Backend Building Process

## ERB-01 Backend MVP

## 1. Backend objective

The first working ZoikoShield backend will implement this complete flow:

```text
User registration/login
→ Organization onboarding
→ Tenant creation
→ User role assignment
→ Security tool configuration
→ Connector authentication
→ Security log ingestion
→ Log validation
→ Log normalization
→ Asset and identity context
→ Detection execution
→ Alert generation
→ Case creation
→ Evidence recording
→ AI-assisted investigation summary
→ Human decision
→ Response recommendation
→ Response simulation
→ Control evaluation
→ Audit-package generation
→ Offline verification
```

For the first release:

- Use synthetic security logs.
- Use R0 observation and R1 recommendation only.
- Do not perform live destructive security actions.
- AI may assist users but cannot make final authorization, evidence, compliance, or response decisions.
- Begin with generic webhook/syslog, Microsoft identity/productivity, AWS or Azure, one EDR, one ticketing system, and one vulnerability source.

---

# 2. Recommended project structure

```text
zoikoshield-backend/
├── apps/
│   ├── shield-core/
│   ├── shield-ingest/
│   ├── shield-ai/
│   ├── shield-action/
│   ├── shield-anchor/
│   └── verifier-cli/
│
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── authorization/
│   ├── events/
│   ├── evidence/
│   ├── observability/
│   └── testing/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── policies/
│
├── contracts/
│   ├── openapi/
│   ├── events/
│   ├── commands/
│   └── webhooks/
│
├── infrastructure/
├── tests/
└── docs/
```

## Recommended MVP technologies

```text
Backend:          NestJS with TypeScript
HTTP server:      Fastify
Database:         PostgreSQL
Cache:            Redis
Event queue:      Kafka-compatible service or Redis Streams for early MVP
Validation:       Zod, JSON Schema or class-validator
API contracts:    OpenAPI
Authentication:   OAuth + email/password
Authorization:    RBAC first, ABAC policy layer afterward
File storage:     S3-compatible object storage
Search:           PostgreSQL initially, OpenSearch after ingestion volume requires it
Observability:    OpenTelemetry
Deployment:       Docker
CI/CD:            GitHub Actions
```

The backend remains a modular monolith for the main business domains, with ingestion, AI, action, and anchoring separated because they have different security, scale, and failure boundaries.

---

# 3. Team ownership

## Developer A — Authentication, tenant and platform

Developer A owns:

```text
Authentication
Users
OAuth
Sessions
Tenants
Organizations
Legal entities
Environments
Memberships
Roles
Permissions
Authorization
Audit logs
API gateway foundation
Database foundation
CI/CD and deployment
```

## Developer B — Connectors, logs, detection and cases

Developer B owns:

```text
Tool catalog
Connector setup
Connector health
Webhook ingestion
Syslog ingestion
Raw logs
Normalized logs
Replay
Detection rules
Alerts
Cases
Case timelines
Investigation workflow
```

## Developer C — Evidence, controls, AI and response

Developer C owns:

```text
Evidence records
Evidence ledger
Control evaluations
Audit packages
Offline verifier
AI gateway
AI summaries
AI citations
Response recommendations
Response simulations
Action receipts
Freeze controls
```

---

# 4. Step 0 — Create the backend foundation

## Owner

Developer A, with Developer B and Developer C contributing their application scaffolds.

## Tasks

1. Create the monorepo.
2. Create all backend applications.
3. Configure PostgreSQL.
4. Configure environment variables.
5. Configure Docker Compose.
6. Configure linting and formatting.
7. Configure testing.
8. Configure GitHub Actions.
9. Create the migration system.
10. Create health-check endpoints.

## Initial applications

```text
shield-core
shield-ingest
shield-ai
shield-action
shield-anchor
verifier-cli
```

## Initial environment variables

```env
NODE_ENV=development
PORT=5000

DATABASE_URL=postgresql://user:password@localhost:5432/zoikoshield_dev

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common

REDIS_URL=redis://localhost:6379

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=

ENCRYPTION_KEY=
```

## Initial endpoints

```http
GET /health
GET /health/ready
GET /health/live
```

## Done condition

```text
All applications start successfully.
PostgreSQL is connected.
Redis is connected.
Database migrations run successfully.
CI pipeline passes.
Health endpoints return healthy status.
```

---

# 5. Step 1 — Authentication

## Owner

Developer A.

## Authentication methods

For the MVP, support:

1. Email and password.
2. Google OAuth.
3. Microsoft OAuth.

OAuth providers are an MVP implementation choice. The ZoikoShield architecture requires controlled identity and authorization but does not require one specific OAuth provider.

## User table

```sql
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    password_hash TEXT,
    avatar_url TEXT,

    authentication_provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255),

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Authentication provider values

```text
LOCAL
GOOGLE
MICROSOFT
```

## Session table

```sql
CREATE TABLE identity.sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES identity.users(id),

    refresh_token_hash TEXT NOT NULL,
    device_name VARCHAR(255),
    ip_address INET,
    user_agent TEXT,

    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Bootstrap identity inputs

```text
approved invitation or commercial bootstrap authority
approved identity provider
issuer and subject
verified destination
terms/policy acceptance
```

## Invitation/bootstrap flow

```text
Issue a short-lived, tenant-bound invitation or bootstrap grant
→ Authenticate through an approved identity provider
→ Validate issuer, audience, signature, timing and subject
→ Resolve or create the principal by issuer-subject (never email alone)
→ Validate the invitation/bootstrap authority and policy acceptance
→ Provision the approved tenant membership and role mapping
→ Create login session
→ Check onboarding state
→ Redirect to organization onboarding
```

## Enterprise SSO flow

```text
User selects Sign in with Company SSO
→ Discover the tenant's active OIDC or SAML provider
→ Redirect to the tenant-configured identity provider
→ Validate the signed provider response, state, nonce, audience, and MFA policy
→ Find the principal by the approved issuer-subject binding (never email alone)
→ Require an active tenant membership or a matching single-use invitation
→ Resolve tenant roles and permissions
→ Create a tenant- and membership-bound session
→ Redirect to the application
```

## Authentication endpoints

```http
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
POST /api/v1/auth/switch-tenant

GET  /api/v1/auth/sso/discovery/:tenantSlug
POST /api/v1/auth/sso/start
GET  /api/v1/auth/sso/oidc/callback
POST /api/v1/auth/sso/saml/callback
GET  /api/v1/auth/sso/saml/metadata/:tenantSlug/:providerId

POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password

GET  /api/v1/me
```

## Login response

```json
{
  "user": {
    "id": "user-id",
    "sessionId": "session-id",
    "email": "user@example.com",
    "fullName": "User Name",
    "emailVerified": true,
    "assurance": "FEDERATED",
    "tenantId": "tenant-id",
    "membershipId": "membership-id",
    "environmentId": "environment-id",
    "region": "EU",
    "policyVersion": "iam-policy-1.0.0",
    "riskState": "NORMAL",
    "sessionState": "ACTIVE"
  }
}
```

The access and refresh tokens are set as secure HTTP-only cookies rather than
returned in the JSON response body.

## Security rules

- Every HTTP handler declares one access contract: public authentication
  ingress, externally authenticated ingress, authentication-only, tenant
  authorization, platform authorization, or workload identity. Missing
  declarations fail closed at runtime and in `npm run access:check`.
- Authentication-only endpoints grant no tenant resource authority.
- Tenant endpoints validate the session tenant, active membership, supplied
  tenant identifiers and required permissions before controller execution.
- Tenant and platform guards call the policy-decision service before controller
  execution. Only `PERMIT` proceeds; `DENY`, `NOT_APPLICABLE`, missing context,
  and dependency failures fail closed. `INDETERMINATE` is returned separately
  from an ordinary policy denial.
- Material decisions persist the actor, tenant/environment, action, effect
  class, resource, purpose, required permissions/entitlement, policy version,
  stable reason code, obligations, correlation ID, and a context hash.
- Resource-owning services independently bind resource identifiers to the
  authorized tenant and return not-found for cross-tenant lookups.
- Hash passwords with Argon2id or bcrypt.
- Store hashed refresh tokens.
- Rotate refresh tokens.
- Revoke sessions after password reset.
- Add rate limiting to login and password-reset endpoints.
- Record successful and failed login events.
- Never place tokens in logs.
- Use secure, HTTP-only cookies when the frontend and backend architecture permits them.

## Done condition

```text
Open password self-registration is unavailable.
Approved password-fallback users can log in.
Tenant administrators can configure and activate approved OIDC or SAML providers.
Users can authenticate through their company's active identity provider.
Federated identities are linked by issuer-subject, never email alone.
Tenant membership and roles are validated before a tenant-bound session is issued.
Every Shield Core controller operation passes the declared-access architecture check.
Tenant and platform guards permit only a persisted PDP `PERMIT` decision.
Cross-tenant, inactive-membership, missing-permission, missing-entitlement,
insufficient-assurance, and policy-dependency failure tests fail closed.
Refresh token rotation works.
Logout works.
Authentication audit events are recorded.
```

---

# 6. Step 2 — Organization and tenant onboarding

## Owner

Developer A.

A tenant is the isolated customer account. A tenant is not a role.

## Onboarding screens

```text
Step 1: Personal account
Step 2: Organization information
Step 3: Legal entity
Step 4: Environment selection
Step 5: Region selection
Step 6: Security objective
Step 7: Invite team members
Step 8: Configure first security tool
```

## Organization registration fields

```text
organizationName
displayName
website
industry
companySize
country
timezone
primaryContactName
primaryContactEmail
```

## Legal entity fields

```text
legalName
registrationNumber
countryOfRegistration
registeredAddress
taxIdentifier
```

## Tenant fields

```text
tenantName
tenantSlug
homeRegion
timezone
dataResidencyRegion
status
```

## Environment fields

```text
environmentName
environmentType
region
status
```

Environment types:

```text
PRODUCTION
STAGING
DEVELOPMENT
TEST
SIMULATION
```

## Database tables

```sql
CREATE SCHEMA IF NOT EXISTS tenant;

CREATE TABLE tenant.tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,

    home_region VARCHAR(100) NOT NULL,
    data_residency_region VARCHAR(100) NOT NULL,
    timezone VARCHAR(100) NOT NULL,

    onboarding_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_by UUID NOT NULL REFERENCES identity.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant.organizations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant.tenants(id),

    legal_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    website TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    country VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant.legal_entities (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant.tenants(id),

    legal_name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(255),
    country_of_registration VARCHAR(100),
    registered_address TEXT,
    tax_identifier VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant.environments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant.tenants(id),

    name VARCHAR(100) NOT NULL,
    environment_type VARCHAR(30) NOT NULL,
    region VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Onboarding API endpoints

```http
POST  /api/v1/onboarding/organization
POST  /api/v1/onboarding/legal-entity
POST  /api/v1/onboarding/environment
POST  /api/v1/onboarding/complete
GET   /api/v1/onboarding/status

POST  /api/v1/tenants
GET   /api/v1/tenants/:tenantId
PATCH /api/v1/tenants/:tenantId

POST  /api/v1/tenants/:tenantId/organizations
POST  /api/v1/tenants/:tenantId/legal-entities
POST  /api/v1/tenants/:tenantId/environments
```

## Onboarding transaction

When a user completes the first organization step, perform one transaction:

```text
Create tenant
→ Create organization
→ Create legal entity
→ Create default environment
→ Create tenant membership
→ Assign TENANT_OWNER role
→ Create onboarding audit event
```

## Done condition

```text
A registered user can create an organization.
A tenant is created.
A legal entity is created.
A default environment is created.
The user becomes Tenant Owner.
Every record contains the correct tenant ID.
```

---

# 7. Step 3 — Tenant membership, roles and permissions

## Owner

Developer A.

## Role levels

### Platform roles

```text
PLATFORM_SUPER_ADMIN
PLATFORM_SECURITY_ADMIN
PLATFORM_SUPPORT_OPERATOR
```

### Tenant roles

```text
TENANT_OWNER
TENANT_ADMIN
SECURITY_ANALYST
COMPLIANCE_MANAGER
AUDITOR
VIEWER
```

## Database tables

```sql
CREATE SCHEMA IF NOT EXISTS authorization;

CREATE TABLE authorization.tenant_memberships (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant.tenants(id),
    user_id UUID NOT NULL REFERENCES identity.users(id),

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, user_id)
);

CREATE TABLE authorization.roles (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenant.tenants(id),

    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role_level VARCHAR(30) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE authorization.permissions (
    id UUID PRIMARY KEY,
    code VARCHAR(150) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE authorization.role_permissions (
    role_id UUID NOT NULL REFERENCES authorization.roles(id),
    permission_id UUID NOT NULL REFERENCES authorization.permissions(id),

    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE authorization.user_roles (
    membership_id UUID NOT NULL REFERENCES authorization.tenant_memberships(id),
    role_id UUID NOT NULL REFERENCES authorization.roles(id),

    PRIMARY KEY (membership_id, role_id)
);
```

## Permission examples

```text
tenant:read
tenant:update
member:invite
member:remove

connector:create
connector:update
connector:activate
connector:delete

event:read
event:replay

detection:create
detection:update
detection:activate

alert:read
alert:update

case:create
case:assign
case:update
case:close

evidence:read
evidence:export

control:evaluate
audit-package:create

ai:use
response:recommend
response:simulate
```

## Invitation flow

```text
Tenant Owner enters email and role
→ Create pending invitation
→ Send invitation email
→ User opens invitation
→ User authenticates through an approved IdP or password fallback
→ Create tenant membership
→ Assign selected role
→ Mark invitation accepted
→ Record audit event
```

## API endpoints

```http
POST   /api/v1/tenants/:tenantId/invitations
GET    /api/v1/tenants/:tenantId/invitations
POST   /api/v1/invitations/:token/accept

GET    /api/v1/tenants/:tenantId/members
PATCH  /api/v1/tenants/:tenantId/members/:memberId
DELETE /api/v1/tenants/:tenantId/members/:memberId

GET    /api/v1/roles
POST   /api/v1/roles
PATCH  /api/v1/roles/:roleId
```

## Done condition

```text
Tenant Owner can invite users.
Invited users can join the tenant.
A user can have different roles in different tenants.
Unauthorized users cannot access tenant data.
Platform roles and tenant roles are separate.
```

---

# 8. Step 4 — Canonical tenant context

## Owner

Developer A.

Every request, event, command, evidence record, AI call, and response proposal must include a canonical context.

The interface specification requires tenant, environment, legal entity, region, purpose, identity, authorization, trace, and contract information to travel with controlled operations.

## Canonical context

```ts
export interface CanonicalContext {
  tenantId: string;
  legalEntityId?: string;
  environmentId: string;
  region: string;

  actorId?: string;
  workloadId?: string;

  requestId: string;
  traceId: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey?: string;

  purpose: string;
  dataClass: string;
  policyVersion: string;

  contractId: string;
  contractVersion: string;

  occurredAt?: string;
  observedAt?: string;
  recordedAt: string;
}
```

## Request headers

```http
Authorization: Bearer <token>
X-Tenant-Id: tenant-id
X-Environment-Id: environment-id
X-Request-Id: request-id
X-Correlation-Id: correlation-id
X-Purpose: security-monitoring
```

## Middleware flow

```text
Verify access token
→ Load user
→ Resolve tenant membership
→ Validate environment
→ Validate tenant region
→ Resolve roles and permissions
→ Build CanonicalContext
→ Attach context to request
→ Continue to controller
```

## Critical rule

Do not use:

```ts
tenantId: "default-tenant"
environmentId: "dev"
```

Tenant and environment values must come from authenticated and authorized request context.

## Done condition

```text
Every protected endpoint receives CanonicalContext.
Requests without valid tenant membership are rejected.
Cross-tenant access tests fail safely.
Audit events contain tenant, actor and trace information.
```

---

# 9. Step 5 — Security tool and connector catalog

## Owner

Developer B.

## Initial connector categories

```text
Microsoft 365 / Entra ID
AWS
Azure
Generic Webhook
Generic Syslog
EDR
Ticketing
Vulnerability Scanner
```

## Tool configuration flow

```text
Tenant Admin opens integrations
→ Selects tool
→ Enters connector name
→ Selects tenant environment
→ Selects source region
→ Provides authentication method
→ Provides credentials or OAuth authorization
→ Tests connection
→ Reviews requested permissions
→ Activates connector
→ Connector begins collecting logs
```

## Connector fields

```text
connectorType
connectorName
tenantId
environmentId
sourceRegion
authenticationType
credentialReference
requestedScopes
pollingInterval
webhookSecretReference
status
healthStatus
lastSuccessfulSync
```

## Authentication types

```text
OAUTH
API_KEY
CLIENT_CREDENTIALS
WEBHOOK_SECRET
SYSLOG_TLS
SERVICE_ACCOUNT
```

## Connector tables

```sql
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE integration.connectors (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,

    connector_type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    authentication_type VARCHAR(50) NOT NULL,
    credential_reference TEXT,

    source_region VARCHAR(100),
    requested_scopes JSONB NOT NULL DEFAULT '[]',

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    health_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',

    last_successful_sync_at TIMESTAMPTZ,
    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Connector states

```text
DRAFT
CONFIGURING
TESTING
ACTIVE
DEGRADED
STALE
UNAUTHORIZED
RATE_LIMITED
FAILED
DISABLED
RETIRED
```

## API endpoints

```http
GET    /api/v1/connector-types

POST   /api/v1/connectors
GET    /api/v1/connectors
GET    /api/v1/connectors/:connectorId
PATCH  /api/v1/connectors/:connectorId
DELETE /api/v1/connectors/:connectorId

POST   /api/v1/connectors/:connectorId/test
POST   /api/v1/connectors/:connectorId/activate
POST   /api/v1/connectors/:connectorId/disable
POST   /api/v1/connectors/:connectorId/sync
GET    /api/v1/connectors/:connectorId/health
```

## Security rules

- Never store plain credentials in PostgreSQL.
- Store credentials in an approved secret vault.
- Store only `credential_reference` in the connector table.
- Separate read permissions from action permissions.
- The first EDR integration should be read-only unless action certification is completed.
- A connector cannot invoke response actions directly.

## Done condition

```text
Tenant Admin can configure a tool.
Credentials are stored outside the database.
Connection test works.
Connector permission details are visible.
Connector can be activated.
Connector health is recorded.
```

---

# 10. Step 6 — Security log ingestion

## Owner

Developer B.

## Initial ingestion methods

```text
Webhook
Syslog
Polling API
Cloud event subscription
Batch upload for synthetic testing
```

## Ingestion flow

```text
Security tool sends log
→ Verify connector identity
→ Verify signature or credential
→ Resolve tenant and environment
→ Validate source region
→ Generate event ID
→ Store raw-payload reference
→ Validate payload schema
→ Check duplicate
→ Accept or quarantine
→ Publish TelemetryAccepted event
```

## Raw event fields

```text
eventId
tenantId
environmentId
connectorId
sourceType
sourceEventId
sourceRegion
receivedAt
occurredAt
contentType
payloadHash
rawPayloadReference
schemaVersion
processingStatus
```

## Database tables

```sql
CREATE SCHEMA IF NOT EXISTS ingestion;

CREATE TABLE ingestion.raw_events (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,
    connector_id UUID NOT NULL,

    source_type VARCHAR(100) NOT NULL,
    source_event_id VARCHAR(255),

    source_region VARCHAR(100),
    occurred_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    payload_hash TEXT NOT NULL,
    raw_payload_reference TEXT NOT NULL,

    schema_version VARCHAR(50),
    processing_status VARCHAR(30) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, connector_id, source_event_id)
);
```

## Webhook endpoint

```http
POST /api/v1/ingestion/webhooks/:connectorId
```

## Example webhook body

```json
{
  "eventId": "source-event-001",
  "eventType": "user.login",
  "occurredAt": "2026-08-07T10:15:00Z",
  "user": {
    "id": "user-100",
    "email": "employee@example.com"
  },
  "sourceIp": "192.0.2.10",
  "result": "FAILED"
}
```

## Ingestion events

```text
TelemetryReceived
TelemetryAccepted
TelemetryRejected
TelemetryQuarantined
DuplicateTelemetryIgnored
ConnectorHealthChanged
```

## Done condition

```text
Authenticated webhook accepts valid events.
Invalid events are rejected or quarantined.
Duplicate events do not create duplicate records.
Tenant and connector context are recorded.
Raw payload has a cryptographic hash.
```

---

# 11. Step 7 — Log validation and normalization

## Owner

Developer B.

## Processing flow

```text
Accepted raw event
→ Load source schema
→ Validate required fields
→ Preserve source payload reference
→ Map source fields
→ Normalize event
→ Add asset and identity references
→ Record mapping version
→ Publish TelemetryNormalized
```

## Normalized event fields

```text
id
tenantId
environmentId
connectorId

eventClass
eventCategory
eventActivity
severity

actorUserId
actorEmail
sourceIp
destinationIp

resourceId
resourceType

action
outcome

occurredAt
observedAt
recordedAt

sourcePayloadReference
sourceSchemaVersion
mappingVersion
normalizationStatus
```

## Normalized events table

```sql
CREATE TABLE ingestion.normalized_events (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,
    connector_id UUID NOT NULL,
    raw_event_id UUID NOT NULL REFERENCES ingestion.raw_events(id),

    event_class VARCHAR(100) NOT NULL,
    event_category VARCHAR(100),
    event_activity VARCHAR(100),
    severity VARCHAR(30),

    actor_user_id VARCHAR(255),
    actor_email VARCHAR(255),

    source_ip INET,
    destination_ip INET,

    resource_id VARCHAR(255),
    resource_type VARCHAR(100),

    action VARCHAR(100),
    outcome VARCHAR(50),

    occurred_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    mapping_version VARCHAR(50) NOT NULL,
    normalization_status VARCHAR(30) NOT NULL
);
```

## Quarantine reasons

```text
INVALID_SCHEMA
MISSING_TENANT_CONTEXT
UNSUPPORTED_VERSION
INVALID_SIGNATURE
PROHIBITED_REGION
MALFORMED_PAYLOAD
PAYLOAD_TOO_LARGE
UNKNOWN_SOURCE
```

## API endpoints

```http
GET  /api/v1/events
GET  /api/v1/events/:eventId
GET  /api/v1/quarantine
POST /api/v1/quarantine/:eventId/reprocess
POST /api/v1/events/replay
```

## Done condition

```text
Raw logs are normalized into one canonical event format.
Source payload and transformation lineage are preserved.
Malformed events are quarantined.
Normalization version is recorded.
Replay is idempotent.
```

---

# 12. Step 8 — Asset and identity context

## Owner

Developer B, using tenant and authorization services from Developer A.

## Objective

Security logs often contain source-specific users, devices, applications, and resources. ZoikoShield needs a tenant-scoped context layer.

## Objects

```text
Asset
Identity Entity
Cloud Resource
Application
Business Service
Vulnerability
Exposure
Relationship
```

## Example tables

```sql
CREATE SCHEMA IF NOT EXISTS security_context;

CREATE TABLE security_context.assets (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,

    external_id VARCHAR(255),
    asset_type VARCHAR(100) NOT NULL,
    name VARCHAR(255),

    criticality VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_context.identity_entities (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,

    external_id VARCHAR(255),
    email VARCHAR(255),
    display_name VARCHAR(255),
    identity_type VARCHAR(50),

    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ
);
```

## Processing

```text
Normalized event arrives
→ Resolve source user
→ Resolve source asset
→ Create or update tenant-scoped context
→ Link event to asset and identity
→ Add criticality and business context
```

## Done condition

```text
Events link to tenant-scoped assets and identities.
The same source asset does not create repeated duplicates.
Cross-tenant context cannot be queried.
Detection engine can use asset criticality.
```

---

# 13. Step 9 — Detection engine

## Owner

Developer B.

## First detection types

Start with deterministic detections:

```text
Repeated failed login
Successful login after repeated failures
Login from new country
Disabled account login attempt
High-severity vulnerability detected
Privileged role assignment
Unusual API access
Connector stopped sending logs
```

## Detection rule fields

```text
ruleId
name
description
eventClass
conditions
severity
enabled
version
tenantScope
requiredFields
window
threshold
owner
createdAt
```

## Detection tables

```sql
CREATE SCHEMA IF NOT EXISTS detection;

CREATE TABLE detection.rules (
    id UUID PRIMARY KEY,

    tenant_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    rule_type VARCHAR(50) NOT NULL,
    severity VARCHAR(30) NOT NULL,

    condition_definition JSONB NOT NULL,
    required_fields JSONB NOT NULL DEFAULT '[]',

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    current_version INTEGER NOT NULL DEFAULT 1,

    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE detection.detection_runs (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    rule_id UUID NOT NULL REFERENCES detection.rules(id),
    event_id UUID NOT NULL,

    rule_version INTEGER NOT NULL,
    result VARCHAR(30) NOT NULL,

    execution_details JSONB,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Detection execution flow

```text
TelemetryNormalized event arrives
→ Select eligible detection rules
→ Validate required fields
→ Execute deterministic conditions
→ Record detection run
→ If matched, create alert
→ Link alert to event and rule version
→ Publish AlertCreated
```

## Example simple rule

```json
{
  "ruleType": "THRESHOLD",
  "eventClass": "AUTHENTICATION",
  "conditions": [
    {
      "field": "outcome",
      "operator": "EQUALS",
      "value": "FAILED"
    }
  ],
  "groupBy": ["actorEmail", "sourceIp"],
  "windowMinutes": 10,
  "threshold": 5
}
```

## Detection endpoints

```http
POST  /api/v1/detections
GET   /api/v1/detections
GET   /api/v1/detections/:detectionId
PATCH /api/v1/detections/:detectionId

POST  /api/v1/detections/:detectionId/test
POST  /api/v1/detections/:detectionId/activate
POST  /api/v1/detections/:detectionId/disable
POST  /api/v1/detections/:detectionId/replay
```

## Done condition

```text
A normalized synthetic login event triggers a deterministic detection.
The detection rule version is recorded.
Replay produces the same result.
Duplicate events do not create duplicate alerts.
```

---

# 14. Step 10 — Alert generation

## Owner

Developer B.

## Alert fields

```text
alertId
tenantId
environmentId
detectionRuleId
detectionRuleVersion
severity
priority
title
description
status
sourceEventIds
affectedAssets
affectedIdentities
confidence
createdAt
```

## Alert statuses

```text
NEW
ACKNOWLEDGED
INVESTIGATING
SUPPRESSED
FALSE_POSITIVE
PROMOTED_TO_CASE
CLOSED
```

## Alert table

```sql
CREATE TABLE detection.alerts (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,

    detection_rule_id UUID NOT NULL,
    detection_rule_version INTEGER NOT NULL,

    title VARCHAR(255) NOT NULL,
    description TEXT,

    severity VARCHAR(30) NOT NULL,
    priority VARCHAR(30),
    confidence NUMERIC(5,2),

    status VARCHAR(30) NOT NULL DEFAULT 'NEW',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Alert endpoints

```http
GET   /api/v1/alerts
GET   /api/v1/alerts/:alertId
PATCH /api/v1/alerts/:alertId/status
POST  /api/v1/alerts/:alertId/assign
POST  /api/v1/alerts/:alertId/create-case
```

## Important rule

A detection finding or alert does not automatically become an incident or authorize a response. Detection, alert, case, incident, playbook, and response actions are separate controlled objects.

## Done condition

```text
Matched detection creates an alert.
Alert contains source-event references.
Alert contains rule and rule-version information.
Alert can be acknowledged and assigned.
Alert can be promoted into a case.
```

---

# 15. Step 11 — Case management

## Owner

Developer B.

## Case lifecycle

```text
NEW
→ TRIAGED
→ INVESTIGATING
→ CONTAINMENT_PENDING
→ CONTAINED
→ REMEDIATING
→ MONITORING
→ RESOLVED
→ CLOSED
```

Alternative endings:

```text
DUPLICATE
FALSE_POSITIVE
ACCEPTED_RISK
CUSTOMER_ACTION_REQUIRED
THIRD_PARTY_DEPENDENCY
```

## Case fields

```text
caseId
tenantId
title
description
severity
priority
status
ownerId
queue
sourceAlertIds
affectedAssets
affectedIdentities
slaStartedAt
createdAt
resolvedAt
closedAt
```

## Case tables

```sql
CREATE SCHEMA IF NOT EXISTS case_management;

CREATE TABLE case_management.cases (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,

    title VARCHAR(255) NOT NULL,
    description TEXT,

    severity VARCHAR(30) NOT NULL,
    priority VARCHAR(30),
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',

    owner_id UUID,
    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

CREATE TABLE case_management.case_timeline (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    case_id UUID NOT NULL REFERENCES case_management.cases(id),

    event_type VARCHAR(100) NOT NULL,
    actor_id UUID,
    details JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Case APIs

```http
POST  /api/v1/cases
GET   /api/v1/cases
GET   /api/v1/cases/:caseId
PATCH /api/v1/cases/:caseId

POST  /api/v1/cases/:caseId/assign
POST  /api/v1/cases/:caseId/transition
POST  /api/v1/cases/:caseId/notes
POST  /api/v1/cases/:caseId/evidence
GET   /api/v1/cases/:caseId/timeline
```

## State transition rule

Every transition must validate:

```text
Current state
Requested next state
User permission
Required fields
Required evidence
Reason
Actor
Timestamp
```

## Done condition

```text
An alert can create a case.
Case transitions are validated.
Unauthorized transitions are rejected.
Every case change appears in the timeline.
Case is linked to alerts, events, assets and evidence.
```

---

# 16. Step 12 — Evidence recording

## Owner

Developer C.

Every material security conclusion, control state, AI recommendation, human decision, and response proposal must link to evidence.

The architecture prohibits material decisions or claims from completing without an attributable, tenant-scoped, timestamped, integrity-protected evidence record.

## Evidence fields

```text
evidenceId
tenantId
environmentId
evidenceType
sourceType
sourceId
collectorId
collectorVersion
contentHash
contentReference
occurredAt
collectedAt
freshnessStatus
completenessStatus
integrityStatus
createdBy
```

## Evidence statuses

```text
CURRENT
STALE
INCOMPLETE
MISSING
UNAUTHORIZED
UNAVAILABLE
INVALID
SUPERSEDED
```

## Evidence table

```sql
CREATE SCHEMA IF NOT EXISTS evidence;

CREATE TABLE evidence.evidence_records (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,

    evidence_type VARCHAR(100) NOT NULL,
    source_type VARCHAR(100) NOT NULL,
    source_id VARCHAR(255),

    collector_id VARCHAR(255) NOT NULL,
    collector_version VARCHAR(50) NOT NULL,

    content_hash TEXT NOT NULL,
    content_reference TEXT NOT NULL,

    occurred_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    freshness_status VARCHAR(30) NOT NULL,
    completeness_status VARCHAR(30) NOT NULL,
    integrity_status VARCHAR(30) NOT NULL,

    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Evidence creation flow

```text
Detection, case or collector produces material information
→ Canonicalize evidence content
→ Calculate hash
→ Store encrypted content
→ Store content reference
→ Create evidence metadata
→ Append ledger entry
→ Publish EvidenceRecorded
```

## Evidence APIs

```http
POST /api/v1/evidence
GET  /api/v1/evidence
GET  /api/v1/evidence/:evidenceId
POST /api/v1/evidence/:evidenceId/verify
```

## Done condition

```text
Alert and case decisions link to evidence.
Evidence content has a cryptographic hash.
Evidence content is stored separately from metadata.
Integrity verification detects changed content.
Freshness and completeness are explicit.
```

---

# 17. Step 13 — Evidence ledger and anchoring

## Owner

Developer C.

## Ledger flow

```text
Evidence record created
→ Create immutable ledger entry
→ Link previous tenant ledger entry
→ Calculate ledger-entry hash
→ Update tenant chain head
→ Build checkpoint
→ Build Merkle root
→ Sign checkpoint
→ Send root to independent witness
→ Store witness receipt
```

## Ledger tables

```sql
CREATE TABLE evidence.ledger_entries (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    evidence_id UUID NOT NULL REFERENCES evidence.evidence_records(id),

    sequence_number BIGINT NOT NULL,
    previous_hash TEXT,
    entry_hash TEXT NOT NULL,

    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, sequence_number)
);

CREATE TABLE evidence.checkpoints (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    first_sequence BIGINT NOT NULL,
    last_sequence BIGINT NOT NULL,

    merkle_root TEXT NOT NULL,
    signature TEXT NOT NULL,
    signer_key_id VARCHAR(255) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Separation rule

- `shield-core` writes evidence metadata and ledger records.
- `shield-anchor` signs checkpoints.
- `shield-core` cannot access anchor signing keys.
- `shield-anchor` cannot modify evidence records.

## Done condition

```text
Evidence records create append-only ledger entries.
History changes break verification.
A checkpoint can be signed.
A witness receipt can be stored.
The verifier can validate the chain and checkpoint.
```

---

# 18. Step 14 — Control evaluation

## Owner

Developer C.

## Objective

Convert evidence into explicit control states without claiming more than the evidence supports.

## Objects

```text
Control Objective
Control Implementation
Control Test
Evidence Manifest
Control Evaluation
Assessment
Risk
Exception
```

## Example control

```text
Control Objective:
Administrative accounts must use multi-factor authentication.

Control Test:
Check identity-provider configuration and privileged-user records.

Required Evidence:
MFA policy configuration
Privileged-user inventory
Authentication log sample

Result:
EFFECTIVE
PARTIALLY_EFFECTIVE
INEFFECTIVE
UNKNOWN
NOT_APPLICABLE
```

## Control evaluation fields

```text
controlId
testId
evaluatorId
evaluatorVersion
requiredEvidenceIds
availableEvidenceIds
completenessStatus
freshnessStatus
result
limitations
reviewerId
evaluatedAt
```

## APIs

```http
POST /api/v1/controls
GET  /api/v1/controls

POST /api/v1/control-tests
POST /api/v1/control-tests/:testId/evaluate

GET  /api/v1/control-evaluations
GET  /api/v1/control-evaluations/:evaluationId
```

## Done condition

```text
A control test reads versioned evidence.
Missing evidence creates UNKNOWN or INCOMPLETE state.
Evaluator version is recorded.
Control result links to evidence records.
A control result cannot silently appear healthy.
```

---

# 19. Step 15 — AI-assisted investigation

## Owner

Developer C.

## Initial AI use cases

```text
Case summary
Alert explanation
Evidence summary
Suggested investigation questions
Suggested next steps
Draft response recommendation
Draft audit-package narrative
```

## AI request flow

```text
Authorized analyst requests AI assistance
→ Validate tenant and permission
→ Load approved AI profile
→ Load approved case evidence
→ Redact prohibited fields
→ Build retrieval manifest
→ Send request through AI gateway
→ Validate output
→ Attach citations
→ Store AI run
→ Display as recommendation
→ Human accepts, edits or rejects
```

## AI run fields

```text
aiRunId
tenantId
useCaseId
providerProfile
modelProfile
promptProfile
retrievalManifest
inputEvidenceIds
output
citations
policyVersion
humanReviewStatus
latency
tokenUsage
cost
createdAt
```

## AI endpoints

```http
POST /api/v1/ai/cases/:caseId/summary
POST /api/v1/ai/cases/:caseId/investigation-steps
POST /api/v1/ai/cases/:caseId/response-recommendation

POST /api/v1/ai/runs/:aiRunId/accept
POST /api/v1/ai/runs/:aiRunId/edit
POST /api/v1/ai/runs/:aiRunId/reject
```

## AI response

```json
{
  "aiRunId": "ai-run-id",
  "status": "REVIEW_REQUIRED",
  "summary": "Multiple failed sign-in attempts were followed by a successful login.",
  "citations": [
    {
      "evidenceId": "evidence-1",
      "description": "Failed login events"
    },
    {
      "evidenceId": "evidence-2",
      "description": "Successful login event"
    }
  ],
  "recommendedActions": [
    "Verify the user activity",
    "Review the source IP",
    "Consider resetting active sessions"
  ],
  "limitations": [
    "Device ownership could not be confirmed"
  ]
}
```

## AI restrictions

AI cannot:

```text
Authenticate users
Authorize requests
Change tenant routing
Declare final compliance
Verify evidence hashes
Execute detections
Approve security responses
Change entitlements
Perform recovery
```

The deterministic authority matrix specifically keeps authentication, authorization, evidence integrity, control assessment, detection execution, response approval, entitlement, and recovery outside the LLM critical path.

## Done condition

```text
AI summary contains evidence citations.
AI output is marked as advisory.
Human can accept, edit or reject the output.
AI unavailable state does not break case management.
No AI provider is called directly from shield-core.
```

---

# 20. Step 16 — Human decision recording

## Owners

Developer B and Developer C.

After AI assistance, the analyst must record the actual decision.

## Decision fields

```text
decisionId
tenantId
caseId
decisionType
decision
reason
evidenceIds
aiRunId
acceptedAiContent
actorId
createdAt
```

## Decision types

```text
TRIAGE_DECISION
FALSE_POSITIVE_DECISION
INCIDENT_DECLARATION
RESPONSE_RECOMMENDATION
CONTROL_REVIEW
CASE_CLOSURE
```

## API

```http
POST /api/v1/cases/:caseId/decisions
GET  /api/v1/cases/:caseId/decisions
```

## Done condition

```text
Human decision is stored separately from AI output.
Decision links to supporting evidence.
Decision identifies actor and timestamp.
Case timeline includes the decision.
```

---

# 21. Step 17 — Response recommendation and simulation

## Owner

Developer C.

ERB-01 supports:

```text
R0 — Observe
R1 — Recommend
Simulation
```

It does not enable live R2 or higher automated actions.

## Example recommendations

```text
Reset user sessions
Disable user account
Block IP address
Isolate endpoint
Rotate API key
Create ticket
Notify tenant administrator
```

## Response proposal fields

```text
proposalId
tenantId
caseId
actionType
targetType
targetId
reason
authorityLevel
requiredApproval
blastRadius
rollbackPlan
expiresAt
status
createdBy
```

## Proposal flow

```text
Analyst or AI drafts recommendation
→ Validate action type
→ Determine authority level
→ Determine target and blast radius
→ Attach evidence
→ Add approval requirement
→ Add rollback or compensation plan
→ Human approves simulation
→ Generate simulation command
→ Execute against mock customer endpoint
→ Record receipt
```

## Response tables

```sql
CREATE SCHEMA IF NOT EXISTS response;

CREATE TABLE response.proposals (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    case_id UUID NOT NULL,

    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255) NOT NULL,

    authority_level VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,

    blast_radius JSONB NOT NULL,
    rollback_plan JSONB,

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    expires_at TIMESTAMPTZ,

    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE response.simulation_receipts (
    id UUID PRIMARY KEY,

    tenant_id UUID NOT NULL,
    proposal_id UUID NOT NULL REFERENCES response.proposals(id),

    command_id UUID NOT NULL,
    simulated_target JSONB NOT NULL,

    result VARCHAR(30) NOT NULL,
    observed_effect JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Response APIs

```http
POST /api/v1/cases/:caseId/response-proposals
GET  /api/v1/cases/:caseId/response-proposals

POST /api/v1/response-proposals/:proposalId/approve
POST /api/v1/response-proposals/:proposalId/reject
POST /api/v1/response-proposals/:proposalId/simulate

POST /api/v1/response/freeze
POST /api/v1/response/unfreeze
GET  /api/v1/response/freeze-status
```

## Receipt states

```text
ACCEPTED
SIMULATED
VERIFIED
FAILED
PARTIALLY_EXECUTED
UNKNOWN
```

`UNKNOWN` must never be treated as successful.

## Done condition

```text
Case can create a response recommendation.
Recommendation contains authority and evidence.
Simulation produces a receipt.
Freeze switch blocks simulation or action issuance.
No real customer action is executed.
```

---

# 22. Step 18 — Audit-package generation

## Owner

Developer C.

## Audit package contents

```text
Tenant and environment scope
Package time range
Evidence manifest
Evidence records
Control evaluations
Case decisions
AI-use disclosures
Response recommendations
Known gaps
Limitations
Ledger proofs
Signed checkpoints
Witness receipts
Package metadata
Verifier instructions
```

## Package flow

```text
Authorized user selects scope and time range
→ Freeze evidence manifest
→ Select control evaluations
→ Select cases and decisions
→ Include AI disclosures
→ Include evidence ledger proofs
→ Include checkpoint and witness receipts
→ Generate package
→ Calculate package hash
→ Store package
→ Export ZIP
→ Verify using verifier CLI
```

## APIs

```http
POST /api/v1/audit-packages
GET  /api/v1/audit-packages
GET  /api/v1/audit-packages/:packageId

POST /api/v1/audit-packages/:packageId/finalize
GET  /api/v1/audit-packages/:packageId/export
POST /api/v1/audit-packages/:packageId/verify
```

## Example package structure

```text
audit-package.zip
├── package-manifest.json
├── tenant-scope.json
├── evidence/
├── control-evaluations/
├── cases/
├── ai-disclosures/
├── ledger/
├── checkpoints/
├── witness-receipts/
├── limitations.json
└── verification-instructions.json
```

## Done condition

```text
A package can be generated from synthetic tenant data.
Package contains evidence and control results.
Known gaps are visible.
Package has a stable cryptographic digest.
Package passes offline verification.
```

---

# 23. Step 19 — Offline verifier

## Owner

Developer C.

## Command

```bash
zoikoshield-verifier verify ./audit-package.zip
```

## Verifier checks

```text
Package manifest exists
Package hash matches
Evidence content hashes match
Ledger chain is valid
Sequence numbers are valid
Checkpoint signature is valid
Merkle proof is valid
Witness receipt is valid
No required file is missing
Limitations are declared
```

## Example output

```text
ZoikoShield Audit Package Verification

Package ID: AP-ERB01-0001
Tenant Scope: tenant-001
Package Integrity: VALID
Evidence Records: 42
Ledger Chain: VALID
Checkpoint Signature: VALID
Witness Receipt: VALID
Known Gaps: 2

Overall Result: VERIFIED WITH DECLARED LIMITATIONS
```

## Done condition

```text
Verifier works without calling ZoikoShield APIs.
Modified evidence causes verification failure.
Missing files cause verification failure.
Declared limitations remain visible.
```

---

# 24. Step 20 — Dashboard and reporting APIs

## Owners

All three developers.

## Tenant dashboard APIs

```http
GET /api/v1/dashboard/overview
GET /api/v1/dashboard/connectors
GET /api/v1/dashboard/events
GET /api/v1/dashboard/alerts
GET /api/v1/dashboard/cases
GET /api/v1/dashboard/control-health
GET /api/v1/dashboard/evidence-health
```

## Overview response

```json
{
  "connectors": {
    "total": 5,
    "healthy": 4,
    "degraded": 1
  },
  "events": {
    "received24h": 15243,
    "quarantined24h": 12
  },
  "alerts": {
    "open": 18,
    "critical": 2
  },
  "cases": {
    "open": 7,
    "investigating": 3
  },
  "controls": {
    "effective": 24,
    "partial": 6,
    "unknown": 3
  },
  "evidence": {
    "current": 40,
    "stale": 2,
    "missing": 1
  }
}
```

## Important UI state support

Every API should be able to represent:

```text
LOADING
READY
PARTIAL
STALE
DEGRADED
UNAUTHORIZED
UNAVAILABLE
RECOVERING
```

## Done condition

```text
Frontend can load tenant overview.
Connector gaps are visible.
Evidence and control unknown states are visible.
Dashboard data is tenant-scoped.
```

---

# 25. Step 21 — Notifications

## Owner

Developer A.

## Notification types

```text
Invitation received
Connector unauthorized
Connector stopped sending logs
Critical alert created
Case assigned
Evidence became stale
Control evaluation changed
AI request failed
Response simulation completed
Audit package ready
```

## Channels

Start with:

```text
In-app
Email
```

Add later:

```text
Slack
Microsoft Teams
Webhook
SMS
```

## API endpoints

```http
GET   /api/v1/notifications
PATCH /api/v1/notifications/:notificationId/read
PATCH /api/v1/notifications/read-all
```

## Done condition

```text
Critical backend events create notifications.
Notifications contain tenant context.
Users only receive permitted tenant notifications.
```

---

# 26. Step 22 — Audit logging

## Owner

Developer A.

## Operations requiring audit events

```text
Login
Logout
Failed login
Tenant creation
Member invitation
Role change
Connector creation
Connector credential change
Connector activation
Detection rule change
Case transition
Evidence creation
Control evaluation
AI request
AI human review
Response proposal
Response simulation
Freeze change
Audit-package generation
Export
```

## Audit event fields

```text
auditEventId
tenantId
environmentId
actorId
workloadId
action
resourceType
resourceId
outcome
reason
requestId
traceId
ipAddress
userAgent
occurredAt
```

## Done condition

```text
Every privileged and material operation has an audit event.
Audit events cannot be edited through normal APIs.
Tenant users cannot access another tenant’s audit records.
```

---

# 27. Step 23 — Observability

## Owners

All three developers.

## Monitor

```text
API latency
API errors
Database health
Redis health
Queue lag
Ingestion acceptance
Quarantine count
Connector freshness
Detection execution
Alert generation
Case transition failures
Evidence freshness
Ledger verification
Checkpoint generation
AI latency
AI cost
AI failure rate
Response simulation
Audit-package generation
```

## Required trace path

```text
API request
→ Tenant context
→ Connector or module call
→ Event processing
→ Detection
→ Alert
→ Case
→ Evidence
→ AI
→ Response proposal
→ Audit package
```

## Done condition

```text
Requests have trace IDs.
Errors identify affected tenant without exposing sensitive data.
Dashboards show service and connector health.
Alerts exist for critical service failures.
```

---

# 28. Step 24 — Testing

## Developer A tests

```text
Authentication tests
OAuth tests
Session tests
Tenant-isolation tests
Role and permission tests
Invitation tests
Cross-tenant API tests
Migration tests
```

## Developer B tests

```text
Webhook authentication tests
Malformed-event tests
Duplicate-event tests
Normalization tests
Quarantine tests
Replay tests
Detection tests
Alert tests
Case-state tests
Connector outage tests
```

## Developer C tests

```text
Evidence hashing tests
Ledger-chain tests
Tampering tests
Checkpoint tests
Verifier tests
Control-evaluation tests
AI citation tests
Prompt-injection tests
Response simulation tests
Freeze tests
```

## Shared end-to-end test

```text
Create user
→ Login
→ Create tenant
→ Complete onboarding
→ Invite analyst
→ Configure webhook connector
→ Send failed-login events
→ Normalize events
→ Trigger detection
→ Create alert
→ Create case
→ Record evidence
→ Generate AI summary
→ Record human decision
→ Create response proposal
→ Run simulation
→ Evaluate control
→ Generate audit package
→ Verify package offline
```

## Done condition

```text
Full end-to-end test passes.
Cross-tenant negative tests pass.
Modified evidence fails verification.
AI failure does not stop deterministic functions.
Restore and replay tests pass.
```

---

# 29. Step 25 — Release process

## Release pipeline

```text
Developer opens pull request
→ Lint and type checking
→ Unit tests
→ Architecture tests
→ Migration validation
→ Contract tests
→ Security scanning
→ Dependency scanning
→ Integration tests
→ Build Docker images
→ Generate SBOM
→ Sign artifacts
→ Deploy to staging
→ Run end-to-end tests
→ Run tenant-isolation tests
→ Run evidence-verifier tests
→ Run restore tests
→ Generate release manifest
→ Review and approval
→ Deploy
→ Reconcile runtime state
```

## Release blockers

Do not release when:

```text
Cross-tenant access is possible
A production resource is unmanaged
An artifact is unsigned
A migration cannot roll back safely
Evidence verification fails
A critical restore has not been tested
A connector exposes plain credentials
AI can bypass tool policy
Response freeze does not work
A prohibited region route exists
```

The infrastructure baseline identifies cross-tenant paths, unsigned artifacts, uncontrolled drift, missing rollback, failed evidence reconciliation, untested restoration, and prohibited region routes as release blockers.

---

# 30. Final building order

The team should build the modules in this order:

```text
1. Repository and database setup
2. Authentication
3. OAuth
4. Organization onboarding
5. Tenant creation
6. Legal entity and environment
7. Membership and roles
8. Canonical tenant context
9. Tool and connector catalog
10. Connector configuration
11. Webhook/syslog ingestion
12. Raw-event storage
13. Log validation
14. Log normalization
15. Asset and identity context
16. Detection engine
17. Alert generation
18. Case management
19. Evidence records
20. Evidence ledger
21. Control evaluation
22. AI-assisted case summary
23. Human decision recording
24. Response recommendation
25. Response simulation
26. Audit-package generation
27. Offline verifier
28. Dashboard APIs
29. Notifications
30. Observability
31. Security testing
32. Restore and replay testing
33. Release evidence
34. ERB-01 demo
```

---

# 31. Final ERB-01 demonstration

The completed ZoikoShield MVP should demonstrate:

```text
1. The approved bootstrap user authenticates through federation or an approved password-fallback account.

2. User creates an organization.

3. System creates:
   - tenant
   - organization
   - legal entity
   - default environment
   - tenant membership
   - Tenant Owner role

4. Tenant Owner invites a Security Analyst.

5. Tenant Admin configures a generic webhook connector.

6. Connector connection is tested and activated.

7. Synthetic failed-login logs are sent to the webhook.

8. Backend:
   - verifies the connector
   - resolves the tenant
   - stores the raw payload
   - validates the schema
   - normalizes the event
   - records provenance

9. Detection engine detects repeated failed logins.

10. System creates an alert.

11. Analyst promotes the alert into a case.

12. System records supporting evidence.

13. AI generates a case summary with evidence citations.

14. Analyst accepts, edits or rejects the AI output.

15. Analyst records the human decision.

16. System creates a session-reset response recommendation.

17. Analyst approves response simulation.

18. Mock customer endpoint returns a simulation receipt.

19. Control evaluator checks the related identity-security control.

20. System creates an audit package.

21. Audit package contains:
    - evidence
    - control evaluation
    - case decision
    - AI disclosure
    - simulation receipt
    - ledger proof
    - known limitations

22. Offline verifier confirms package integrity.
```

## Final success statement

```text
ZoikoShield ERB-01 is complete when an authenticated tenant can onboard, configure a security source, ingest and normalize logs, execute a deterministic detection, investigate a case, preserve evidence, use human-reviewed AI assistance, simulate a governed response, evaluate a control, and export an independently verifiable audit package.
```
