# Incident Command (W19) Operational Runbook

**Standard Operating Procedure**: `ZS-OPS-INC-001`  
**Governing Contract**: Experience Contract `W19` (Incident Command), `ZS-ENG-DRS-001` (Governed Response), `ADR-22` (Email Security)  
**Executing Teams**: Incident Commander (IC), SOC Lead, Communications Lead, Scribe, Security Director  
**UI Surface**: `/cases/incidents/command` ([Incident Command Page](../../frontend/src/app/cases/incidents/command/page.tsx))  

---

## 1. Purpose & Contract Scope

The Incident Command surface (`/cases/incidents/command`) consolidates live command telemetry for active (`status NOT IN ('CLOSED', 'RESOLVED')`) cases in a single fail-closed view backed by `shield-core`:

1. **Scope & Severity** (`GET /api/v1/cases/:id`): Case title, severity, priority, status, environment, region, primary asset, primary identity, incident ID, correlation ID.
2. **Roles**: Displays `owner_id`, `queue_id`, `created_by`. **Known Contract Disclosure**: `shield-core` does not yet persist distinct Incident Commander / Comms Lead / Scribe role assignments (`UnbackedField` on `/cases/incidents/command`) — record role handoffs explicitly in internal case notes and shift handover (`/operations/shift-handover`).
3. **SLA Clocks** (`GET /api/v1/cases/:id/sla`): Coverage tier, target response minutes, elapsed vs. target, pause timestamps/reasons, breach status.
4. **Decisions** (`GET /api/v1/cases/:id/decisions`): Decision type, rationale, actor, policy version, and cited evidence references.
5. **Communications** (`GET /api/v1/cases/:id/notes`): Strict visual separation between `CUSTOMER_VISIBLE` communications and `INTERNAL` analyst notes.
6. **Recovery**: Status, disposition, resolution timestamps, and containment/eradication/recovery timeline milestones.
7. **Evidence Reconciliation** (`GET /api/v1/cases/:id/timeline` + `/evidence`): Verifies that every `evidence_ref` cited in the timeline is actually linked to the case.
8. **PIR Handoff**: **Known Contract Disclosure**: No dedicated PIR model exists yet in `case-management` (`UnbackedField`) — track PIR creation in the team's post-incident tracker and link its ticket ID in a final case decision before closure.

---

## 2. Incident Command Lifecycle Procedure

### Phase 1: Command Activation & Triage (T+0 to T+15 min)
1. Open **Respond -> Incident Command** (`/cases/incidents/command`) and select the active incident from the **Incident under command** selector.
2. Verify the top-level **ContractSurface status badge**:
   - `NOMINAL`: all required sources answered.
   - `DEGRADED` / `PARTIAL` / `STALE` / `UNAVAILABLE`: expand the **provenance** drawer at the bottom of the page to see which endpoint failed or lagged. **Never treat a missing clock or empty evidence list under a degraded banner as "no issue."**
3. Confirm **Scope & Severity** (`environment_id`, `region`, `primary_asset_id`, `primary_identity_id`, `correlation_id`).
4. Confirm who holds **Incident Commander**, **Comms Lead**, and **Scribe** by logging a structured `INTERNAL` case note in `/cases/:id` (required until dedicated incident-role records ship).
5. Verify **Clocks**: confirm the SLA clock is `RUNNING` and check `Elapsed vs target`. If pausing the clock (e.g. awaiting customer action), document the mandatory `pause_reason`.

### Phase 2: Containment & Email Remediation Escalation
1. For **Email Security Incidents** (BEC, credential phishing, malicious forwarding rules, compromised mailboxes):
   - Review the originating threat finding in `/email/threats` and confirm coverage completeness (`/email/coverage`).
   - Propose post-delivery actions in `/email/actions`:
     1. **Create Proposal** using verified provider target references (`<mailbox>::<messageOrRuleId>`, or `<mailbox>` for `REVOKE_MAILBOX_SESSIONS`).
     2. **Simulate (Dry-Run)** — mandatory pre-flight blast-radius and rollback-plan check (`E13`).
     3. **Dual-Custody Approve** — must be performed by a **distinct** authorized approver (`T26`), with a bounded freshness window.
     4. **Execute** — enforced by Phase-2 gate, Freeze check, Cedar tenant isolation + policy evaluation, and per-tenant command signing before hitting Microsoft Graph or Gmail.
   - If provider execution returns `UNKNOWN` or `PARTIAL`, **do not blindly retry**. Reconcile live mailbox state first and log findings on the Incident Command timeline.
2. **Emergency Halt**: If containment goes off-nominal, scope expands unexpectedly, or credentials appear compromised, click **Freeze Center** directly from the Incident Command header (`/freeze`) and follow [`ZS-OPS-FREEZE-001`](./ZS-OPS-FREEZE-001-freeze-center-runbook.md).

### Phase 3: Decision Recording & Stakeholder Communications
1. **Every material containment or scope decision** MUST be recorded via `/cases/:id` (`POST /api/v1/cases/:id/decisions`) with:
   - `decision_type`, `decision`, clear `rationale`, `policy_version`, and explicit `evidence_refs`.
   - Confirm the decision appears in the **Decisions** section of `/cases/incidents/command`.
2. **Communications Hygiene**:
   - Customer updates MUST use `CUSTOMER_VISIBLE` classification (never leak raw internal hypotheses, actor credentials, or unverified IOCs).
   - Operational chatter, containment drafts, and role assignments stay strictly in `INTERNAL` notes.
   - Verify the **Customer-facing** column is non-empty on P1/P2 incidents before SLA checkpoints.

### Phase 4: Evidence Reconciliation (Mandatory Before Closure)
1. Inspect the **Evidence reconciliation** section on `/cases/incidents/command`.
2. If the alert banner reports **`N cited references not linked to this case`**:
   - For each listed `evidence_ref`, attach the corresponding evidence record to the case (`POST /api/v1/cases/:id/evidence`) or document why the citation is invalid in a superseding timeline entry.
   - Do **not** resolve or close the incident while unreconciled references remain.
3. For email incidents requiring regulatory or auditor handoff, generate and verify a sealed Merkle manifest in `/email/evidence` and verify the append-only audit chain (`GET /api/v1/email/audit/verify`).

### Phase 5: Recovery Verification & PIR Handoff
1. Confirm all containment actions are either verified (`VERIFIED`) or cleanly compensated (`COMPENSATING` -> verified restoration) and any temporary freezes engaged in `/freeze` are safely lifted per `ZS-OPS-FREEZE-001`.
2. Record a final disposition decision in `/cases/:id` containing:
   - Root cause summary
   - Linked evidence manifest ID / audit chain verification result
   - External PIR ticket reference, assigned PIR owner, and due date (within 5 business days for P1/P2).
3. Update shift handover (`/operations/shift-handover`) if transferring monitoring across shifts, then transition the case to `RESOLVED` / `CLOSED`.

---

## 3. Troubleshooting Degraded Incident Command Views

| Symptom on `/cases/incidents/command` | Likely Cause | Immediate Action |
| :--- | :--- | :--- |
| Banner shows `UNAUTHORIZED` | Expired JWT, missing `x-tenant-id`, or missing `case:read` permission | Re-authenticate and verify tenant header; never assume "no incidents". |
| Banner shows `DEGRADED` or `PARTIAL` | One or more `/cases/:id/{timeline,decisions,notes,sla,evidence}` calls failed | Open the **provenance** `<details>` table to identify the failing endpoint and correlation ID; inspect `shield-core` logs by correlation ID. |
| "No response clock is running on this case" | Case created without SLA clock initialization | Verify contract coverage tier and attach SLA clock before continuing P1 triage. |
| Unreconciled evidence alert (`role="alert"`) | Timeline entry cites an `evidence_ref` missing from `CaseEvidence` | Link the evidence ID to the case before closure or audit export. |

---

## 4. Related Runbooks & References

- **Freeze Center Runbook**: [`ZS-OPS-FREEZE-001-freeze-center-runbook.md`](./ZS-OPS-FREEZE-001-freeze-center-runbook.md)
- **Production Game-Day Rehearsal**: [`LAB18-production-rehearsal-runbook.md`](./LAB18-production-rehearsal-runbook.md)
- **Tenant Deletion Reconciliation**: [`ZS-ENG-OFF-DEL-001-deletion-reconciliation-runbook.md`](./ZS-ENG-OFF-DEL-001-deletion-reconciliation-runbook.md)
