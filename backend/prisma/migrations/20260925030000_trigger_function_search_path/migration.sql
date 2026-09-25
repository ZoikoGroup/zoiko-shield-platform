-- The integrity triggers from earlier migrations are PL/pgSQL functions in
-- public that name their tables unqualified ("RoadmapCommitment", ...). They
-- resolved through public until 20260925010000_module_schemas moved every
-- table into its module schema; from then on they raise "relation does not
-- exist" on the first INSERT or UPDATE they guard.
--
-- Each function gets a fixed search_path over the module schemas instead of
-- a rewritten body: table names are unique across schemas, so resolution is
-- unambiguous, and a pinned search_path also stops a caller's search_path
-- from redirecting a trigger to a look-alike table.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = pg_catalog, public, action, ai, ai_governance, alert, anchor, approvals, assessments, audit_package, authorization, authorization_decision, billing, case_management, catalog, commerce, commercial, continuous_assurance, controls, cost_records, cpq, detection, developer_api, dunning, evidence, export, human_authority, idempotency, identity, ingest, ir_work_orders, kill_switch, managed_defense, messaging, metering, notification, obligations, offboarding, partners, payments, privacy, professional_services, reconciliation, reporting, resources, response_proposal, risk, sector_packs, security_context, sla, tax, tenant, webhook',
      fn.signature
    );
  END LOOP;
END
$$;
