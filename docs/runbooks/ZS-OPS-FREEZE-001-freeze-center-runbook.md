# Emergency Freeze Center & Freeze-Recovery Runbook

**Standard Operating Procedure**: `ZS-OPS-FREEZE-001`  
**Governing Standards**: `ZS-ENG-DRS-001 §19.4` (Emergency Freeze Lockdown), `ADR-22` (Email Security Phased Authority), `TUT-02` / `TUT-09` (Fail-Closed Containment)  
**Executing Teams**: SOC Lead / Incident Commander / SRE On-Call  
**Accountable DRI**: Security Operations & Platform Engineering  
**Dual-Custody Unfreeze Authority**: Security Director + Platform Engineering Lead (required for `GLOBAL` and `REGIONAL` scopes)  
**UI Surface**: `/freeze` ([Freeze Center](../../frontend/src/app/freeze/page.tsx)) and `/actions` ([SOAR Actions & Freeze](../../frontend/src/app/actions/console.tsx))  

---

## 1. Purpose & Safety Invariants

The Emergency Freeze Center provides an immediate, fail-closed kill switch halting live automated SOAR and Phase 2 post-delivery email mutations (`QUARANTINE_MESSAGE`, `PULL_BACK_MESSAGE`, `REMOVE_FORWARDING_RULE`, `REVOKE_MAILBOX_SESSIONS`) before any provider mutation call leaves `shield-action`.

Non-negotiable safety invariants:
1. **Fail-Closed Enforcement**: `EmailActionAdapterService.execute()` (`backend/apps/shield-action/src/email-actions/email-action-adapter.service.ts`) evaluates `FreezeControllerService.isFrozen()` in precedence order (`GLOBAL` -> `TENANT` -> `ACTION_TYPE` -> `CONNECTOR`) before per-tenant command signing and before calling `GraphGmailMutationClient.mutate()`. Any match raises `ForbiddenException('ACTION_FROZEN: ...')`.
2. **Dry-Run & Simulation Remain Available**: Non-mutating pre-flight simulation (`POST /api/v1/email/actions/:id/simulate`) continues to work during an active freeze so responders can plan containment without touching customer mailboxes.
3. **No Silent Unfreeze on High-Impact Scopes**: `GLOBAL` and `REGIONAL` freezes registered in `EmergencyFreezeLockdownService` require **2 distinct approvers** (`approveUnfreeze`) to lift.
4. **Reconcile Before Retrying `UNKNOWN`**: Lifting a freeze does **not** authorize blind retries of actions that entered `UNKNOWN` or `PARTIAL` before the freeze engaged. Always reconcile provider mailbox state first (spec T28).

---

## 2. When to Engage a Freeze (Scope Selection Matrix)

| Scope | Trigger Conditions | Example `scopeRef` | Unfreeze Authority |
| :--- | :--- | :--- | :--- |
| `TENANT` | Suspected compromised tenant credentials, anomalous bulk email action proposals, or customer-requested hold during active incident | *(derived from `x-tenant-id`)* | Tenant Security Admin / SOC Lead |
| `CONNECTOR` | Microsoft Graph or Google Workspace write OAuth scope drift, elevated HTTP `429`/`5xx` error rates, or provider outage | `MICROSOFT_365`, `GOOGLE_WORKSPACE` | SOC Lead + Connector Owner |
| `ACTION_TYPE` | Defect or unexpected blast radius in a single remediation primitive (e.g. `PULL_BACK_MESSAGE` misclassifying targets) | `QUARANTINE_MESSAGE`, `PULL_BACK_MESSAGE`, `REMOVE_FORWARDING_RULE`, `REVOKE_MAILBOX_SESSIONS` | SOC Lead |
| `REGIONAL` | Regional cell partition, KMS signing degradation, or regional compliance hold | `eu-west-1`, `us-central1` | **Dual Custody (2 distinct approvers)** |
| `GLOBAL` | Suspected platform-wide compromise, signing-key incident, or runaway automation across tenants | `GLOBAL` | **Dual Custody (2 distinct approvers)** |

---

## 3. Procedure A — Engaging an Emergency Freeze

### Step 1: Engage via Freeze Center UI (`/freeze`)
1. Open **Respond -> Freeze Center** (`/freeze`), or click **Freeze Center** from `/cases/incidents/command` or `/email/actions`.
2. Select the narrowest effective **Freeze Scope** from the matrix above.
3. If using `CONNECTOR`, `ACTION_TYPE`, or `REGIONAL`, enter the exact **Target Scope Reference** (e.g., `MICROSOFT_365` or `QUARANTINE_MESSAGE`).
4. Select an appropriate **Review / Auto-Expiry Window** (`60 minutes` is default for active containment; use `Indefinite` for security incidents pending forensic clearance).
5. Enter a mandatory **Justification & Incident Reference** (e.g. `INC-2026-441: Suspected M365 write token anomaly`).
6. Click **Engage Emergency Freeze** and confirm the status badge changes to `LOCKDOWN ACTIVE` and the live announcement confirms backend persistence.

### Step 2: Break-Glass API Path (If UI Is Unavailable)
```bash
# Tenant freeze via shield-core (JWT + x-tenant-id required)
curl -fsS -X POST "$SHIELD_CORE_URL/api/v1/response/freeze" \
  -H "Authorization: Bearer $OPERATOR_JWT" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"reason":"INC-2026-441: Emergency freeze during email action investigation"}'

# Scoped freeze directly in shield-action (internal workload auth required)
curl -fsS -X POST "$SHIELD_ACTION_URL/api/v1/actions/freeze" \
  -H "Authorization: Bearer $WORKLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'"$TENANT_ID"'",
    "scope": "CONNECTOR",
    "scopeRef": "MICROSOFT_365",
    "reason": "INC-2026-441: M365 Graph 5xx burst",
    "actorId": "'"$OPERATOR_ID"'",
    "durationMinutes": 60
  }'
```

### Step 3: Verify Freeze Enforcement
1. Confirm `GET /api/v1/response/freeze-status` returns `"frozen": true` and `"status": "FROZEN"`.
2. Check `/email/actions` for any queued proposals in `AUTHORISED` state; verify that live execution returns HTTP `403` with `ACTION_FROZEN`.
3. Record the freeze ID and timestamp in the active Incident Command timeline (`/cases/incidents/command`).

---

## 4. Procedure B — Pre-Unfreeze Verification & Safe Release

Never release a freeze until all four verification checks pass:

1. **Root Cause Cleared**: Confirm the triggering anomaly (provider outage, revoked/compromised write credential, Cedar policy drift, or misrouted proposal) is resolved and verified in audit logs.
2. **Audit Chain Intact**: Verify the tenant email audit hash chain via `GET /api/v1/email/audit/verify` returns `valid: true`.
3. **Unknown/Partial Outcomes Reconciled**: Inspect every `EmailActionProposal` in `UNKNOWN` or `PARTIAL` status against the live Microsoft 365 / Google Workspace admin audit logs. Confirm whether each target message/rule/session was mutated before authorizing any new proposal.
4. **Dry-Run Canary**: Where Phase 2 actions are enabled, run one approved canary proposal with `{"dryRun": true}` (`POST /api/v1/email/actions/:id/execute`) to verify target parsing, Cedar authorization, and per-tenant command signing without mutating mailboxes.

### Release Commands
- **UI**: Click **Release Tenant Freeze** in `/freeze` and confirm the status returns to `OPERATIONAL`.
- **API**:
  ```bash
  curl -fsS -X POST "$SHIELD_CORE_URL/api/v1/response/unfreeze" \
    -H "Authorization: Bearer $OPERATOR_JWT" \
    -H "x-tenant-id: $TENANT_ID"
  ```
- **Global / Regional Dual-Custody Unfreeze**: Submit two distinct `approverId` calls to `POST /api/v1/action/freeze/approve-unfreeze` with the same `freezeId`.

---

## 5. Database Verification Queries (Read-Only)

Run as a read-only operator within the target tenant scope (or audited platform scope):

```sql
-- Active freezes across all scopes
SELECT id, tenant_id, scope, scope_ref, reason, created_by, active_from, active_until
  FROM response_proposal."Freeze"
 WHERE active_from <= now()
   AND (active_until IS NULL OR active_until > now())
 ORDER BY active_from DESC;

-- Email action proposals blocked or requiring reconciliation during freeze window
SELECT id, tenant_id, provider, requested_action, risk_class, status, updated_at
  FROM email_security."EmailActionProposal"
 WHERE status IN ('AUTHORISED', 'UNKNOWN', 'PARTIAL', 'FAILED', 'COMPENSATING')
 ORDER BY updated_at DESC
 LIMIT 50;
```

---

## 6. Escalation & Related Documents

- **Incident Command Runbook**: [`ZS-OPS-INC-001-incident-command-runbook.md`](./ZS-OPS-INC-001-incident-command-runbook.md)
- **Game-Day Rehearsal (Drill 07 — Action Freeze)**: [`LAB18-production-rehearsal-runbook.md`](./LAB18-production-rehearsal-runbook.md)
- **Email Security Architecture**: [`docs/adrs/ADR-22-PROPOSAL-email-security-architecture.md`](../adrs/ADR-22-PROPOSAL-email-security-architecture.md)
