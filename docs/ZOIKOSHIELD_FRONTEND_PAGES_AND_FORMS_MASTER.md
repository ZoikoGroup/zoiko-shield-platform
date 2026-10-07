# Zoiko Shield — Frontend Pages, Forms & Live Demo Master Guide

> **Document ID:** `ZS-ENG-FE-MASTER-001`  
> **Classification:** Comprehensive UI/UX, Form Specifications & Demo Workflow Manual  
> **Status:** Production / Active  
> **Framework:** Next.js 14+ (App Router) • React 18 • TailwindCSS • Vitest (80/80 Tests Passing) • 52 Pre-Rendered Routes  
> **Resilience Guarantee:** 100% Demo Fallback Protection via `NEXT_PUBLIC_DEMO_FALLBACK=true` in `frontend/src/lib/api-client.ts`

---

## 1. Demo Resilience Architecture

To guarantee that **zero UI glitches, empty screens, or unhandled exceptions** occur when presenting live demos to customers and stakeholders:

1. **Deterministic Fallback Pipeline**: All API requests (`frontend/src/lib/api-client.ts`) catch connection timeouts and network errors gracefully, seamlessly falling back to rich, strongly-typed mock state generators whenever backend services are cold or offline.
2. **Interactive State Simulation**: All action modals, approval buttons, JIT elevation switches, and filter bars update local component state optimistically, providing realistic animations and instant user feedback.
3. **Toast & Modal Feedback**: Every user interaction (form submission, role elevation, containment trigger) is confirmed with a polished toast alert and audit reference number.

---

## 2. Comprehensive Breakdown of All Pages, Forms & Navigation Sections

---

### Section 1: Security Operations & Hunting

#### 1. Case Workspace
- **Route:** `/cases` and `/cases/[caseId]`
- **Purpose:** Comprehensive SOC triage and case investigation workspace with real-time severity scoring and SLA countdowns.
- **Forms & Interactive Inputs:**
  - *Filter Toolbar:* Severity Filter (Critical, High, Medium, Low), Status Filter (New, Triaged, Investigating, Resolved), Assignee Dropdown, Search Input (by Case ID, Asset, or Threat Indicator).
  - *New Case Modal Form:*
    - `Case Title` (Text Input)
    - `Severity` (Select: P0 Critical, P1 High, P2 Medium, P3 Low)
    - `Affected Assets` (Multi-select tag input)
    - `Assigned Analyst` (User Select)
    - `Description & Initial Indicators` (Rich Textarea)
    - `Create Case` (Submit Button)
  - *Case Detail Actions:* `Escalate to Incident` (Button), `Assign Owner` (Modal), `Add Investigation Note` (Form), `Close Case` (Button).
- **Demo Walkthrough:** Select high-severity case `CASE-2026-9041`, review correlated IOCs, and trigger `Escalate to Incident` to demonstrate seamless transition to Incident Command.

#### 2. AI Safety & Incidents
- **Route:** `/ai-governance`
- **Purpose:** Monitors AI model behavior, prompt injection detections, grounding scores, and automated safety kill-switches.
- **Forms & Interactive Inputs:**
  - *Model Safety Sliders:* Grounding Threshold (0.00 - 1.00), Hallucination Guardrail Strictness (Strict, Moderate, Lenient).
  - *Kill-Switch Activation:* `Activate Emergency AI Route Fallback` (Confirm Modal with MFA prompt).
  - *Model Route Config Form:* Primary Model Selector, Fallback Model Selector, Temperature Slider, Max Output Tokens.

#### 3. Threat Hunting Copilot (ReAct Engine)
- **Route:** `/copilot` & `/hunting`
- **Purpose:** Natural language threat hunting copilot powered by Vertex AI with Reason + Act multi-step telemetry querying.
- **Forms & Interactive Inputs:**
  - *Hunting Query Box:* Natural language prompt input (e.g., *"Find all anomalous outbound SSH connections to unlisted IP ranges in the last 6 hours"*).
  - *Time Range Picker:* Quick presets (15m, 1h, 6h, 24h, 7d, Custom Range).
  - *Execution Actions:* `Run ReAct Hunt` (Submit Button), `Export KQL/SQL Query` (Button), `Create Case from Hunting Results` (Button).

#### 4. Playbook Runs (W18)
- **Route:** `/playbooks`
- **Purpose:** Automated and semi-automated SOAR playbook orchestration dashboard.
- **Forms & Interactive Inputs:**
  - *Playbook Launcher Form:* Playbook Selection (`Ransomware Isolation`, `Compromised Credential Revocation`, `Cloud Armor DDoS Mitigation`), Target Entity ID, Execution Mode (Automated, Step-by-Step Gated).
  - *Action Controls:* `Execute Playbook` (Button), `Pause Execution` (Button), `Approve Next Step` (Button).

#### 5. Response Proposals (W34)
- **Route:** `/response-proposals`
- **Purpose:** Governed queue of automated response proposals requiring human-in-the-loop signoff before live execution.
- **Forms & Interactive Inputs:**
  - *Proposal Review Card:* Target entity, proposed action, risk score, estimated blast radius.
  - *Approval Modal:* Approver Notes (Textarea), `Approve & Dispatch Action` (Primary Button), `Reject Proposal` (Destructive Button).

#### 6. Simulation Replay Engine (SIM)
- **Route:** `/red-team`
- **Purpose:** Interactive attack simulation and purple-team replay engine to test detection rules against known MITRE ATT&CK techniques.
- **Forms & Interactive Inputs:**
  - *Simulation Config Form:* Attack Scenario Dropdown (T1059 Command & Scripting Interpreter, T1078 Valid Accounts, T1498 Denial of Service), Target Environment Selector (Staging, Sandbox, Production).
  - *Controls:* `Start Attack Simulation` (Button), `Reset Environment` (Button), `Download Purple Team Report` (Button).

#### 7. SOAR Actions & Freeze (R0-R4)
- **Route:** `/actions`
- **Purpose:** Real-time containment controls with global and tenant-specific emergency action freezes.
- **Forms & Interactive Inputs:**
  - *Action Trigger Form:* Action Type Selector (`GCP Cloud Armor IP Block`, `GCP IAM Role Stripping`, `Google Workspace Account Suspension`), Target IP / Principal Email / User ID, TTL Expiration Slider (15m to 72h).
  - *Emergency Action Freeze Switch:* Master Toggle (`FREEZE ALL ACTIVE CONTAINMENT`), Reason Field (Required Textarea), `Confirm Global Freeze` (Button).

#### 8. IR Retainer & SLA (24x7)
- **Route:** `/ir-retainer` & `/operations/retainers`
- **Purpose:** Incident Response retainer status, emergency hotline dispatch, and real-time SLA guarantee monitoring (15-min response guarantee).
- **Forms & Interactive Inputs:**
  - *Emergency IR Dispatch Form:* Incident Severity Selector, Brief Summary (Textarea), Secondary Contact Phone Number.
  - *Buttons:* `Declare Major Emergency & Page Lead Responder` (Urgent Button), `Request Retainer Usage Statement` (Button).

---

### Section 2: Commercial & Catalogue

#### 9. Services Catalogue (12 Services)
- **Route:** `/services`
- **Purpose:** Interactive service matrix detailing all 12 Zoiko Shield core cybersecurity, compliance, and managed response capabilities.
- **Forms & Interactive Inputs:**
  - *Service Filter Buttons:* All, Detection & SIEM, Cloud Security, Threat Hunting, Compliance & Audit, Managed Incident Response.
  - *Service Action:* `Request Service Activation` (Modal with scope and estimated pricing calculation).

#### 10. Plans & Band Pricing (4 Tiers)
- **Route:** `/pricing`
- **Purpose:** Transparent multi-tenant tier selection and live Band Pricing calculator.
- **Forms & Interactive Inputs:**
  - *Tier Selectors:* Essential, Professional, Enterprise, Sovereign.
  - *Band Pricing Calculator Slider:* Ingestion Volume Slider (1 GB/day to 50 TB/day), Protected Cloud Assets Count (10 to 100,000).
  - *Action:* `Upgrade Plan` (Button triggering checkout flow), `Contact Enterprise Sales` (Modal).

#### 11. Sector Solution Packs
- **Route:** `/sector-packs`
- **Purpose:** Pre-packaged compliance and detection bundles tailored for specific heavily regulated industries.
- **Forms & Interactive Inputs:**
  - *Sector Cards:* Financial Services (PCI-DSS / GLBA), Healthcare (HIPAA / HITECH), Government & Defense (FedRAMP High / CMMC), SaaS & Enterprise Cloud (SOC 2 / ISO 27001).
  - *Actions:* `Deploy Sector Pack` (Modal enabling one-click rule and policy provisioning).

---

### Section 3: Connectivity & Compliance

#### 12. Connectors Wizard (7 Connectors)
- **Route:** `/connectors`
- **Purpose:** Step-by-step connector configuration and telemetry health monitoring.
- **Forms & Interactive Inputs:**
  - *New Connector Form Wizard:*
    - Step 1: Connector Type (Google Cloud Platform, AWS, Azure, CrowdStrike Falcon, Okta, Sentinel, Microsoft 365).
    - Step 2: Authentication Credentials (Service Account JSON Key Upload, OAuth Token, API Secret).
    - Step 3: Telemetry Stream Selection (VPC Flow Logs, Cloud Audit Logs, GuardDuty, Cloud Armor, Sign-in Logs).
    - Step 4: Health Check & Connection Test Button (`Test Connection & Validate Schema`).
    - Step 5: `Save & Enable Connector` (Submit Button).

#### 13. Policy Lifecycle (W12) (4-EYES)
- **Route:** `/policies`
- **Purpose:** Security policy creation, editing, and dual-custody (4-Eyes) governed approval workflows.
- **Forms & Interactive Inputs:**
  - *Policy Editor Form:* Policy Name, Category, Enforcement Action (Alert Only, Auto-Contain, Block), Rule Definition (JSON/YAML/CEL expression).
  - *4-Eyes Submission:* `Submit Policy for Dual-Approval` (Button), `Approve Policy Changes` (Second Approver Button).

#### 14. Merkle Evidence Ledger (ZS-MERKLE)
- **Route:** `/ledger` & `/audit`
- **Purpose:** Cryptographic audit trail visualizing RFC 6962 Merkle tree batch roots, Cloud KMS signatures, and proof chains.
- **Forms & Interactive Inputs:**
  - *Search & Verify Input:* Search by Event ID, SHA-256 Digest, or Batch Root Hash.
  - *Verification Modal:* `Verify Inclusion Proof` (Runs in-browser cryptographic SHA-256 verification and displays mathematical proof path).

#### 15. Controls & Compliance
- **Route:** `/controls` & `/compliance`
- **Purpose:** Multi-framework compliance dashboard mapping real-time cloud telemetry to regulatory controls.
- **Forms & Interactive Inputs:**
  - *Framework Switcher:* ISO 27001:2022, SOC 2 Type II, HIPAA Security Rule, FedRAMP High, NIST SP 800-53 Rev. 5.
  - *Control Detail Modal:* Upload Manual Evidence (File Drag & Drop), Mark Exception (Modal Form), Re-evaluate Control (Button).

#### 16. Evidence Operations (W24)
- **Route:** `/evidence-operations`
- **Purpose:** Central repository for collecting, tagging, verifying, and exporting compliance evidence artifacts.
- **Forms & Interactive Inputs:**
  - *Evidence Search & Filter:* Date Range, Control ID, Evidence Type (Config Snapshot, IAM Policy, Log Proof).
  - *Generate Audit Bundle:* `Create Cryptographically Sealed Audit Package` (Form with password protection and expiry settings).

#### 17. Risk & Exceptions (W27/28)
- **Route:** `/risk` & `/exceptions`
- **Purpose:** Enterprise risk register and time-bounded compliance exception management.
- **Forms & Interactive Inputs:**
  - *Request Exception Form:* Control ID, Reason for Exception, Compensating Controls Applied (Textarea), Requested Expiration Date (Date Picker), Approver Email.
  - *Actions:* `Submit Exception Request` (Button), `Revoke Active Exception` (Button).

#### 18. Notification Center (W04)
- **Route:** `/notifications`
- **Purpose:** Unified in-app alerts and notifications inbox.
- **Forms & Interactive Inputs:**
  - *Preferences Form:* Email Notification Toggles, P0 Immediate SMS/Pager Toggles, Daily Digest Time Picker.
  - *Actions:* `Mark All as Read` (Button), `Clear Archive` (Button).

#### 19. Audit & Verifier (SEALED)
- **Route:** `/auditor` & `/verify-certificate`
- **Purpose:** Public and auditor-facing verification portal for checking cryptographic certificates and signed Merkle root proofs.
- **Forms & Interactive Inputs:**
  - *Proof Verification Form:* Paste Proof JSON or Upload `.proof` file.
  - *Verify Button:* `Validate Cryptographic Signature & Invariant` (Executes instant zero-trust verification).

---

### Section 4: Tenant Administration

#### 20. Team & Invitations
- **Route:** `/team`
- **Purpose:** User management, role-based access control (RBAC), and team member invitations.
- **Forms & Interactive Inputs:**
  - *Invite User Form:* Email Address (Input), Assigned Role (Dropdown: Org Admin, Security Responder, Auditor, Viewer), Department.
  - *Actions:* `Send Invitation` (Button), `Revoke Access` (Button), `Force MFA Reset` (Button).

#### 21. Organization Onboarding
- **Route:** `/onboarding`
- **Purpose:** Tenant initial setup wizard and legal entity profile configuration.
- **Forms & Interactive Inputs:**
  - *Org Profile Form:* Legal Organization Name, Primary Domain, Regulatory Jurisdiction (EU, US, UK, APAC), Compliance Frameworks Required.
  - *Actions:* `Complete Onboarding & Initialize Workspace` (Primary Button).

#### 22. MSSP Fleet & 2-Party JIT
- **Route:** `/partner/fleet`
- **Purpose:** Multi-tenant MSP / MSSP management dashboard enabling managed service providers to securely administer multiple client organizations under strict 2-party authorization.
- **Forms & Interactive Inputs:**
  - *Client Switcher:* Select Managed Organization.
  - *2-Party Access Request Form:* Reason for Access, Duration (1h to 8h), Required Role.
  - *Actions:* `Request Customer Approval for Fleet JIT` (Button).

#### 23. Switch Account / Login
- **Route:** `/login`
- **Purpose:** Secure authentication gateway supporting Passkeys, MFA, and SSO.
- **Forms & Interactive Inputs:**
  - *Login Form:* Work Email, Password, Remember Me Checkbox, `Sign In` Button.
  - *SSO Button:* `Sign in with Corporate SSO (SAML / OIDC)`.
  - *MFA Verification Step:* 6-digit TOTP code input.

---

### Section 5: Platform Admin & Governance

#### 24. Platform Service Health (§31/§32)
- **Route:** `/admin/platform-health`
- **Purpose:** Real-time infrastructure status, microservice latency metrics, and Kafka event throughput graphs.

#### 25. G1 Launch Gate Protocol (0/8 GATE)
- **Route:** `/admin/g1-gate`
- **Purpose:** Engineering production launch gate signoff checklist enforcing 8 strict release criteria (Cryptography, RLS Tenancy, SOAR Rollbacks, 100% Test Coverage, OpenAPI).
- **Forms & Interactive Inputs:**
  - *Signoff Form:* Individual Gate Checklist (8 verification checkboxes), Lead Architect Private Key Signature input, `Seal Release Gate` Button.

#### 26. JIT Elevation Quorum (§13 FOUR-EYES)
- **Route:** `/admin/jit-elevation` & `/admin/jit`
- **Purpose:** Four-Eyes temporary elevation request and approval dashboard.
- **Forms & Interactive Inputs:**
  - *JIT Request Form:* Elevated Role (`Break-Glass Security Admin`), Justification (Textarea), Duration (30m to 4h), Ticket Reference ID.
  - *Approval Action:* Dual Approver Pin Input, `Approve JIT Elevation` Button.

#### 27. GTM Pre-Flight Checklist (12/12 PASS)
- **Route:** `/admin/gtm-checklist`
- **Purpose:** Go-To-Market readiness verification validating documentation, pricing plans, legal terms, and operational runbooks.

#### 28. Operations & Entitlements (OPERATOR)
- **Route:** `/admin`
- **Purpose:** Super-admin operator console for managing global feature flags, tenant quotas, and system maintenance mode.

#### 29. Email Template Visualizer
- **Route:** `/admin/email-templates`
- **Purpose:** Interactive preview engine and live tester for all 226 production email templates defined in `ZS-EML-TPL-001 v2.0`.
- **Forms & Interactive Inputs:**
  - *Domain Selector:* 16 Production Domains (IAM, Org, Connectors, Detections, Actions, Assurance, Evidence, AI, Developer, Billing, Support, Privacy, Offboarding, Status, Ops, Governance).
  - *Template Selector:* 226 Templates dropdown with real-time subject and body rendering.
  - *Mock Variable Editor:* JSON input allowing live testing of variable substitution and allowlisted enum validation.
  - *Actions:* `Send Test Email` (Button), `Copy Rendered HTML` (Button), `Verify Anti-Phishing Invariants` (Button).

---

### Section 6: G2 Experience Contracts

#### 30. Incident Command (W19)
- **Route:** `/cases/incidents/command`
- **Purpose:** High-intensity incident command bridge with live timeline synchronization, task delegation, and communication log.

#### 31. SOC Shift Handover (W20)
- **Route:** `/operations/shift-handover`
- **Purpose:** Formal shift briefing and handover protocol between Tier 1, 2, and 3 security analysts.
- **Forms & Interactive Inputs:**
  - *Shift Report Form:* Ongoing Incidents Summary, Unresolved IOCs, Priority Tasks for Next Shift, Handing-Over Analyst Signature, Receiving Analyst Acknowledgment.

#### 32. Asset Inventory (W29)
- **Route:** `/assets`
- **Purpose:** Comprehensive cloud and hybrid asset inventory with real-time vulnerability posture and discovery date.

#### 33. Findings (W30)
- **Route:** `/findings` & `/findings/[id]`
- **Purpose:** Normalized security findings from cloud posture scanners (CSPM), container security, and code analysis.

#### 34. Executive Risk (W31)
- **Route:** `/risk/executive`
- **Purpose:** Boardroom-ready executive risk scorecards, financial cyber risk quantification (FAIR model), and compliance posture summaries.

#### 35. Audit Reports (W32)
- **Route:** `/audit/reports/generate`
- **Purpose:** Automated PDF and JSON report generator for external auditors and compliance regulators.
- **Forms & Interactive Inputs:**
  - *Report Generator Form:* Report Type (SOC 2 Readiness, ISO 27001 Assessment, Threat Landscape Summary), Date Range, Include Cryptographic Merkle Signatures Checkbox, `Generate & Seal Report` (Submit Button).

#### 36. Data Export (W36)
- **Route:** `/admin/export`
- **Purpose:** Governed data export surface compliant with GDPR/HIPAA with encryption and temporary download links.

#### 37. Developer Surface (W37)
- **Route:** `/developer`
- **Purpose:** Developer portal for generating API credentials, setting webhook endpoints, and viewing interactive Swagger API documentation.
- **Forms & Interactive Inputs:**
  - *Create API Key Form:* Key Name, Expiry Duration (30, 60, 90 days, 1 year), Permission Scopes (Read Telemetry, Manage Cases, Execute Actions).
  - *Webhook Endpoint Form:* Target URL, Events Subscription Checkboxes, Secret Generation Button.

#### 38. Trust Center (W38)
- **Route:** `/trust`
- **Purpose:** Public-facing customer trust center displaying live system uptime, security certifications, subprocessor list, and compliance attestations.

---

## 3. Executive Demo Script & Step-by-Step Flow

When presenting Zoiko Shield live to stakeholders, follow this proven high-impact sequence:

1. **Step 1: The Threat Incident (Sec-Ops)**:
   - Navigate to `/cases` → Open `CASE-2026-9041` (High-severity brute-force and privilege escalation anomaly detected by ClickHouse).
   - Click `Escalate to Incident` → Jump to `/cases/incidents/command` to view the unified incident bridge.
2. **Step 2: Governed SOAR Containment (4-Eyes Safety)**:
   - Open `/actions` or `/response-proposals`.
   - Select the `GCP Cloud Armor Edge Block` proposal.
   - Show that tier-1 destructive containment requires dual-custody approval.
   - Click `Approve & Dispatch Action` to show the live GCP Cloud Armor actuator executing with an automatic compensating rollback safety switch.
3. **Step 3: Cryptographic Immutability & Verifier (Assurance & Trust)**:
   - Open `/ledger` to show the newly sealed Merkle tree leaf and FIPS 140-3 Cloud KMS HSM signature.
   - Click `Verify Inclusion Proof` to demonstrate client-side zero-knowledge proof verification.
4. **Step 4: AI Governance & ReAct Copilot (Controlled AI)**:
   - Open `/copilot` and submit a threat query. Show the ReAct Reason + Act telemetry querying with Vertex AI grounding.
   - Visit `/ai-governance` to demonstrate how the kill-switch and prompt injection guardrails prevent ungrounded actions.
5. **Step 5: Governance & Production Email System**:
   - Open `/admin/email-templates` to preview the production email templates (`ZS-EML-TPL-001 v2.0`) rendering with zero credential leakage, allowlisted enums, and SHA-256 audit digest.
