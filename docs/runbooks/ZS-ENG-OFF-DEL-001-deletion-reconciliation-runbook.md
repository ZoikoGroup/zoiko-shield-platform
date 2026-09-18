# Tenant Deletion Reconciliation Campaign — Runbook

**Standard Operating Procedure**: SOP-OPS-OFFDEL-001
**Governing Standard**: ZS-ENG-OFF-DEL-001 §6 (Mandatory reconciliation of the historical defect)
**Executing team**: SRE / Database Operations
**Accountable DRI**: Platform Engineering
**Independent sign-off**: Security / Assurance
**Decision owner for exceptions**: Privacy / Legal (retention and legal-hold exceptions only)

---

## 1. Why this campaign exists

Between **13 August 2026** and the deployment of the SQL quoting fix, every tenant
erasure failed. `authorization` is a reserved word in PostgreSQL; written
unquoted, `DELETE FROM authorization.tenant_memberships …` is a syntax error, not
a schema reference. Because those statements shared a transaction with the
public-schema deletes, the error aborted the whole transaction and **nothing was
deleted** — while the surrounding orchestration could still move the run forward.

The defect is fixed. This campaign exists because "the transaction rolled back, so
the data is intact" is a *prediction*, and the standard requires every affected
run to be **independently reconciled rather than assumed**.

> **Expected finding:** affected tenants still hold their data and are
> inaccessible. That is the benign outcome. Treat anything else as an incident.

---

## 2. Scope

| Boundary | Value |
| --- | --- |
| Window opens | `2026-08-13 00:00:00+00` |
| Window closes | production deployment timestamp of the SQL fix (commit `03f69529`) — substitute the real value into the query below |
| Population | every `TenantOffboardingRun` initiated in the window |
| Environments | any environment that ran a tenant offboarding in the window |

**Environments with no offboarding history are out of scope.** At the time this
runbook was written the ZoikoShield development database contained zero
`TenantOffboardingRun`, `DeletionRequest`, `DeletionTask` and
`DeletionAttestation` rows, so no reconciliation was required there. Confirm the
same for each environment before concluding it is clean — do not assume it.

---

## 3. Safety invariants

These hold for every step. If one cannot be maintained, stop and escalate.

- **Access stays revoked.** A tenant in this population is already offboarded. A
  failed or incomplete purge is never a reason to restore access.
- **Legal hold and retention are hard gates.** Re-evaluate both against *today's*
  rules. Do not rely on the eligibility decision made during the original run.
- **No ad-hoc SQL purges.** Remediation runs through the deletion orchestrator so
  it produces the same evidence as any other purge. A direct SQL purge is an
  emergency control requiring change-board approval, peer review, and equivalent
  evidence.
- **Tenant scope is absolute.** Any cross-tenant effect is a severity-1
  integrity/security failure. Stop immediately.
- **Nothing is attested without a verification PASS.** This is enforced in code;
  do not attempt to work around it.

---

## 4. Step 1 — Build the candidate inventory

Substitute the real fix-deployment timestamp for `fix_deployed_at`, then run
against each environment's primary database as a read-only user.

> Run these as script files (`psql -f query.sql`). `\set` variables are not
> interpolated by `psql -c`, which fails with a syntax error at the `:`.

Both queries in this runbook were executed against the real schema before
publication, so the column and table names are current.

```sql
\set fix_deployed_at '2026-09-18 00:00:00+00'   -- REPLACE with production deploy time

SELECT
    run.id                                        AS offboarding_run_id,
    run.tenant_id,
    run.status                                    AS run_status,
    run.initiated_at,
    run.completed_at,
    request.id                                    AS deletion_request_id,
    request.status                                AS request_status,
    request.outcome,
    count(task.id) FILTER (WHERE task.status = 'COMPLETED')      AS tasks_completed,
    count(task.id) FILTER (WHERE task.status <> 'COMPLETED')     AS tasks_incomplete,
    count(DISTINCT attestation.id)                               AS attestations_issued,
    count(DISTINCT verification.id)
      FILTER (WHERE verification.result = 'PASS')                AS passing_verifications,
    string_agg(DISTINCT task.error_code, ' | ')                  AS error_signatures,
    max(task.last_checkpoint)                                    AS last_checkpoint
FROM "TenantOffboardingRun" run
LEFT JOIN "DeletionRequest"      request      ON request.id = run.deletion_request_id
LEFT JOIN "DeletionTask"         task         ON task.deletion_request_id = request.id
LEFT JOIN "DeletionAttestation"  attestation  ON attestation.deletion_request_id = request.id
LEFT JOIN "DeletionVerification" verification ON verification.deletion_request_id = request.id
WHERE run.initiated_at >= TIMESTAMPTZ '2026-08-13 00:00:00+00'
  AND run.initiated_at <  TIMESTAMPTZ :'fix_deployed_at'
GROUP BY run.id, request.id
HAVING
       run.status IN ('FAILED', 'BLOCKED', 'DELETING', 'ENGINEERING_REVIEW')
    OR count(task.id) FILTER (WHERE task.status <> 'COMPLETED') > 0
    OR (
         count(DISTINCT attestation.id) > 0
         AND count(DISTINCT verification.id) FILTER (WHERE verification.result = 'PASS') = 0
       )
ORDER BY run.initiated_at;
```

A row is a candidate if **any** of these is true:

1. the run ended in `FAILED`, `BLOCKED`, `ENGINEERING_REVIEW`, or is stuck in `DELETING`;
2. any store task did not reach `COMPLETED`;
3. an attestation was issued without a passing independent verification.

Criterion 3 will match **every** closure completed before this release, because
`DeletionVerification` did not exist then. That is intended: the standard asks for
any closure whose deletion evidence is missing or inconsistent. Those runs need
re-verification, not necessarily re-deletion.

Export the result set as the campaign's authoritative population and attach it to
the final report.

---

## 5. Step 2 — Confirm the tenant is still inaccessible

For each candidate `tenant_id`:

```sql
SELECT
    (SELECT count(*) FROM "authorization".tenant_memberships WHERE "tenantId" = :'tenant_id'::uuid) AS active_memberships,
    (SELECT count(*) FROM "authorization".roles            WHERE "tenantId" = :'tenant_id'::uuid) AS tenant_roles,
    (SELECT count(*) FROM "ApiClient" WHERE tenant_id = :'tenant_id' AND status = 'ACTIVE')       AS active_api_clients,
    (SELECT count(*) FROM "ConnectorInstance" WHERE tenant_id = :'tenant_id' AND "deletedAt" IS NULL) AS live_connectors;
```

> `authorization` **must stay quoted** — that is the entire original defect.

- All four counts zero → access is correctly revoked; proceed.
- Any count non-zero → **do not proceed**. Access survived an offboarding. Raise a
  security incident, re-freeze access, and escalate to Platform Engineering before
  any destructive step.

Record the original run id, error signature and last checkpoint for each tenant.

---

## 6. Step 3 — Re-evaluate eligibility against today's rules

Before any destructive remediation:

```sql
SELECT id, authority, reason, status, starts_at, ends_at
FROM "LegalHold"
WHERE tenant_id = :'tenant_id' AND status = 'ACTIVE';

SELECT id, basis, authority, period_days, effective_from, effective_to
FROM "TenantRetentionPolicy"
WHERE tenant_id = :'tenant_id'
ORDER BY effective_from DESC;
```

- **Active legal hold** → the tenant is blocked. Record the hold and its scope as a
  retained exception. Privacy/Legal owns the release decision; SRE does not.
- **No retention policy recorded** → deletion will refuse to run, by design. Get
  Privacy/Legal to record the authoritative period through
  `POST /api/v1/tenants/{tenantId}/offboarding/retention-policy` before retrying.
  Do **not** work around this with a platform default you chose yourself.
- **Retention not yet expired** → the run parks in `RETENTION_WAIT` and the
  scheduled worker resumes it automatically once the period elapses. Nothing to do.

---

## 7. Step 4 — Remediate through the orchestrator

Use the normal API. Completed stores are checkpoints and are not repeated; only
incomplete work runs again.

```bash
curl -X POST \
  "$SHIELD_CORE_URL/api/v1/tenants/$TENANT_ID/offboarding/resume-deletion" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"runId\":\"$ORIGINAL_RUN_ID\"}"
```

Pass the **original** run id so the remediation stays linked to the original
offboarding evidence. Requires `deletion:approve` and a step-up authenticated
session (`PASSWORD_MFA`, `FEDERATED_MFA` or `PASSKEY`).

If a store task has already reached `ENGINEERING_REVIEW`, the automatic worker
will not touch it and neither should you — that state means retries were exhausted
and a human has to determine why. Escalate to Platform Engineering.

---

## 8. Step 5 — Verify independently

The orchestrator runs verification itself and refuses to attest without a PASS.
Confirm the recorded result:

```bash
curl -s "$SHIELD_CORE_URL/api/v1/tenants/$TENANT_ID/offboarding/deletion-verification" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" | jq
```

| Field | Meaning |
| --- | --- |
| `result` | `PASS` or `FAIL` — only `PASS` permits attestation and closure |
| `residual_count` | **unauthorized** survivors; must be `0` |
| `retained_count` | deliberately kept records (legal hold, WORM retention, deletion-control tables) |
| `surfaces` | per-surface breakdown with the reason for each retention |

A non-zero `retained_count` is normal and is not a failure. Evidence bytes under
Object Lock cannot be destroyed before their retain-until date by anyone,
including root; they are rendered unreadable by tenant key shredding and the
physical expiry window is disclosed in the attestation rather than hidden.

On `FAIL`: do not attest. Re-run deletion for the specific failing surface and
verify again. Persistent failure → terminal engineering review; the tenant stays
inaccessible and closure is prohibited.

---

## 9. Step 6 — Close out and report

Attestation and closure follow the standard path
(`POST …/offboarding/issue-attestation`) and are only possible after a PASS.

The campaign report must record:

- the population reviewed (the Step 1 export, with the fix-deployment timestamp used);
- tenants remediated, with original run id, remediation run, and verification id;
- tenants blocked, with the hold or retention basis and the Privacy/Legal decision owner;
- residual exceptions and why each is authorised;
- evidence references (attestation ids, verification ids);
- final sign-off by Platform Engineering and Security/Assurance.

---

## 10. Escalation

| Condition | Action |
| --- | --- |
| Access survived an offboarding | Severity-1 security incident; re-freeze; halt campaign |
| Any cross-tenant effect observed | Severity-1 integrity failure; halt immediately |
| Task in `ENGINEERING_REVIEW` | Platform Engineering investigates; no further destructive action |
| Verification `FAIL` that will not clear | Terminal engineering review; closure prohibited; notify Security/Assurance |
| Legal hold or retention conflict | Privacy/Legal decides; SRE does not override |
