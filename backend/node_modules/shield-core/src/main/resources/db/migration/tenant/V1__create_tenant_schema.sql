-- Rollback plan: DROP SCHEMA tenant CASCADE;

CREATE SCHEMA IF NOT EXISTS tenant;

-- 1. Create the tenant table
CREATE TABLE tenant.tenant (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    environment_id UUID,
    region_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID,
    schema_version INT NOT NULL DEFAULT 1,
    
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- RLS Policy for tenant.tenant
ALTER TABLE tenant.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.tenant FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant.tenant 
FOR ALL 
USING (
    id = current_setting('app.current_tenant_id', true)::uuid 
    OR 
    current_setting('app.current_role', true) = 'platform_admin'
);

-- 2. Create the tenant.outbox table
CREATE TABLE tenant.outbox (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    tenant_id UUID NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID,
    causation_id UUID,
    idempotency_key VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    replay_status VARCHAR(50)
);

ALTER TABLE tenant.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_isolation_policy ON tenant.outbox 
FOR ALL 
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid 
    OR 
    current_setting('app.current_role', true) = 'platform_admin'
);

-- Index for efficient querying by tenant_id
CREATE INDEX idx_tenant_outbox_tenant_id ON tenant.outbox(tenant_id);
