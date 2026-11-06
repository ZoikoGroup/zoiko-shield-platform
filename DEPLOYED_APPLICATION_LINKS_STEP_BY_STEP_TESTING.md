# ZoikoShield Platform — Deployed Application Step-by-Step Link Testing Guide

This document is the official step-by-step testing sequence for the deployed ZoikoShield application on **`https://app.zoikoshield.com`**. 

Follow each step sequentially from entry to logout. Every link is a complete, direct, clickable deployed URL.

---


---

## Phase 1: Public Entry & Pre-Authentication Pages

### Step 1: Open Main Application Entry Point
* **Full URL**: `https://app.zoikoshield.com/`
* **Clickable Link**: [Open Main Application](https://app.zoikoshield.com/)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the root URL directly in a browser.
  2. Verify that the platform redirects unauthenticated sessions to the secure login screen or displays the main entry portal with navigation.

---

### Step 2: Open Commercial Plans & Pricing Ladder
* **Full URL**: `https://app.zoikoshield.com/pricing`
* **Clickable Link**: [Open Commercial Pricing Page](https://app.zoikoshield.com/pricing)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the pricing catalog.
  2. Verify that the 4-tier plan ladder (Essential, Professional, Enterprise, Sovereign) renders.
  3. Verify the anti-perverse billing guarantee disclaimer and interactive asset-sizing calculator.

---

### Step 3: Open Commercial Services & Capabilities
* **Full URL**: `https://app.zoikoshield.com/services`
* **Clickable Link**: [Open Commercial Services Page](https://app.zoikoshield.com/services)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the services catalogue.
  2. Verify the 12 core customer-visible services, capability domains, and SLA commitment tables render.

---

### Step 4: Open Trust Center & Statutory Compliance Page
* **Full URL**: `https://app.zoikoshield.com/trust`
* **Clickable Link**: [Open Trust Center](https://app.zoikoshield.com/trust)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the customer trust center.
  2. Verify that statutory certificates (SOC 2 Type II, ISO 27001:2022, FedRAMP High, HIPAA) and cryptographic badges render.

---

### Step 5: Open Certificate & Cryptographic Verification Page
* **Full URL**: `https://app.zoikoshield.com/verify-certificate`
* **Clickable Link**: [Open Certificate Verification Page](https://app.zoikoshield.com/verify-certificate)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the public certificate verification interface.
  2. Enter a sample certificate hash or verification identifier and verify the signature validation output.

---

### Step 6: Open Help & Support Documentation
* **Full URL**: `https://app.zoikoshield.com/help`
* **Clickable Link**: [Open Help Center](https://app.zoikoshield.com/help)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the platform help center.
  2. Verify user guides, FAQ items, and emergency incident hotline links display correctly.

---

### Step 7: Open Public Security Assistant
* **Full URL**: `https://app.zoikoshield.com/assistant`
* **Clickable Link**: [Open Public Security Assistant](https://app.zoikoshield.com/assistant)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the unauthenticated security assistant panel.
  2. Verify chat welcome prompts load and test submitting an introductory inquiry.

---

## Phase 2: Registration, Invitation & Onboarding

### Step 8: Open User Registration Page
* **Full URL**: `https://app.zoikoshield.com/register`
* **Clickable Link**: [Open Registration Page](https://app.zoikoshield.com/register)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the self-service account registration form.
  2. Verify input fields for Full Name, Work Email, Organization Name, and Password.
  3. Verify password strength validation meters and Terms of Service consent checkboxes.

---

### Step 9: Open Tenant Invitation Redemption Page
* **Full URL**: `https://app.zoikoshield.com/accept-invite`
* **Clickable Link**: [Open Accept Invite Page](https://app.zoikoshield.com/accept-invite)
* **Access Level**: Public / Invite Token Bound
* **Tester Action**:
  1. Click the link to open the invitation acceptance workflow.
  2. Verify that the invitation token validation card renders and prompts for a token if opened without parameters.

---

### Step 10: Open New Tenant Onboarding Setup Wizard
* **Full URL**: `https://app.zoikoshield.com/onboarding`
* **Clickable Link**: [Open Onboarding Setup Wizard](https://app.zoikoshield.com/onboarding)
* **Access Level**: Authenticated / New Tenant
* **Tester Action**:
  1. Click the link to open the guided setup wizard.
  2. Verify tenant environment selection, cloud account connection step, and security policy pack initializer.

---

## Phase 3: Login & Authentication

### Step 11: Open Login Page & Authenticate
* **Full URL**: `https://app.zoikoshield.com/login`
* **Clickable Link**: [Open Login Page](https://app.zoikoshield.com/login)
* **Access Level**: Public (Unauthenticated)
* **Tester Action**:
  1. Click the link to open the login page.
  2. Enter Email: `aditya@zoiko.com` and Password: `Aditya@20045678` (or `Shield@SecOps2026!`).
  3. Click **Sign In**.
  4. Verify successful authentication, generation of the secure session cookie, and automatic redirection to the dashboard.

---

## Phase 4: Primary Customer Dashboards

### Step 12: Open Customer Dashboard 1 — Executive Security Overview
* **Full URL**: `https://app.zoikoshield.com/customer/dashboard`
* **Clickable Link**: [Open Customer Dashboard](https://app.zoikoshield.com/customer/dashboard)
* **Access Level**: Authenticated (Tenant User / Tenant Owner)
* **Tester Action**:
  1. Open the URL directly in the browser after logging in.
  2. Verify the 4 primary KPI cards (Overall Posture Score, Total Assets in Scope, Critical Exposures, Coverage Gaps).
  3. Verify the Priority Remediations table and dynamic tenant scope header.

---

### Step 13: Open Customer Security Overview Workspace
* **Full URL**: `https://app.zoikoshield.com/customer/security-overview`
* **Clickable Link**: [Open Customer Security Overview](https://app.zoikoshield.com/customer/security-overview)
* **Access Level**: Authenticated (Tenant User / Tenant Owner)
* **Tester Action**:
  1. Open the URL directly.
  2. Verify security posture gauge charts, asset protection breakdown percentages, and active remediation action lists.

---

## Phase 5: Customer Workspace Sub-Sections (All 12 Sections)

### Step 14: Open Threats & Incidents Section
* **Full URL**: `https://app.zoikoshield.com/customer/threats-incidents`
* **Clickable Link**: [Open Threats & Incidents](https://app.zoikoshield.com/customer/threats-incidents)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify active incident queue, severity filter tabs (Critical, High, Medium, Low), and triage action buttons.

---

### Step 15: Open Exposure Management Section
* **Full URL**: `https://app.zoikoshield.com/customer/exposure-management`
* **Clickable Link**: [Open Exposure Management](https://app.zoikoshield.com/customer/exposure-management)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify open exposures count, critical exposure backlog, overdue remediation tallies, and assigned remediation owners.

---

### Step 16: Open Discovered Assets Inventory Section
* **Full URL**: `https://app.zoikoshield.com/customer/assets-inventory`
* **Clickable Link**: [Open Assets Inventory](https://app.zoikoshield.com/customer/assets-inventory)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify the asset list table with columns: Asset Name, Asset Code, Type, Owner, Protection Status, and Actions.
  3. Click **Add Asset** and verify the registration dialog appears.

---

### Step 17: Open Vulnerabilities Management Section
* **Full URL**: `https://app.zoikoshield.com/customer/vulnerabilities`
* **Clickable Link**: [Open Vulnerabilities Management](https://app.zoikoshield.com/customer/vulnerabilities)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify the vulnerability list, CVSS scores, remediation SLAs, and patch deployment status badges.

---

### Step 18: Open Detection & Response Controls Section
* **Full URL**: `https://app.zoikoshield.com/customer/detection-response`
* **Clickable Link**: [Open Detection & Response](https://app.zoikoshield.com/customer/detection-response)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify active detection coverage rules, endpoint containment controls, and network block policies.

---

### Step 19: Open Identity & Access Security Section
* **Full URL**: `https://app.zoikoshield.com/customer/identity-access`
* **Clickable Link**: [Open Identity & Access](https://app.zoikoshield.com/customer/identity-access)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify privileged user accounts count, MFA enforcement rates, active service principles, and JIT elevation status.

---

### Step 20: Open Data Security & Privacy Section
* **Full URL**: `https://app.zoikoshield.com/customer/data-security`
* **Clickable Link**: [Open Data Security](https://app.zoikoshield.com/customer/data-security)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify sensitive data repositories, DLP policy matches, cloud storage bucket encryption states, and access audit logs.

---

### Step 21: Open Cloud Security Posture (CSPM) Section
* **Full URL**: `https://app.zoikoshield.com/customer/cloud-security`
* **Clickable Link**: [Open Cloud Security](https://app.zoikoshield.com/customer/cloud-security)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify multi-cloud security benchmark scores across AWS, GCP, and Azure accounts.

---

### Step 22: Open Compliance & Regulatory Risk Section
* **Full URL**: `https://app.zoikoshield.com/customer/compliance-risk`
* **Clickable Link**: [Open Compliance & Risk](https://app.zoikoshield.com/customer/compliance-risk)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify compliance framework status cards for SOC 2 Type II, ISO 27001, FedRAMP, and HIPAA.
  3. Verify statutory caveat notes and passing control percentages.

---

### Step 23: Open Reports & Analytics Generator Section
* **Full URL**: `https://app.zoikoshield.com/customer/reports-analytics`
* **Clickable Link**: [Open Reports & Analytics](https://app.zoikoshield.com/customer/reports-analytics)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify available reporting templates (Executive Brief, Technical Audit, Compliance Evidence).
  3. Click **Generate Report** and verify generation status.

---

### Step 24: Open Workspace Integrations & Connectors Section
* **Full URL**: `https://app.zoikoshield.com/customer/integrations`
* **Clickable Link**: [Open Integrations](https://app.zoikoshield.com/customer/integrations)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify active connectors (AWS CloudTrail, Okta, CrowdStrike, GitHub), sync health indicators, and **Add Integration** button.

---

### Step 25: Open Workspace Settings & Policies Section
* **Full URL**: `https://app.zoikoshield.com/customer/settings`
* **Clickable Link**: [Open Workspace Settings](https://app.zoikoshield.com/customer/settings)
* **Access Level**: Authenticated (Tenant Admin)
* **Tester Action**:
  1. Open the URL.
  2. Verify organization settings, session timeout configurations, notification email channels, and **Save Changes** button.

---

## Phase 6: Threat Ingestion, Telemetry & Detection Engineering

### Step 26: Open Ingestion Console & Live Telemetry Streams
* **Full URL**: `https://app.zoikoshield.com/ingestion`
* **Clickable Link**: [Open Ingestion Console](https://app.zoikoshield.com/ingestion)
* **Access Level**: Authenticated (SecOps / Admin)
* **Tester Action**:
  1. Open the URL.
  2. Verify real-time event throughput (EPS), active ingestion pipelines, and live event stream telemetry.

---

### Step 27: Open Detections & SIEM Correlation Rules
* **Full URL**: `https://app.zoikoshield.com/detections`
* **Clickable Link**: [Open Detections Console](https://app.zoikoshield.com/detections)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify active detection rule catalog, detection logic status, and rule activation toggles.

---

### Step 28: Open Threat Hunting Console
* **Full URL**: `https://app.zoikoshield.com/hunting`
* **Clickable Link**: [Open Threat Hunting](https://app.zoikoshield.com/hunting)
* **Access Level**: Authenticated (Security Analyst)
* **Tester Action**:
  1. Open the URL.
  2. Verify threat hunting query builder, MITRE ATT&CK technique matrix, and query execution buttons.

---

### Step 29: Open Telemetry Ingestion Connectors
* **Full URL**: `https://app.zoikoshield.com/connectors`
* **Clickable Link**: [Open Connectors Console](https://app.zoikoshield.com/connectors)
* **Access Level**: Authenticated (Admin / SecOps)
* **Tester Action**:
  1. Open the URL.
  2. Verify connected log sources, ingestion protocol endpoints, and connection test buttons.

---

## Phase 7: AI Copilot, Alerts & Incident Investigation

### Step 30: Open AI Security Copilot Console
* **Full URL**: `https://app.zoikoshield.com/copilot`
* **Clickable Link**: [Open AI Copilot](https://app.zoikoshield.com/copilot)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify prompt input field, prompt template selector, and AI model governance review envelope.
  3. Submit a security query (e.g., "Analyze credential exposure risk") and verify streaming reasoning output.

---

### Step 31: Open Security Alerts Feed
* **Full URL**: `https://app.zoikoshield.com/alerts`
* **Clickable Link**: [Open Alerts Feed](https://app.zoikoshield.com/alerts)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify security alert list, severity badges (Critical, High, Medium, Low), source connector tags, and filter controls.

---

### Step 32: Open Specific Alert Deep-Dive View
* **Full URL**: `https://app.zoikoshield.com/alerts/alert-2026-auth-01`
* **Clickable Link**: [Open Alert Detail View](https://app.zoikoshield.com/alerts/alert-2026-auth-01)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify alert event breakdown, raw payload viewer, indicator of compromise (IoC) list, and **Escalate to Case** action.

---

### Step 33: Open Case Management Dashboard
* **Full URL**: `https://app.zoikoshield.com/cases`
* **Clickable Link**: [Open Cases Dashboard](https://app.zoikoshield.com/cases)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify active case table with Case ID, Title, Severity, Lead Investigator, Status, and Created Date.

---

### Step 34: Open Incident Case Investigation & Attack Path View
* **Full URL**: `https://app.zoikoshield.com/cases/case-2026-auth-attack-01`
* **Clickable Link**: [Open Case Investigation](https://app.zoikoshield.com/cases/case-2026-auth-attack-01)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify interactive MITRE ATT&CK attack path graph, forensic timeline, and attached forensic evidence files.

---

### Step 35: Open Major Incident Command Center
* **Full URL**: `https://app.zoikoshield.com/cases/incidents/command`
* **Clickable Link**: [Open Incident Command Center](https://app.zoikoshield.com/cases/incidents/command)
* **Access Level**: Authenticated (Incident Commander / Admin)
* **Tester Action**:
  1. Open the URL.
  2. Verify major incident war room layout, active containment status, conference bridge link, and situation report feed.

---

### Step 36: Open AI Governance & Model Audit Console
* **Full URL**: `https://app.zoikoshield.com/ai-governance`
* **Clickable Link**: [Open AI Governance](https://app.zoikoshield.com/ai-governance)
* **Access Level**: Authenticated (Compliance / SecOps)
* **Tester Action**:
  1. Open the URL.
  2. Verify prompt logging records, model safety guardrails, token usage statistics, and model hallucination checks.

---

## Phase 8: Actions, Playbooks & Incident Response Retainers

### Step 37: Open Purpose-Bound Legal IR Retainer Page
* **Full URL**: `https://app.zoikoshield.com/ir-retainer`
* **Clickable Link**: [Open IR Retainer Page](https://app.zoikoshield.com/ir-retainer)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify statutory legal confidentiality disclaimer, retainer SLA clock, and **Request Emergency Incident Response** button.

---

### Step 38: Open SOAR Actions Console
* **Full URL**: `https://app.zoikoshield.com/actions`
* **Clickable Link**: [Open SOAR Actions](https://app.zoikoshield.com/actions)
* **Access Level**: Authenticated (SecOps / Admin)
* **Tester Action**:
  1. Open the URL.
  2. Verify automated action execution queue, target systems (Firewall, IAM, EDR), and execution history log.

---

### Step 39: Open SOAR Automation Playbooks
* **Full URL**: `https://app.zoikoshield.com/playbooks`
* **Clickable Link**: [Open Playbooks Console](https://app.zoikoshield.com/playbooks)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify list of active playbooks (Account Lockdown, Host Isolation, IP Blacklist, Credential Revocation).

---

### Step 40: Open Response Proposals Approval Queue
* **Full URL**: `https://app.zoikoshield.com/response-proposals`
* **Clickable Link**: [Open Response Proposals](https://app.zoikoshield.com/response-proposals)
* **Access Level**: Authenticated (Operator / Tier 2 Analyst)
* **Tester Action**:
  1. Open the URL.
  2. Verify pending human-in-the-loop remediation proposals with **Approve Action** and **Reject** controls.

---

### Step 41: Open Retainer Operations & SLA Service Tracking
* **Full URL**: `https://app.zoikoshield.com/operations/retainers`
* **Clickable Link**: [Open Retainer Operations](https://app.zoikoshield.com/operations/retainers)
* **Access Level**: Authenticated (Commercial / SecOps Lead)
* **Tester Action**:
  1. Open the URL.
  2. Verify active retainer hours balance, consumed SLA response times, and billing tier entitlements.

---

### Step 42: Open SOC Shift Handover Console
* **Full URL**: `https://app.zoikoshield.com/operations/shift-handover`
* **Clickable Link**: [Open Shift Handover](https://app.zoikoshield.com/operations/shift-handover)
* **Access Level**: Authenticated (SOC Analyst)
* **Tester Action**:
  1. Open the URL.
  2. Verify shift duty roster, active incident summary, pending investigation notes, and **Sign Off Shift** action.

---

## Phase 9: Cryptographic Ledger & Audit Proofs

### Step 43: Open Merkle Tree Audit Ledger & Receipt Verification
* **Full URL**: `https://app.zoikoshield.com/ledger`
* **Clickable Link**: [Open Cryptographic Ledger](https://app.zoikoshield.com/ledger)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify current Merkle state root, total logged event receipts, and cryptographic timestamp authority (RFC 3161) status.
  3. Click **Verify Proof** on receipt #1043 and verify green cryptographic validity receipt.

---

## Phase 10: Risk Management, Controls, Compliance & Policies

### Step 44: Open Enterprise Risk Management Register
* **Full URL**: `https://app.zoikoshield.com/risk`
* **Clickable Link**: [Open Risk Register](https://app.zoikoshield.com/risk)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify enterprise risk matrix (Impact vs Likelihood heat map), open risk tickets, and mitigation plan tracking.

---

### Step 45: Open Executive Risk Summary Dashboard
* **Full URL**: `https://app.zoikoshield.com/risk/executive`
* **Clickable Link**: [Open Executive Risk Summary](https://app.zoikoshield.com/risk/executive)
* **Access Level**: Authenticated (Executive / Board)
* **Tester Action**:
  1. Open the URL.
  2. Verify board-level risk summary cards, annualized loss expectancy (ALE) metrics, and risk trend lines.

---

### Step 46: Open Continuous Compliance Evaluation
* **Full URL**: `https://app.zoikoshield.com/compliance`
* **Clickable Link**: [Open Compliance Console](https://app.zoikoshield.com/compliance)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify overall compliance audit readiness score, passing vs failing controls, and continuous compliance check status.

---

### Step 47: Open Regulatory Controls Catalog
* **Full URL**: `https://app.zoikoshield.com/controls`
* **Clickable Link**: [Open Controls Catalog](https://app.zoikoshield.com/controls)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify list of statutory controls across SOC 2, ISO 27001, FedRAMP, and NIST 800-53.

---

### Step 48: Open Specific Regulatory Control View
* **Full URL**: `https://app.zoikoshield.com/controls/ctrl-ac-2`
* **Clickable Link**: [Open Specific Control (AC-2)](https://app.zoikoshield.com/controls/ctrl-ac-2)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify control implementation statements, automated evaluator queries, and linked audit evidence.

---

### Step 49: Open Audit Findings Register
* **Full URL**: `https://app.zoikoshield.com/findings`
* **Clickable Link**: [Open Findings Register](https://app.zoikoshield.com/findings)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify audit findings list, remediation target dates, assigned remediators, and verification state.

---

### Step 50: Open Specific Finding Remediation View
* **Full URL**: `https://app.zoikoshield.com/findings/find-001`
* **Clickable Link**: [Open Finding Detail (find-001)](https://app.zoikoshield.com/findings/find-001)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify finding root cause analysis, evidence screenshots, corrective action plan, and closure verification workflow.

---

### Step 51: Open Evidence Operations & Audit Packaging
* **Full URL**: `https://app.zoikoshield.com/evidence-operations`
* **Clickable Link**: [Open Evidence Operations](https://app.zoikoshield.com/evidence-operations)
* **Access Level**: Authenticated (Compliance Lead / Auditor)
* **Tester Action**:
  1. Open the URL.
  2. Verify evidence collection tasks, cryptographic file hashes (SHA-256), and **Export Evidence Bundle** button.

---

### Step 52: Open Security Policy Exceptions Console
* **Full URL**: `https://app.zoikoshield.com/exceptions`
* **Clickable Link**: [Open Exceptions Console](https://app.zoikoshield.com/exceptions)
* **Access Level**: Authenticated (Security Leadership)
* **Tester Action**:
  1. Open the URL.
  2. Verify active exception requests, business justification rationales, compensating controls, and expiration countdowns.

---

### Step 53: Open Regulated Sector Packs
* **Full URL**: `https://app.zoikoshield.com/sector-packs`
* **Clickable Link**: [Open Sector Packs](https://app.zoikoshield.com/sector-packs)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify industry-specific security packs (Financial Services FFIEC, Healthcare HIPAA/HITECH, Defense CMMC 2.0).

---

### Step 54: Open Organization Security Policies
* **Full URL**: `https://app.zoikoshield.com/policies`
* **Clickable Link**: [Open Security Policies](https://app.zoikoshield.com/policies)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify enforced security policies (Access Control Policy, Password Complexity, Incident Response Plan).

---

## Phase 11: Unified Enterprise Assets

### Step 55: Open Enterprise Asset Inventory
* **Full URL**: `https://app.zoikoshield.com/assets`
* **Clickable Link**: [Open Enterprise Assets](https://app.zoikoshield.com/assets)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify the CMDB inventory table containing servers, cloud buckets, databases, and microservices with security tags.

---

## Phase 12: Platform Administration & Governance Cockpits

### Step 56: Open Platform Admin Dashboard
* **Full URL**: `https://app.zoikoshield.com/admin`
* **Clickable Link**: [Open Platform Admin](https://app.zoikoshield.com/admin)
* **Access Level**: Platform Super Admin (`admin@zoikoshield.io`)
* **Tester Action**:
  1. Open the URL.
  2. Verify global platform statistics, active tenants list, system health meters, and administrative quick actions.

---

### Step 57: Open Multi-Tenant Provisioning Console
* **Full URL**: `https://app.zoikoshield.com/admin/tenant`
* **Clickable Link**: [Open Tenant Provisioning](https://app.zoikoshield.com/admin/tenant)
* **Access Level**: Platform Super Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify tenant management table, tenant isolation configuration, and **Create Tenant** button.

---

### Step 58: Open G1 Launch Gate Multi-Approver Cockpit
* **Full URL**: `https://app.zoikoshield.com/admin/g1-gate`
* **Clickable Link**: [Open G1 Gate Cockpit](https://app.zoikoshield.com/admin/g1-gate)
* **Access Level**: Platform Super Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify all 8 canonical domain approver cards (SecOps, Legal, Cryptography, Platform, Compliance, etc.).
  3. Verify fail-closed status and click **Sign Gate** to inspect the multi-signature modal.

---

### Step 59: Open JIT Break-Glass Elevation Cockpit
* **Full URL**: `https://app.zoikoshield.com/admin/jit`
* **Clickable Link**: [Open JIT Cockpit](https://app.zoikoshield.com/admin/jit)
* **Access Level**: Platform Super Admin / SecOps
* **Tester Action**:
  1. Open the URL.
  2. Verify active elevated sessions, session duration timers, and emergency elevation triggers.

---

### Step 60: Open JIT Privileged Access Request Modal
* **Full URL**: `https://app.zoikoshield.com/admin/jit-elevation`
* **Clickable Link**: [Open JIT Elevation Request](https://app.zoikoshield.com/admin/jit-elevation)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Click **Request JIT Elevation** and verify justification input, duration selector (15m, 1h, 4h), and WebAuthn step-up prompt.

---

### Step 61: Open Platform Service Health & Disaster Recovery Drills
* **Full URL**: `https://app.zoikoshield.com/admin/platform-health`
* **Clickable Link**: [Open Platform Health](https://app.zoikoshield.com/admin/platform-health)
* **Access Level**: Platform Super Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify health matrix for all 6 microservices (`shield-core`, `shield-ingest`, `shield-ai`, `shield-action`, `shield-anchor`, `verifier-cli`).
  3. Verify disaster recovery backup integrity panel and click **Run Non-Destructive Restore Drill**.

---

### Step 62: Open Pre-Flight GTM Governance Checklist
* **Full URL**: `https://app.zoikoshield.com/admin/gtm-checklist`
* **Clickable Link**: [Open GTM Checklist](https://app.zoikoshield.com/admin/gtm-checklist)
* **Access Level**: Platform Super Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify the 12-item pre-flight verification checklist with 100% pass status and cryptographic sign-off.

---

### Step 63: Open Alert & Notification Email Templates
* **Full URL**: `https://app.zoikoshield.com/admin/email-templates`
* **Clickable Link**: [Open Email Templates](https://app.zoikoshield.com/admin/email-templates)
* **Access Level**: Platform Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify pre-configured HTML email templates (Critical Alert, Weekly Briefing, Password Reset, Incident Notification).

---

### Step 64: Open Tenant Archival & Data Export
* **Full URL**: `https://app.zoikoshield.com/admin/export`
* **Clickable Link**: [Open Data Export Console](https://app.zoikoshield.com/admin/export)
* **Access Level**: Platform Super Admin / Compliance Lead
* **Tester Action**:
  1. Open the URL.
  2. Verify tenant export selection, JSON/CSV format choices, and cryptographic checksum generator.

---

### Step 65: Open Tenant Workspace Switcher
* **Full URL**: `https://app.zoikoshield.com/tenant-management`
* **Clickable Link**: [Open Tenant Management](https://app.zoikoshield.com/tenant-management)
* **Access Level**: Authenticated User
* **Tester Action**:
  1. Open the URL.
  2. Verify list of accessible tenant organizations and test switching the active tenant context.

---

### Step 66: Open Tenant Team & Role Management
* **Full URL**: `https://app.zoikoshield.com/team`
* **Clickable Link**: [Open Team Management](https://app.zoikoshield.com/team)
* **Access Level**: Tenant Owner / Admin
* **Tester Action**:
  1. Open the URL.
  2. Verify team members table, RBAC role badges (Tenant Owner, SecOps Lead, Viewer), and **Invite Member** button.

---

### Step 67: Open In-App Notifications Center
* **Full URL**: `https://app.zoikoshield.com/notifications`
* **Clickable Link**: [Open Notifications Center](https://app.zoikoshield.com/notifications)
* **Access Level**: Authenticated
* **Tester Action**:
  1. Open the URL.
  2. Verify real-time notification feed, read/unread status filters, and **Mark All as Read** action.

---

### Step 68: Open Developer Portal & API Access
* **Full URL**: `https://app.zoikoshield.com/developer`
* **Clickable Link**: [Open Developer Portal](https://app.zoikoshield.com/developer)
* **Access Level**: Authenticated (Developer / Admin)
* **Tester Action**:
  1. Open the URL.
  2. Verify API key generator, webhook endpoint registrations, and interactive REST documentation link.

---

## Phase 13: Specialized Portals (Auditor, MSSP Partner & Red Team)

### Step 69: Open Independent Third-Party Auditor Portal
* **Full URL**: `https://app.zoikoshield.com/auditor`
* **Clickable Link**: [Open Auditor Portal](https://app.zoikoshield.com/auditor)
* **Access Level**: Auditor Role (`auditor@compliance-firm.com`)
* **Tester Action**:
  1. Open the URL.
  2. Verify read-only statutory audit cockpit, evidence validation checklists, and compliance attestations.

---

### Step 70: Open Internal Audit Engagement Review
* **Full URL**: `https://app.zoikoshield.com/audit`
* **Clickable Link**: [Open Audit Engagements](https://app.zoikoshield.com/audit)
* **Access Level**: Auditor / Compliance Lead
* **Tester Action**:
  1. Open the URL.
  2. Verify active audit review cycles, sampling methodology, and control test results.

---

### Step 71: Open Statutory Audit Report Generator
* **Full URL**: `https://app.zoikoshield.com/audit/reports/generate`
* **Clickable Link**: [Open Audit Report Generator](https://app.zoikoshield.com/audit/reports/generate)
* **Access Level**: Auditor / Compliance Lead
* **Tester Action**:
  1. Open the URL.
  2. Select statutory framework (e.g., SOC 2 Type II) and click **Compile Official Audit Package**.

---

### Step 72: Open MSSP Multi-Tenant Fleet Portal
* **Full URL**: `https://app.zoikoshield.com/partner/fleet`
* **Clickable Link**: [Open Partner Fleet Portal](https://app.zoikoshield.com/partner/fleet)
* **Access Level**: MSSP Partner Role (`partner@defense-mssp.com`)
* **Tester Action**:
  1. Open the URL.
  2. Verify multi-tenant fleet overview cards, customer tenant health scorecards, cross-tenant alerts, and drill-in links.

---

### Step 73: Open Red Team Adversary Simulation Console
* **Full URL**: `https://app.zoikoshield.com/red-team`
* **Clickable Link**: [Open Red Team Console](https://app.zoikoshield.com/red-team)
* **Access Level**: SecOps Lead / Red Team
* **Tester Action**:
  1. Open the URL.
  2. Verify adversary emulation scenarios (APT29, Ransomware Precursor, Lateral Movement), and execution status.

---

## Phase 14: Session Termination & Sign Out

### Step 74: Terminate Session & Logout
* **Full URL**: `https://app.zoikoshield.com/login`
* **Clickable Link**: [Return to Login After Sign Out](https://app.zoikoshield.com/login)
* **Access Level**: Authenticated User
* **Tester Action**:
  1. In the application top header or profile menu, click **Sign Out** / **Logout**.
  2. Verify that the session cookies (`zoiko_shield_jwt`, `zoiko_auth`) are invalidated.
  3. Verify that the browser is returned to `https://app.zoikoshield.com/login` and attempting to navigate back to `/customer/dashboard` forces a redirect back to `/login`.

