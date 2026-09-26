/**
 * Database access policy: which PostgreSQL role each service connects as,
 * what it may touch, and how every table is isolated by tenant.
 *
 * ZoikoShield combined engineering spec §11.1 and §15:
 *   - one schema namespace per module, enforced by database roles;
 *   - tenant-aware row-level security on pooled authoritative tables, with
 *     bypass restricted and monitored;
 *   - any path able to omit tenant scope is a P0 release blocker unless it is
 *     an approved platform-wide control with independent authorization/audit.
 *
 * scripts/apply-database-access.js applies this file after every
 * `prisma migrate deploy`. It is idempotent, and it refuses to finish while any
 * table in a managed schema is unclassified, so a new table cannot ship
 * without an isolation decision. apps/shield-core/test/database-access-policy.spec.ts
 * checks the same against the Prisma schema in CI.
 *
 * Plain CommonJS with no dependencies so the migrate image can run it as is.
 */

/** Service group roles (NOLOGIN). Login users are granted membership per environment. */
const SERVICE_ROLES = {
  shield_core_app: {
    service: 'shield-core',
    // The modular monolith hosts most modules, and tenant offboarding erases
    // tenant rows in every schema, so it holds DML on all of them. Module
    // boundaries inside it are enforced by the CI architecture test.
    allSchemas: true,
  },
  shield_ingest_app: {
    service: 'shield-ingest',
    ownSchemas: ['ingest'],
    tables: {
      'messaging.OutboxEvent': 'readwrite',
      'resources.ResourceObservation': 'readwrite',
      'case_management.Case': 'read',
      'case_management.CaseDecision': 'readwrite',
      'case_management.CaseEvidence': 'readwrite',
      'alert.Alert': 'readwrite',
      'metering.UsageRecord': 'readwrite',
      'evidence.EvidenceRecord': 'readwrite',
      'security_context.Asset': 'readwrite',
      'security_context.IdentityEntity': 'readwrite',
      // Read-only: the resolver writes decisions through its own path; the
      // asset context API only reads them back for the W29 review queue.
      'security_context.ResolutionDecision': 'read',
      'controls.ControlObjective': 'readwrite',
      'controls.ControlImplementation': 'read',
      'assessments.EvidenceGap': 'read',
      'risk.ControlDeficiency': 'read',
    },
  },
  shield_ai_app: {
    service: 'shield-ai',
    ownSchemas: ['ai'],
    tables: {
      'commercial.Entitlement': 'read',
      'case_management.InvestigationHypothesis': 'read',
      'ai_governance.AiUsageRecord': 'read',
      'ai_governance.AiGovernanceProfile': 'read',
    },
  },
  shield_action_app: {
    service: 'shield-action',
    ownSchemas: ['action'],
    tables: {
      'messaging.OutboxEvent': 'readwrite',
      'messaging.InboxEvent': 'readwrite',
      'response_proposal.Freeze': 'readwrite',
    },
  },
  shield_anchor_app: {
    service: 'shield-anchor',
    ownSchemas: ['anchor'],
    tables: {
      'messaging.OutboxEvent': 'readwrite',
    },
  },
};

/**
 * Isolation kind per table, keyed "schema.table" (database names).
 *
 * A table not listed here that has a NOT NULL tenant_id (or "tenantId")
 * column is classified `tenant` automatically. Everything else must be listed.
 *
 *   tenant            tenant_id = the session tenant. Where the column allows
 *                     NULL, a NULL row is visible only in platform scope.
 *   tenant_or_shared  NULL tenant_id marks a shared definition: readable by
 *                     every tenant, writable only in platform scope.
 *   tenant_or_account NULL tenant_id rows are visible as `account` rows.
 *   tenant_or_parent  NULL tenant_id rows are visible when `parent` is.
 *   account           commercial_account_id (or `column`) is bound to the
 *                     session tenant through CommercialAccountTenantBinding.
 *                     One commercial account can bind several tenants, so
 *                     these rows cannot carry a single tenant_id.
 *   account_or_shared NULL account marks a shared row, readable by all.
 *   parent            visible exactly when the parent row is: the policy's
 *                     subquery is itself filtered by the parent's policy.
 *   tenant_pair       either of two tenant columns matches.
 *   group_account     visible when any member account is.
 *   global            shared reference data or platform operations: no row
 *                     policy; access is the service grant plus the app's
 *                     permission guards.
 *   control_plane     identity and authorization plane, read before a tenant
 *                     is established (login, membership resolution), so it
 *                     cannot be tenant-filtered. It is the approved
 *                     platform-wide control of spec §15, covered by the
 *                     identity-adapter and authorization audit trails.
 *
 * Every row policy also admits platform scope (see scripts/apply-database-access.js).
 */
const TABLES = {
  // ---- control plane
  'identity.principals': { kind: 'control_plane' },
  'identity.local_credentials': { kind: 'control_plane' },
  'identity.external_identities': { kind: 'control_plane' },
  'identity.external_identity_tenant_bindings': { kind: 'control_plane' },
  'identity.identity_provider_configurations': { kind: 'control_plane' },
  'identity.federation_transactions': { kind: 'control_plane' },
  'identity.identity_events': { kind: 'control_plane' },
  'identity.policy_documents': { kind: 'control_plane' },
  'identity.policy_acceptances': { kind: 'control_plane' },
  'identity.recovery_grants': { kind: 'control_plane' },
  'identity.saml_request_cache': { kind: 'control_plane' },
  'identity.sessions': { kind: 'control_plane' },
  'identity.verification_challenges': { kind: 'control_plane' },
  'identity.webauthn_challenges': { kind: 'control_plane' },
  'identity.webauthn_credentials': { kind: 'control_plane' },
  'authorization.invitations': { kind: 'control_plane' },
  'authorization.jit_elevation_requests': { kind: 'control_plane' },
  'authorization.permissions': { kind: 'control_plane' },
  'authorization.role_permissions': { kind: 'control_plane' },
  'authorization.roles': { kind: 'control_plane' },
  'authorization.tenant_memberships': { kind: 'control_plane' },
  'authorization.user_roles': { kind: 'control_plane' },
  'tenant.tenants': { kind: 'control_plane' },

  // ---- global reference data and platform operations
  'catalog.CatalogVersion': { kind: 'global' },
  'catalog.Product': { kind: 'global' },
  'cpq.DiscountAuthorityPolicy': { kind: 'global' },
  'cpq.CpqOfferReadiness': { kind: 'global' },
  'resources.ProtectedResourceDefinition': { kind: 'global' },
  'ai.AiUseCase': { kind: 'global' },
  'ai.ModelProfile': { kind: 'global' },
  'ai.PromptProfile': { kind: 'global' },
  'commercial.ClaimRegister': { kind: 'global' },
  'commercial.ClaimApproval': { kind: 'global' },
  'detection.DetectionDefinition': { kind: 'global' },
  'detection.DetectionVersion': { kind: 'global' },
  'dunning.DunningPolicy': { kind: 'global' },
  'metering.MeterDefinition': { kind: 'global' },
  'controls.Framework': { kind: 'global' },
  'controls.FrameworkVersion': { kind: 'global' },
  'controls.Requirement': { kind: 'global' },
  'controls.ControlObjective': { kind: 'global' },
  'controls.ControlMapping': { kind: 'global' },
  'controls.ControlTest': { kind: 'global' },
  'controls.ControlTestVersion': { kind: 'global' },
  'assessments.Evaluator': { kind: 'global' },
  'assessments.EvaluatorVersion': { kind: 'global' },
  'notification.NotificationPolicy': { kind: 'global' },
  'notification.NotificationTemplate': { kind: 'global' },
  'anchor.SigningKey': { kind: 'global' },
  'anchor.WitnessReceipt': { kind: 'global' },
  'reconciliation.ReconciliationRun': { kind: 'global' },
  'reconciliation.ReconciliationIssue': { kind: 'global' },
  'tax.TaxRule': { kind: 'global' },
  'sla.SlaDefinition': { kind: 'global' },
  'kill_switch.CommercialKillSwitch': { kind: 'global' },
  'reporting.ReportDefinition': { kind: 'global' },
  'response_proposal.PlaybookDefinition': { kind: 'global' },
  'response_proposal.PlaybookVersion': { kind: 'global' },
  'sector_packs.SectorPack': { kind: 'global' },
  'sector_packs.MarketAvailability': { kind: 'global' },
  'ingest.ConnectorDefinition': { kind: 'global' },
  // Replay-protection hashes only; no tenant content.
  'ingest.webhook_replay_nonces': { kind: 'global' },
  // Partners (MSSPs, resellers) span tenants; their per-tenant authority is
  // PartnerDelegation, which is tenant-keyed.
  'partners.Partner': { kind: 'global' },
  'partners.PartnerAgreement': { kind: 'global' },
  'partners.PartnerSettlement': { kind: 'global' },
  'partners.PartnerPrincipalContext': { kind: 'global' },

  // ---- commercial-account scoped
  'commercial.CommercialAccount': { kind: 'account', column: 'id' },
  'commercial.GroupAccount': { kind: 'group_account' },
  'commercial.CorporateTransfer': {
    kind: 'tenant_pair',
    columns: ['source_tenant_id', 'target_tenant_id'],
  },
  'commercial.PaymentMethodReference': { kind: 'account' },
  'commerce.Contract': { kind: 'account' },
  'billing.CommercialInvoice': { kind: 'account' },
  'payments.Payment': { kind: 'account' },
  'cpq.CommercialSubscription': { kind: 'account' },
  'catalog.PriceBook': { kind: 'account_or_shared' },

  // ---- children visible through their parent
  'cpq.CommercialOrderLine': {
    kind: 'parent',
    parent: 'cpq.CommercialOrder',
    fk: 'order_id',
  },
  'cpq.BundleCostAllocation': {
    kind: 'parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'dunning.DunningCase': {
    kind: 'parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'sla.SlaMeasurement': {
    kind: 'parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'sla.ServiceCredit': {
    kind: 'parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'billing.CommercialInvoiceLine': {
    kind: 'parent',
    parent: 'billing.CommercialInvoice',
    fk: 'invoice_id',
  },
  'billing.CommercialInvoiceLineBasis': {
    kind: 'parent',
    parent: 'billing.CommercialInvoiceLine',
    fk: 'invoice_line_id',
  },
  'billing.CommercialInvoiceLineTrace': {
    kind: 'parent',
    parent: 'billing.CommercialInvoice',
    fk: 'invoice_id',
  },
  'billing.CommercialCreditNote': {
    kind: 'parent',
    parent: 'billing.CommercialInvoice',
    fk: 'invoice_id',
  },
  'billing.CommercialDebitNote': {
    kind: 'parent',
    parent: 'billing.CommercialInvoice',
    fk: 'invoice_id',
  },
  'payments.Refund': {
    kind: 'parent',
    parent: 'payments.Payment',
    fk: 'payment_id',
  },

  // ---- nullable tenant_id: what a NULL tenant means
  'response_proposal.Freeze': { kind: 'tenant_or_shared' }, // a global freeze binds every tenant
  'controls.Obligation': { kind: 'tenant_or_shared' },
  'assessments.ExpectedEvidenceRule': { kind: 'tenant_or_shared' },
  'ingest.detection_rules': { kind: 'tenant_or_shared' },
  'cpq.CommercialOrder': { kind: 'tenant_or_account' },
  'obligations.ServiceObligation': {
    kind: 'tenant_or_parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'cpq.CommercialAmendment': {
    kind: 'tenant_or_parent',
    parent: 'cpq.CommercialSubscription',
    fk: 'subscription_id',
  },
  'ir_work_orders.IncidentWorkOrder': {
    kind: 'tenant_or_parent',
    parent: 'commerce.Contract',
    fk: 'contract_id',
  },
  'commercial.CommercialEvent': { kind: 'tenant' },
  'approvals.CommercialApproval': { kind: 'tenant' },
  'idempotency.IdempotencyRecord': { kind: 'tenant' },
  'ai_governance.AiProviderCostEvent': { kind: 'tenant' },
  'cost_records.CostRecord': { kind: 'tenant' },
};

/**
 * Binding states under which a tenant sees its commercial account's records.
 * An ENDED, REVOKED or TRANSFERRED binding no longer grants visibility.
 */
const VISIBLE_BINDING_STATES = ['ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'];

/** Schemas this policy does not manage. */
const UNMANAGED_SCHEMAS = ['public', 'shield_rls'];

module.exports = {
  SERVICE_ROLES,
  TABLES,
  VISIBLE_BINDING_STATES,
  UNMANAGED_SCHEMAS,
};
