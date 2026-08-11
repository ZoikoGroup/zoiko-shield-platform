-- CreateTable
CREATE TABLE "SlaDefinition" (
    "id" TEXT NOT NULL,
    "sla_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metric" TEXT NOT NULL,
    "comparison" TEXT NOT NULL DEFAULT 'MIN',
    "target_value" DECIMAL(10,4) NOT NULL,
    "service_tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "region" TEXT NOT NULL DEFAULT 'GLOBAL',
    "measurement_window" TEXT NOT NULL DEFAULT 'MONTHLY',
    "credit_formula" TEXT NOT NULL DEFAULT '{}',
    "dispute_window_days" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaMeasurement" (
    "id" TEXT NOT NULL,
    "sla_definition_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "measured_value" DECIMAL(10,4) NOT NULL,
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "evidence_ref" TEXT,
    "measurement_source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCredit" (
    "id" TEXT NOT NULL,
    "sla_measurement_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "approval_id" TEXT,
    "credit_note_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentWorkOrder" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "incident_reference" TEXT NOT NULL,
    "activation_reason" TEXT NOT NULL,
    "response_authority" TEXT NOT NULL DEFAULT 'R1',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_by" TEXT NOT NULL,
    "included_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "consumed_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overage_policy" TEXT NOT NULL DEFAULT 'REQUIRE_APPROVAL',
    "overage_cap_hours" DECIMAL(8,2),
    "third_party_costs" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "customer_contact" TEXT,
    "evidence_refs" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "partner_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAgreement" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "margin_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "invoice_responsibility" TEXT NOT NULL DEFAULT 'ZOIKOSHIELD',
    "tax_responsibility" TEXT NOT NULL DEFAULT 'ZOIKOSHIELD',
    "support_responsibility" TEXT NOT NULL DEFAULT 'ZOIKOSHIELD',
    "renewal_rights" TEXT NOT NULL DEFAULT 'ZOIKOSHIELD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDelegation" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "commercial_account_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "granted_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSettlement" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "gross_amount" DECIMAL(14,4) NOT NULL,
    "commission_amount" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorPack" (
    "id" TEXT NOT NULL,
    "pack_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "jurisdiction" TEXT NOT NULL,
    "content_license_status" TEXT NOT NULL DEFAULT 'PENDING',
    "display_rights" BOOLEAN NOT NULL DEFAULT false,
    "required_connectors" TEXT NOT NULL DEFAULT '[]',
    "approved_claim_wording" TEXT,
    "release_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketAvailability" (
    "id" TEXT NOT NULL,
    "sector_pack_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "tool_calls" INTEGER NOT NULL DEFAULT 0,
    "retrieval_calls" INTEGER NOT NULL DEFAULT 0,
    "internal_cost" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "meter_event_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudget" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "budget_amount" DECIMAL(14,4) NOT NULL,
    "consumed_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "usage_class" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "allocation_method" TEXT NOT NULL DEFAULT 'DIRECT',
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "run_type" TEXT NOT NULL DEFAULT 'ON_DEMAND',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "issue_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationIssue" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "expected_value" TEXT NOT NULL,
    "actual_value" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialKillSwitch" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_value" TEXT,
    "blocked_actions" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "activated_by" TEXT NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deactivated_by" TEXT,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialKillSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaDefinition_status_idx" ON "SlaDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SlaDefinition_sla_key_version_key" ON "SlaDefinition"("sla_key", "version");

-- CreateIndex
CREATE INDEX "SlaMeasurement_contract_id_idx" ON "SlaMeasurement"("contract_id");

-- CreateIndex
CREATE INDEX "SlaMeasurement_sla_definition_id_idx" ON "SlaMeasurement"("sla_definition_id");

-- CreateIndex
CREATE INDEX "ServiceCredit_contract_id_idx" ON "ServiceCredit"("contract_id");

-- CreateIndex
CREATE INDEX "ServiceCredit_status_idx" ON "ServiceCredit"("status");

-- CreateIndex
CREATE INDEX "IncidentWorkOrder_contract_id_idx" ON "IncidentWorkOrder"("contract_id");

-- CreateIndex
CREATE INDEX "IncidentWorkOrder_status_idx" ON "IncidentWorkOrder"("status");

-- CreateIndex
CREATE INDEX "Partner_status_idx" ON "Partner"("status");

-- CreateIndex
CREATE INDEX "PartnerAgreement_partner_id_idx" ON "PartnerAgreement"("partner_id");

-- CreateIndex
CREATE INDEX "PartnerAgreement_status_idx" ON "PartnerAgreement"("status");

-- CreateIndex
CREATE INDEX "PartnerDelegation_partner_id_idx" ON "PartnerDelegation"("partner_id");

-- CreateIndex
CREATE INDEX "PartnerDelegation_commercial_account_id_idx" ON "PartnerDelegation"("commercial_account_id");

-- CreateIndex
CREATE INDEX "PartnerDelegation_status_idx" ON "PartnerDelegation"("status");

-- CreateIndex
CREATE INDEX "PartnerSettlement_partner_id_idx" ON "PartnerSettlement"("partner_id");

-- CreateIndex
CREATE INDEX "PartnerSettlement_status_idx" ON "PartnerSettlement"("status");

-- CreateIndex
CREATE INDEX "SectorPack_release_status_idx" ON "SectorPack"("release_status");

-- CreateIndex
CREATE UNIQUE INDEX "SectorPack_pack_key_version_key" ON "SectorPack"("pack_key", "version");

-- CreateIndex
CREATE INDEX "MarketAvailability_region_idx" ON "MarketAvailability"("region");

-- CreateIndex
CREATE UNIQUE INDEX "MarketAvailability_sector_pack_id_region_key" ON "MarketAvailability"("sector_pack_id", "region");

-- CreateIndex
CREATE INDEX "AiUsageRecord_tenant_id_idx" ON "AiUsageRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "AiUsageRecord_occurred_at_idx" ON "AiUsageRecord"("occurred_at");

-- CreateIndex
CREATE INDEX "AiBudget_tenant_id_idx" ON "AiBudget"("tenant_id");

-- CreateIndex
CREATE INDEX "AiBudget_status_idx" ON "AiBudget"("status");

-- CreateIndex
CREATE INDEX "CostRecord_tenant_id_idx" ON "CostRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "CostRecord_usage_class_idx" ON "CostRecord"("usage_class");

-- CreateIndex
CREATE INDEX "CostRecord_period_start_idx" ON "CostRecord"("period_start");

-- CreateIndex
CREATE INDEX "ReconciliationRun_status_idx" ON "ReconciliationRun"("status");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_run_id_idx" ON "ReconciliationIssue"("run_id");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_status_idx" ON "ReconciliationIssue"("status");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_domain_idx" ON "ReconciliationIssue"("domain");

-- CreateIndex
CREATE INDEX "CommercialKillSwitch_scope_type_scope_value_idx" ON "CommercialKillSwitch"("scope_type", "scope_value");

-- CreateIndex
CREATE INDEX "CommercialKillSwitch_status_idx" ON "CommercialKillSwitch"("status");

-- AddForeignKey
ALTER TABLE "SlaMeasurement" ADD CONSTRAINT "SlaMeasurement_sla_definition_id_fkey" FOREIGN KEY ("sla_definition_id") REFERENCES "SlaDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCredit" ADD CONSTRAINT "ServiceCredit_sla_measurement_id_fkey" FOREIGN KEY ("sla_measurement_id") REFERENCES "SlaMeasurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAvailability" ADD CONSTRAINT "MarketAvailability_sector_pack_id_fkey" FOREIGN KEY ("sector_pack_id") REFERENCES "SectorPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

