-- Rollback plan: DROP SCHEMA casework CASCADE;

CREATE SCHEMA IF NOT EXISTS casework;

-- 1. Create the casework.case table
CREATE TABLE casework.case (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    environment_id UUID,
    region_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID,
    schema_version INT NOT NULL DEFAULT 1,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    assigned_to UUID, -- plain UUID, no FK constraint yet
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE casework.case ENABLE ROW LEVEL SECURITY;
ALTER TABLE casework.case FORCE ROW LEVEL SECURITY;

CREATE POLICY case_isolation_policy ON casework.case 
FOR ALL 
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid 
    OR 
    current_setting('app.current_role', true) = 'platform_admin'
);

-- 2. Create the casework.note table
CREATE TABLE casework.note (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES casework.case(id),
    tenant_id UUID NOT NULL,
    environment_id UUID,
    region_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID,
    schema_version INT NOT NULL DEFAULT 1,
    
    content TEXT NOT NULL,
    author_id UUID, -- plain UUID, no FK constraint yet
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE casework.note ENABLE ROW LEVEL SECURITY;
ALTER TABLE casework.note FORCE ROW LEVEL SECURITY;

CREATE POLICY note_isolation_policy ON casework.note 
FOR ALL 
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid 
    OR 
    current_setting('app.current_role', true) = 'platform_admin'
);

CREATE INDEX idx_casework_note_case_id ON casework.note(case_id);

-- 3. Create the casework.outbox table
CREATE TABLE casework.outbox (
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

ALTER TABLE casework.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE casework.outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY casework_outbox_isolation_policy ON casework.outbox 
FOR ALL 
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid 
    OR 
    current_setting('app.current_role', true) = 'platform_admin'
);

CREATE INDEX idx_casework_outbox_tenant_id ON casework.outbox(tenant_id);
