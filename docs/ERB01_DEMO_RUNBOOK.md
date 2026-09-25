# ZoikoShield ERB-01 MVP Demonstration Runbook

This document details the complete 22-step verification workflow for the **ZoikoShield ERB-01 MVP Demonstration** as specified in the platform building process.

---

## 🚀 Overview of the Demonstration Flow

```text
Federated or approved fallback login
→ Organization onboarding & tenant creation
→ Security Analyst invitation
→ Webhook connector configuration & activation
→ Synthetic security log ingestion
→ Validation & normalization
→ Detection engine execution
→ Alert generation & case promotion
→ Evidence recording & Merkle ledger anchoring
→ AI-assisted investigation & citations
→ Human decision recording
→ Response recommendation & simulation
→ Control evaluation
→ Audit package export
→ Offline independent verification
```

---

## 📋 22 Step-by-Step Verification Checklist

### 1. User Authentication
- [x] Authenticate the approved bootstrap identity through Google/Microsoft federation or an approved password-fallback account.
- [x] Receive the authenticated session through secure HTTP-only access and refresh cookies.

### 2. Tenant & Organization Onboarding
- [x] Submit organization details via `POST /api/v1/onboarding/organization`.
- [x] Provision legal entity, environment (`PRODUCTION`), and grant `TENANT_OWNER` role.

### 3. Role Management & Invitation
- [x] Invite Security Analyst via `POST /api/v1/tenants/:tenantId/invitations`.
- [x] Accept invitation via `POST /api/v1/invitations/:token/accept`.

### 4. Connector Setup
- [x] Configure generic Webhook connector via `POST /api/v1/connectors`.
- [x] Test and activate connector via `POST /api/v1/connectors/:id/activate`.

### 5. Ingestion & Normalization
- [x] Send synthetic failed login log to `POST /api/v1/ingestion/webhooks/:connectorId`.
- [x] Verify raw payload storage, schema validation, and normalization (`TelemetryNormalized`).

### 6. Detection & Alerting
- [x] Rule `Repeated Failed Logins` executes on normalized events.
- [x] System generates `Alert` with `NEW` status and links source event references.

### 7. Case Management & Evidence
- [x] Promote alert into `Case` via `POST /api/v1/alerts/:alertId/create-case`.
- [x] Record supporting evidence in `EvidenceRecord` and append immutable entry to `EvidenceLedger`.

### 8. AI-Assisted Investigation
- [x] Invoke AI investigation summary via `POST /api/v1/ai/cases/:caseId/summary`.
- [x] Verify AI output includes advisory warning & explicit evidence citations.

### 9. Human Decision & Response Simulation
- [x] Record analyst human decision via `POST /api/v1/cases/:caseId/decisions`.
- [x] Generate session-reset response proposal via `POST /api/v1/cases/:caseId/response-proposals`.
- [x] Simulate response via `POST /api/v1/response-proposals/:id/simulate` and receive simulation receipt.

### 10. Control Evaluation, Audit Package & Verification
- [x] Control evaluator checks Identity-Security controls via `POST /api/v1/control-tests/:id/evaluate`.
- [x] Generate and finalize `AuditPackage` via `POST /api/v1/audit-packages`.
- [x] Verify ZIP bundle offline using `independent-verifier` CLI:
  ```bash
  zoikoshield-verifier verify ./audit-package.zip
  ```

---

## 🎯 Success Statement

**ZoikoShield ERB-01 MVP** is fully operational and verified when an authenticated tenant can ingest logs, trigger detections, record evidence, obtain AI assistance, simulate response actions, evaluate controls, and export an independently verifiable audit package.
