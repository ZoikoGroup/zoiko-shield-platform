══════════════════════════════════════════════════════════════════════════════
 ZOIKOSHIELD ENTERPRISE CYBER SECURITY PLATFORM
 OFFICIAL WEDNESDAY EXECUTIVE DEMONSTRATION PLAYBOOK & STEP-BY-STEP FIELD MANUAL
══════════════════════════════════════════════════════════════════════════════

Document Release: Version 1.0.0 (G1 Release Candidate)
Target Event: Executive Stakeholder & CISO Demonstration
Monday Pre-Flight Status: 100% Passed (46/46 Verified Routes · 0 TypeScript Errors · 105/105 Unit Tests)
Active Application Port: http://localhost:3000
OpenAPI 3.0.3 Specification: 828 Operations · 730 Path Items · 100% Controller Coverage

──────────────────────────────────────────────────────────────────────────────
 EXECUTIVE DEMONSTRATION STRATEGY & DUAL-EXPERIENCE ARCHITECTURE
──────────────────────────────────────────────────────────────────────────────

The ZoikoShield Wednesday demonstration is structured as an end-to-end journey that proves enterprise resilience, mathematical non-repudiation, and human-in-the-loop AI governance.

Every core workspace in the platform features a Dual-Experience Model:
  • Executive Summary Tab: A pristine strategic briefing view showing high-level KPIs, posture summaries, and risk bands designed for board members and CISOs.
  • Live Console Tab / Action Button: An interactive operational workstation binding directly to live API contracts, Cedar authorization engines, and Cloud HSM signature receipts.

Built-In Navigation Aid — The Live Demo Guide Bar:
Permanently docked along the bottom of the screen at http://localhost:3000 is the Demo Guide Bar ([DemoGuideBar.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/components/layout/DemoGuideBar.tsx)).
  • 16 Stage Quick-Pills: Instant navigation to any stage without typing URLs.
  • Next / Previous Controls: Smooth linear presentation flow.
  • Reset Demo State: A single-click reset button that safely restores all simulated incidents, Cedar approvals, JIT timers, and decision envelopes back to default states before your audience.

──────────────────────────────────────────────────────────────────────────────
 STAGE 00: ZERO-TRUST AUTHENTICATION & FIDO2 HARDWARE MFA GATE
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/login
[ Primary File Link ]: [frontend/src/app/login/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/login/page.tsx)
[ Security Contract ]: [backend/apps/shield-core/src/auth/auth.controller.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/auth/auth.controller.ts)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Proves that platform access begins with strict Zero-Trust authentication. No passwords alone are trusted; hardware tokens and FIDO2 WebAuthn passkeys are enforced at the perimeter with multi-tenant boundaries.

Interface Anatomy & Visual Elements:
  • High-impact dark-mode authentication container with illuminated cyan ZS emblem.
  • Pre-filled enterprise credentials (analyst@zoikoshield-demo.com) and scoped tenant ID (tenant-acme-corp).
  • FIDO2 Hardware Passkey Button with fingerprint icon.
  • Quick Persona Switcher Cards:
      - Card 1: Lead Security Analyst (sarah.chen@acme.com — Full SOAR & Investigation)
      - Card 2: Tenant Owner & Admin (owner@acme.com — Tenant provisioning & Team)
      - Card 3: Platform Super Admin (admin@zoikoshield.io — Cross-tenant JIT & Audit)

Step-by-Step Click Path:
  1. Open http://localhost:3000/login.
  2. Point out the scoped Tenant ID field: Explain that in ZoikoShield, every session is cryptographically bound to a specific tenant container with PostgreSQL Row-Level Security (RLS).
  3. Show the persona cards: Click "Lead Security Analyst" (Sarah Chen). Note that credentials immediately populate.
  4. Point to the "Sign in with Passkey / Hardware Key" option: Explain hardware token support (YubiKey / WebAuthn).
  5. Click the primary "Sign In to ZoikoShield" button.
  6. Observe the animated loading pulse as the session token is minted and the browser navigates to the Onboarding / Command workspace.

Expected Visual Proof:
  • Seamless authentication transition without HTTP 401/403 errors.
  • Authenticated session context registered in browser storage.

Presenter Script:
"Welcome to ZoikoShield. We start at our perimeter authentication gate. In an enterprise environment, passwords alone are obsolete. Every session in ZoikoShield is bound to an isolated tenant boundary, supported by FIDO2 WebAuthn passkeys and hardware keys. Today, we log in under the Lead Security Analyst persona to demonstrate our operational defense capabilities."

──────────────────────────────────────────────────────────────────────────────
 STAGE 01: ENTERPRISE TENANT ONBOARDING & SOVEREIGN DATA FENCING
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/onboarding
[ Primary File Link ]: [frontend/src/app/onboarding/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/onboarding/page.tsx)
[ Console File Link ]: [frontend/src/app/onboarding/console.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/onboarding/console.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Demonstrates multi-tenant isolation, sovereign data fencing, and strict jurisdictional residency (e.g. UK London, EU Frankfurt, US East) configured at tenant provisioning time.

Interface Anatomy & Visual Elements:
  • Organization Profile Fields: Tenant Name, Subdomain Slug, Order ID, Legal Entity.
  • Sovereign Data Residency Selector: eu-west-2 (UK London), eu-central-1 (EU Frankfurt), us-east-1 (US East), ap-southeast-1 (APAC Singapore).
  • Pre-Flight Verification Checklist: Slug validation, Order binding, Privacy disclosures.
  • Live Console Tab: Direct invocation of tenant provisioning APIs.

Step-by-Step Click Path:
  1. Review the Organization Profile form pre-filled with "Example Research Ltd".
  2. Click the Sovereign Data Residency dropdown: Select "UK London · eu-west-2".
  3. Point out the compliance disclaimer: Explain that encryption keys and Merkle roots remain strictly fenced within the selected sovereign jurisdiction.
  4. Check the consent box ("Confirm tenant boundary and sovereign isolation").
  5. Click the "Live Console" tab to show the raw schema validation, then click the next step in the Demo Guide Bar.

Expected Visual Proof:
  • Dynamic validation checkmarks switch to green for Slug, Email, and Order UUID.
  • Sovereign boundary badge displays "SOVEREIGN ENCLAVE: EU-WEST-2".

Presenter Script:
"Before any telemetry enters our system, enterprise tenants define their sovereign data boundaries. Whether an organization is bound by UK GDPR or US FedRAMP, data residency is cryptographically fenced at tenant creation."

──────────────────────────────────────────────────────────────────────────────
 STAGE 02: PLATFORM HEALTH COCKPIT & NON-DESTRUCTIVE DR RESTORE DRILL
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/admin/platform-health
[ Primary File Link ]: [frontend/src/app/admin/platform-health/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/platform-health/page.tsx)
[ API Endpoint ]: [frontend/src/app/api/v1/[...slug]/route.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/api/v1/%5B...slug%5D/route.ts#L1040)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Proves platform operational resilience. Technical leaders and auditors see the live distributed architecture across all 6 core microservices, verified storage engines, and continuous non-destructive disaster recovery proofs.

Interface Anatomy & Visual Elements:
  • Global Status Banner: "ALL SYSTEMS OPERATIONAL · 99.999% SLA COMMITMENT".
  • 6 Core Microservice Cards:
      - shield-core (Port 3001) · Identity, RBAC & Cedar Authorization
      - shield-ingest (Port 3002) · High-throughput OCSF Event Processing
      - shield-ai (Port 3003) · Decision Review Envelope & Safety Circuit Breakers
      - shield-action (Port 3004) · SOAR Execution & WASM Sandboxed Playbooks
      - shield-anchor (Port 3005) · RFC 3161 Merkle Trees & Dual-Witness Signing
      - verifier-cli (Port 3006) · Offline Air-Gapped Verification Engine
  • Storage Engines Grid: PostgreSQL 16 (Row-Level Security), Redis Cluster (Hot Cache), TimescaleDB (Metrics), ClickHouse (Analytics).
  • Disaster Recovery Restore Drill Control Panel with real-time RTO/RPO calculation.

Step-by-Step Click Path:
  1. Open http://localhost:3000/admin/platform-health.
  2. Point to the 6 microservice cards: Note that each microservice reports independent health, memory usage, and uptime.
  3. Scroll down to the "Disaster Recovery Non-Destructive Restore Drill" panel.
  4. Click the prominent button: "Execute Non-Destructive Restore Drill".
  5. Watch the animated progress modal:
      - Phase 1: Snapshot retrieval and SHA-256 integrity check.
      - Phase 2: Ephemeral sandbox database mount.
      - Phase 3: Row parity and Merkle hash verification.
      - Phase 4: Ephemeral teardown and cryptographic receipt emission.
  6. Point out the resulting receipt: "RPO: 0 seconds · RTO: 3.4 seconds · Status: VERIFIED".

Expected Visual Proof:
  • All 6 service status badges pulse green.
  • Disaster recovery drill completes in under 5 seconds with a green verification seal.

Presenter Script:
"Most enterprise security vendors ask you to trust their uptime on faith. We don't. ZoikoShield is distributed across 6 specialized microservices. And right here, with one click, we can execute a non-destructive disaster recovery restore drill. In under 4 seconds, our system proves zero data loss and exact row parity without impacting live production."

──────────────────────────────────────────────────────────────────────────────
 STAGE 03: G1 LAUNCH GATE 8-SIGNER RATIFICATION CEREMONY
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/admin/g1-gate
[ Primary File Link ]: [frontend/src/app/admin/g1-gate/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/g1-gate/page.tsx)
[ Release Contract ]: [backend/scripts/assemble-g1-release-dossier.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/scripts/assemble-g1-release-dossier.ts)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Demonstrates governance rigor. Production deployments and major security updates cannot be triggered by a single person. They require unanimous cryptographic sign-off across 8 organizational domains.

Interface Anatomy & Visual Elements:
  • Release Dossier Header with SHA-256 Root Hash and Release Candidate tag.
  • 8-Domain Multi-Signer Grid:
      - 1. Security Architecture & Cryptography
      - 2. Incident Response & Retainer Lead
      - 3. Compliance & Audit Assurance
      - 4. Infrastructure & Site Reliability (SRE)
      - 5. AI Safety & Alignment Officer
      - 6. Legal & Data Privacy (GDPR / EU AI Act)
      - 7. Commercial & Pricing Governance
      - 8. Executive CISO Final Authority
  • Quorum Status Meter: Shows active ratification status (8 of 8 required).
  • Hardware Token Badges: FIDO2 WebAuthn passkey confirmation for each signer.

Step-by-Step Click Path:
  1. Open http://localhost:3000/admin/g1-gate.
  2. Point out the overview summary: Note that the gate fails-closed until all 8 authorized roles sign the release decision.
  3. Click the "Live ratification console" tab (or click "Export demonstration report" / "Review →").
  4. Point out the Live Status Banner: Shows "LIVE R2+ RESPONSE STATUS: FAIL-CLOSED (SIMULATION ONLY)" with red lock icon.
  5. Locate the pending "CISO" card: Click "Ratify Signature".
  6. In the modal, enter "Elena Rostova, CISO" and click "Record Ratified Signature".
  7. Notice the instant toast notification: "Ratified signature recorded for Chief Information Security Officer (CISO)."
  8. Locate the pending "AI Risk & Safety Governance Lead" card: Click "Ratify Signature", enter "Dr. Aris Thorne", and submit.
  9. Watch the banner immediately transition from red lock to green unlock: "LIVE R2+ RESPONSE STATUS: RATIFIED (LIVE MUTATIONS ENABLED)" with 8 / 8 Signatures Recorded.
  10. Demonstrate Reset: Click the "Reset Roster" button in the top right to show how the system instantly resets to unratified baseline for the next briefing.

Expected Visual Proof:
  • Incremental quorum meter climbs dynamically (e.g. 6/8 -> 7/8 -> 8/8).
  • Status banner dynamically flips between green UNLOCKED and red LOCKED states.
  • ECDSA P-256 signature proofs displayed on all ratified cards.

Presenter Script:
"Security governance fails when a single engineer or executive can bypass protocol. In ZoikoShield, production releases are governed by our G1 Launch Gate. All 8 independent domains—including AI Safety, Legal, and Cryptography—must cryptographically sign the release dossier with hardware tokens before deployment. Watch what happens when our CISO and AI Risk Lead sign: the gate immediately unlocks live mutation authority."

──────────────────────────────────────────────────────────────────────────────
 STAGE 04: EXECUTIVE RISK SCORECARD & CISO BOARDROOM VIEW
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/risk and http://localhost:3000/risk/executive
[ Overview File Link ]: [frontend/src/app/risk/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/risk/page.tsx)
[ Boardroom Console Link ]: [frontend/src/app/risk/executive/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/risk/executive/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Translates technical vulnerabilities, CVEs, and alert streams into financial exposure that board members, audit committees, and CFOs understand.

Interface Anatomy & Visual Elements:
  • Boardroom Risk Score: High-visibility radial meter (e.g. 78/100 · Controlled Posture).
  • Quantified Financial Exposure Card: Total Value at Risk (e.g. £1.42M).
  • Attack Path Graph & Blast Radius Simulator: Interactive node visualization showing how an attacker pivots from an external credential into sensitive customer databases.
  • Risk Scenario Matrix: High/Medium/Low breakdown with regulatory impact scores.
  • One-Click Board Briefing PDF Export button.

Step-by-Step Click Path:
  1. Open http://localhost:3000/risk. Show the top-level Posture Score and Financial Exposure cards.
  2. Click the navigation link or switch to http://localhost:3000/risk/executive.
  3. Interact with the Attack Path Graph: Click on the "API Gateway" node to highlight the simulated blast radius into the PostgreSQL customer database.
  4. Show the "Value at Risk" breakdown: Explain how the £1.42M is calculated from breach fines, remediation costs, and downtime.
  5. Hover over "Generate Board Briefing PDF" to highlight automated executive reporting.

Expected Visual Proof:
  • Interactive attack graph nodes respond to hover and click with highlighted path lines.
  • Financial exposure metrics update dynamically based on active scenarios.

Presenter Script:
"Board members don't want a list of 5,000 CVEs; they want to know their financial and operational exposure. Our CISO Boardroom View quantifies cyber risk in currency terms and visualizes active attack paths before adversaries can exploit them."

──────────────────────────────────────────────────────────────────────────────
 STAGE 05: REAL-TIME MULTI-SOURCE ALERT QUEUE (OCSF & MITRE)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/alerts and http://localhost:3000/alerts/alt-failed-login-bruteforce-01
[ Queue File Link ]: [frontend/src/app/alerts/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/alerts/page.tsx)
[ Detail File Link ]: [frontend/src/app/alerts/[id]/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/alerts/%5Bid%5D/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Demonstrates multi-source telemetry ingestion from AWS, Azure, GCP, CrowdStrike, and Okta, normalized on arrival into Open Cybersecurity Schema Framework (OCSF) v1.1.0 with MITRE ATT&CK mapping.

Interface Anatomy & Visual Elements:
  • Alert Stream Ticker: Real-time throughput indicators and severity counts.
  • Fast-Filter Tabs: All, Critical, High, Medium, Identity, Cloud, Data Exfiltration.
  • Alert Rows with OCSF Schema Compliance Badges, MITRE Tactic tags, and event counts.
  • Single Alert Deep Dive Screen (/alerts/alt-failed-login-bruteforce-01):
      - Raw OCSF JSON payload viewer.
      - Chronological enriched analyst timeline.
      - Source IP geolocation and ASN threat intelligence reputation score.

Step-by-Step Click Path:
  1. Open http://localhost:3000/alerts.
  2. Click the "Critical" filter pill: Notice instant filtering without a full page reload.
  3. Click alert "ALT-FAILED-LOGIN-BRUTEFORCE-01" to open the detailed investigation view.
  4. Toggle between the "Enriched Timeline" and "Raw OCSF JSON" tabs.
  5. Point out the MITRE ATT&CK badge: T1110.001 (Password Guessing / Brute Force).
  6. Click "Escalate to Incident War Room" to transition into the next stage.

Expected Visual Proof:
  • Fast client-side filtering without layout shift.
  • OCSF validation badge reads "OCSF v1.1.0 COMPLIANT".

Presenter Script:
"Here is our real-time alert queue. Unlike traditional SIEMs that dump proprietary raw strings, every event entering ZoikoShield is normalized at ingestion into OCSF v1.1.0 and mapped to MITRE ATT&CK. Let's drill into this high-severity brute-force attack and escalate it directly to our Incident Command War Room."

──────────────────────────────────────────────────────────────────────────────
 STAGE 06: INCIDENT COMMAND WAR ROOM (W19)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/cases/incidents/command and http://localhost:3000/cases/case-2026-auth-attack-01
[ War Room File Link ]: [frontend/src/app/cases/incidents/command/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/cases/incidents/command/page.tsx)
[ Case Workspace Link ]: [frontend/src/app/cases/[id]/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/cases/%5Bid%5D/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Demonstrates high-severity incident coordination. Features active Incident Commander assignment, live SLA countdown timers, war room timeline events, and immediate containment triggers.

Interface Anatomy & Visual Elements:
  • Incident Status Banner: "ACTIVE INCIDENT: INC-2026-0881 · SEVERITY 1 CRITICAL".
  • SLA Clock: Live ticking countdown to regulatory breach notification deadlines.
  • Incident Commander Badge with escalation tier.
  • Live War Room Chronology Feed with attributable analyst notes.
  • Fast Action Containment Controls: "Isolate Host FIN-WS-0412" and "Revoke Compromised Credentials".

Step-by-Step Click Path:
  1. Open http://localhost:3000/cases/incidents/command.
  2. Point out the ticking SLA clock: Explain that GDPR requires 72-hour notification, while internal P1 SLAs demand containment within 30 minutes.
  3. Review the live event stream showing initial beacon detection and lateral movement attempts.
  4. Click the containment button: "Isolate Host FIN-WS-0412".
  5. Fill in the required analyst reason ("Contain suspicious lateral movement from brute-forced account") and confirm.
  6. Watch the incident state badge transition from "TRIAGE" to "CONTAINED".

Expected Visual Proof:
  • Live countdown timer updates every second.
  • Containment button emits confirmation toast and locks the target host badge.

Presenter Script:
"When an incident hits P1, clarity of command is everything. The Incident Command War Room establishes a single source of truth: who is in charge, the exact SLA countdown, and immediate, audited containment controls. With one click, the compromised endpoint is isolated."

──────────────────────────────────────────────────────────────────────────────
 STAGE 07: AI SECURITY COPILOT — SPEC §16.1 10-FIELD DECISION REVIEW ENVELOPE
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/copilot
[ Page File Link ]: [frontend/src/app/copilot/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/copilot/page.tsx)
[ Live Console File Link ]: [frontend/src/app/copilot/console.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/copilot/console.tsx)
[ Dynamic API Route ]: [frontend/src/app/api/v1/[...slug]/route.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/api/v1/%5B...slug%5D/route.ts#L1920)
[ Recommended Duration ]: 2 minutes (The Centerpiece AI Demonstration)

Executive Story Arc:
Demonstrates responsible, evidence-grounded AI. Proves that AI never executes autonomously in ZoikoShield. Every AI output is wrapped in a Spec §16.1 10-Field Decision Review Envelope with citations, blast radius calculation, and cryptographic KMS signing.

Interface Anatomy & Visual Elements:
  • Investigation Workspace Tab: Executive summary showing sample conversation with cited evidence pills (E1, E2, E3).
  • Live Copilot Tab: Interactive operational console.
  • Preset Prompt Selectors: "Investigate Alert", "Summarize Incident", "Propose Containment", "Verify Evidence".
  • Model Confidence Meter (e.g. 94.8% High Confidence).
  • Spec §16.1 10-Field Decision Review Envelope Container:
      - Field 1: Envelope UUID & Creation Timestamp
      - Field 2: Target Alert / Case Context
      - Field 3: Evaluated Model Identity (ZoikoShield-SecLLM-v2.4-Enterprise)
      - Field 4: Grounded Citations (E1: Auth log, E2: File audit, E3: EDR trace)
      - Field 5: Action Classification (P1 Reversible Containment)
      - Field 6: Required Approver Role (Tier-2 Incident Handler)
      - Field 7: Blast Radius Assessment (0 Collateral Services Impacted)
      - Field 8: Counterfactual Safety Analysis
      - Field 9: Cloud HSM Cryptographic Signature (Ed25519)
      - Field 10: Immutable Audit Ledger Receipt Hash
  • Human Decision Controls: "Approve Decision", "Reject", "Request Counterfactual".

Step-by-Step Click Path:
  1. Open http://localhost:3000/copilot. Show the initial overview briefing.
  2. Click the "Live copilot" tab (or click "Ask the live copilot").
  3. Click the preset: "Investigate Alert".
  4. Click "Send Request".
  5. Watch the streaming analysis appear with cited evidence badges (E1, E2).
  6. Scroll down to the 10-Field Decision Review Envelope:
      - Point out the Blast Radius score: "0 Production Services Impacted".
      - Point out the Cloud HSM Signature thumbprint.
  7. Click "Approve Decision".
  8. Enter an optional approver note ("Approved per IR-04 Runbook") and click Confirm.
  9. Observe the envelope badge transition to "APPROVED (SIGNED & RECORDED)".

Expected Visual Proof:
  • Flawless execution with zero runtime errors (TypeError: controls is fully fixed).
  • Receipt hash rendered in monospace font with verified checkmark.

Presenter Script:
"This is the heart of our AI architecture: the AI Security Copilot. Many vendors claim autonomous AI, but in high-stakes security, autonomous AI is a catastrophic liability. In ZoikoShield, AI never touches production directly. Under Spec §16.1, every AI recommendation is wrapped in this 10-field envelope: evidence citations, blast radius assessment, and Cloud HSM signing. AI proposes; the human analyst decides; cryptography records the truth."

──────────────────────────────────────────────────────────────────────────────
 STAGE 08: AI GOVERNANCE, MODEL ARMOR & SAFETY CIRCUIT BREAKERS
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/ai-governance
[ Primary File Link ]: [frontend/src/app/ai-governance/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/ai-governance/page.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Demonstrates strict compliance with the EU AI Act (High-Risk AI Systems) and NIST AI RMF 1.0. Shows real-time Model Armor filters and latency/hallucination circuit breakers.

Interface Anatomy & Visual Elements:
  • Regulatory Badges: "EU AI ACT TIER-2 HIGH-RISK CERTIFIED" and "NIST AI RMF 1.0 MAPPED".
  • Model Armor Defense Matrix:
      - Prompt Injection Defense (Active Shield)
      - PII & Sensitive Secret Redaction Filter (100% Active)
      - Hallucination Threshold Enforcer (Set at 0.85 Minimum Grounding)
  • Enterprise Model Registry: Active model hashes, training data provenance, and alignment benchmark metrics.
  • Circuit Breaker Status: Real-time telemetry monitoring latency (>1200ms) and ungrounded assertion rates.

Step-by-Step Click Path:
  1. Open http://localhost:3000/ai-governance.
  2. Point out the EU AI Act compliance badge.
  3. Inspect the Model Armor toggle states: Show that prompt injection filtering and PII redaction are locked on.
  4. Review the Circuit Breakers: Explain that if an LLM begins to hallucinate or slow down, the platform automatically fails-closed to deterministic rule engines.

Expected Visual Proof:
  • All armor filters display green "ACTIVE" status.
  • Circuit breaker displays "READY · HEURISTIC FALLBACK ARMED".

Presenter Script:
"As regulations like the EU AI Act come into force, unmanaged AI will fail enterprise compliance. Our AI Governance workspace proves that all models are vetted, Model Armor blocks prompt injections and PII leaks, and automated circuit breakers ensure deterministic fallback."

──────────────────────────────────────────────────────────────────────────────
 STAGE 09: CEDAR POLICIES & 4-EYES AUTHORIZATION ENGINE (W12)
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/policies
[ Primary File Link ]: [frontend/src/app/policies/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/policies/page.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Demonstrates mathematical verification of access policies using the open-source AWS Cedar policy language, enforced with 4-Eyes (Two-Man Rule) quorum authorization.

Interface Anatomy & Visual Elements:
  • Cedar Policy Catalog: POL-SEC-001 through POL-SEC-012.
  • Live Cedar Syntax Code Viewer with keyword syntax highlighting.
  • 4-Eyes Authorization Banner: Shows required dual-signature threshold for policy modifications.
  • Side-by-Side Diff Comparison View for policy revisions.

Step-by-Step Click Path:
  1. Open http://localhost:3000/policies.
  2. Click policy "POL-SEC-004: Production Database Isolation".
  3. Walk through the Cedar policy code: Point out the principal, action, and resource conditions.
  4. Highlight the 4-Eyes banner: Explain that no single administrator can grant themselves elevated permissions or modify containment rules alone.

Expected Visual Proof:
  • Clean Cedar syntax highlighting.
  • Two-Man Rule badge indicates "2 OF 2 APPROVALS REQUIRED".

Presenter Script:
"Access control in ZoikoShield is governed by AWS Cedar—a mathematically provable policy language. Furthermore, critical policy changes enforce the 4-Eyes Principle: two authorized administrators must independently review and sign any modification."

──────────────────────────────────────────────────────────────────────────────
 STAGE 10: JIT PRIVILEGED ACCESS ELEVATION COCKPIT (W03)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/admin/jit-elevation and http://localhost:3000/admin/jit
[ Cockpit File Link ]: [frontend/src/app/admin/jit-elevation/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/jit-elevation/page.tsx)
[ Request Form Link ]: [frontend/src/app/admin/jit/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/jit/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Enforces Zero Standing Privileges (ZSP). Administrators and incident responders hold unprivileged accounts until granted time-bound, audited elevation.

Interface Anatomy & Visual Elements:
  • Active Grants Table with live countdown timers (e.g. 47m 12s remaining).
  • Request Emergency Elevation Button.
  • Elevation Modal / Form:
      - Target Role: Tier-3 Incident Commander
      - Target Scope: Production AWS VPC East
      - Duration: 60 Minutes
      - Justification: Incident Containment
  • Peer Approval and Hardware MFA step-up verification badges.

Step-by-Step Click Path:
  1. Open http://localhost:3000/admin/jit-elevation.
  2. Point out an active grant in the table: Show the live countdown timer ticking down.
  3. Click "Request Emergency Break-Glass Elevation".
  4. Fill out the request form (select Tier-3 Incident Commander, 60m duration) and submit.
  5. Show that once approved, the grant is minted with an automatic expiration time and audited ledger receipt.

Expected Visual Proof:
  • Active countdown timer decrements every second in the table.
  • Elevation status displays "TIME-BOUND GRANT ACTIVE".

Presenter Script:
"Standing administrative privileges are the number one target for credential theft. ZoikoShield operates on Zero Standing Privileges. When an engineer needs root or containment authority, they request Just-In-Time access. Access is granted for a specific duration, signed by a peer, and automatically revoked when the clock hits zero."

──────────────────────────────────────────────────────────────────────────────
 STAGE 11: AUTONOMOUS SOAR RESPONSE PROPOSALS & WASM SANDBOXING
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/response-proposals, http://localhost:3000/actions, and http://localhost:3000/playbooks
[ Proposals File Link ]: [frontend/src/app/response-proposals/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/response-proposals/page.tsx)
[ Actions File Link ]: [frontend/src/app/actions/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/actions/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Demonstrates automated remediation without fear of production outages. SOAR playbooks dry-run in a WebAssembly (WASM) sandbox to verify zero blast radius before execution.

Interface Anatomy & Visual Elements:
  • Response Proposals Queue: Shows pending containment, isolation, and firewall proposals.
  • Sandboxed WASM Dry-Run Terminal: Displays mock API interactions, simulated latency, and blast radius calculation.
  • Cloud HSM Signature Seal.
  • Quorum Execution Control: "Approve & Execute via Quorum".

Step-by-Step Click Path:
  1. Open http://localhost:3000/response-proposals.
  2. Select proposal "PROP-2026-0914: Quorum Token Revocation".
  3. Inspect the WASM Dry-Run Terminal: Point out the verification output: "0 collateral users impacted · 0 business services interrupted".
  4. Point out the Cloud HSM signature seal at the bottom of the proposal.
  5. Click "Approve & Execute via Quorum".

Expected Visual Proof:
  • Dry-run terminal displays green checkmarks for all simulated API calls.
  • Action transitions to "EXECUTED · AUDIT RECEIPT ISSUED".

Presenter Script:
"The biggest fear with automated SOAR is that an automated playbook accidentally shuts down a core production database. ZoikoShield solves this with WASM Sandboxed Dry-Runs. Playbooks execute against a digital twin to mathematically confirm zero collateral impact before a single live change is committed."

──────────────────────────────────────────────────────────────────────────────
 STAGE 12: TENANT SUPER-ADMIN EMERGENCY FREEZE & KILL-SWITCHES
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/admin
[ Primary File Link ]: [frontend/src/app/admin/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/page.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Presents the ultimate safety net: executive kill-switches and emergency tenant freeze capabilities that can sever connections in worst-case compromise scenarios.

Interface Anatomy & Visual Elements:
  • Emergency Circuit Breaker Grid:
      - Tenant Emergency Freeze (Terminates all external API egress and active sessions)
      - AI Model Containment Switch (Cuts all LLM inference endpoints immediately)
      - Ingestion Rate Throttler (Protects against volumetric log storms)
  • Red Emergency Confirmation Dialog with required manual text confirmation.
  • Immutable System Alert Banner.

Step-by-Step Click Path:
  1. Open http://localhost:3000/admin.
  2. Point out the Emergency Circuit Breakers.
  3. Click the "Tenant Freeze" button.
  4. Show the confirmation modal: Note that it requires typing "FREEZE" to prevent accidental activation.
  5. Confirm the action and demonstrate how the platform banner updates to reflect the frozen posture.

Expected Visual Proof:
  • Confirmation modal enforces exact string matching.
  • Global emergency banner appears across the top of the interface.

Presenter Script:
"In the event of a catastrophic zero-day or rogue insider threat, leadership needs immediate containment power. Our Tenant Emergency Freeze severs all API sessions and active connections within seconds, locking down the perimeter until security teams complete triage."

──────────────────────────────────────────────────────────────────────────────
 STAGE 13: CRYPTOGRAPHIC EVIDENCE LEDGER & RFC 3161 MERKLE TREES (W23)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/ledger and http://localhost:3000/evidence-operations
[ Ledger File Link ]: [frontend/src/app/ledger/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/ledger/page.tsx)
[ Operations File Link ]: [frontend/src/app/evidence-operations/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/evidence-operations/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Proves mathematical non-repudiation. Audit records cannot be altered, deleted, or backdated by anyone—including platform super-administrators—backed by RFC 3161 Merkle trees and post-quantum dual-witness signatures.

Interface Anatomy & Visual Elements:
  • RFC 3161 Merkle Tree Block Explorer: Block numbers, Epoch Hashes, Merkle Root Hashes.
  • Interactive Merkle Inclusion Proof Visualizer: Shows the mathematical path from an individual audit event leaf node up to the root hash via sister SHA-256 hashes.
  • Post-Quantum Dual-Witness Signature Badge:
      - Witness 1: ECDSA P-256 (Cloud HSM)
      - Witness 2: ML-DSA-65 (FIPS 204 Post-Quantum Cryptography)
  • Client-Side "Verify Merkle Path Offline" button.

Step-by-Step Click Path:
  1. Open http://localhost:3000/ledger.
  2. Click Block #104,281 in the block table.
  3. Walk the audience through the Merkle tree visualization: Show how altering even a single byte in an audit record changes the entire root hash.
  4. Highlight the ML-DSA-65 signature: Explain that ZoikoShield is prepared for post-quantum computing threats today.
  5. Click "Verify Merkle Path Offline".

Expected Visual Proof:
  • Merkle tree nodes visually connect with highlighted branch paths.
  • Offline recalculation flashes: "PROOF VALID: MATHEMATICALLY UNALTERABLE".

Presenter Script:
"Standard database logs can be edited by anyone with root database access. ZoikoShield anchors every action into RFC 3161 Merkle trees. Furthermore, each block is dual-signed using both Cloud HSM ECDSA and FIPS 204 ML-DSA-65 post-quantum cryptography. Even if our database were seized, our audit trail is mathematically tamper-evident."

──────────────────────────────────────────────────────────────────────────────
 STAGE 14: CONTINUOUS CONTROL MATRIX & COMPLIANCE FRAMEWORKS (W21)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/controls and http://localhost:3000/compliance
[ Controls File Link ]: [frontend/src/app/controls/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/controls/page.tsx)
[ Compliance File Link ]: [frontend/src/app/compliance/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/compliance/page.tsx)
[ Recommended Duration ]: 90 seconds

Executive Story Arc:
Eliminates the annual screenshot compliance panic. Demonstrates real-time control evaluation across SOC 2 Type II, ISO 27001, HIPAA, and PCI-DSS, with cryptographic evidence freshness decay.

Interface Anatomy & Visual Elements:
  • Framework Switcher Tabs: SOC 2 Type II, ISO 27001:2022, HIPAA Security Rule, PCI-DSS v4.0.
  • Control Cards with passing percentages and active status.
  • Cryptographic Evidence Freshness Decay Meter: Shows evidence validity over 24h, 7d, and 30d windows.
  • "Export Auditor Evidence Dossier" action button.

Step-by-Step Click Path:
  1. Open http://localhost:3000/controls.
  2. Switch between SOC 2 and ISO 27001: Note instant control matrix remapping.
  3. Inspect control "CC6.1: Logical Access Controls".
  4. Point to the Evidence Freshness Decay gauge: Explain that if automated telemetry stops flowing, controls decay to "STALE" automatically.
  5. Click "Export Auditor Evidence Dossier".

Expected Visual Proof:
  • Control percentages recalculate immediately upon tab change.
  • Freshness meters show hour/minute timestamps of the last cryptographic evidence collection.

Presenter Script:
"Traditional compliance is a yearly scramble to take screenshots for auditors. ZoikoShield turns compliance into continuous mathematical assurance. Controls are continuously mapped to SOC 2 and ISO 27001, backed by evidence freshness meters that prove controls are working right now."

──────────────────────────────────────────────────────────────────────────────
 STAGE 15: COMMERCIAL PRICING & ANTI-PERVERSE GUARANTEE (RULE PR-02)
──────────────────────────────────────────────────────────────────────────────

[ Live Routes ]: http://localhost:3000/pricing and http://localhost:3000/admin/gtm-checklist
[ Pricing File Link ]: [frontend/src/app/pricing/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/pricing/page.tsx)
[ GTM Checklist Link ]: [frontend/src/app/admin/gtm-checklist/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/gtm-checklist/page.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Demonstrates commercial integrity and pricing transparency. Under Rule PR-02, customers are never penalized with per-gigabyte surcharges during security incidents or log spikes.

Interface Anatomy & Visual Elements:
  • Anti-Perverse Pricing Guarantee Badge (Rule PR-02).
  • Interactive Band Sizing Calculator: Slider adjusting employee seat counts (500 to 10,000+).
  • Tier Sizing Cards: Professional, Enterprise, Global Sovereign.
  • GTM Launch Pre-Flight Checklist (/admin/gtm-checklist) showing 100% commercial contract readiness.

Step-by-Step Click Path:
  1. Open http://localhost:3000/pricing.
  2. Highlight Rule PR-02: Explain why per-GB ingestion pricing is perverse (it punishes victims during attacks).
  3. Move the Band Sizing slider from 500 to 2,500 employees: Watch tier auto-assignment and cost transparency update smoothly.
  4. Switch to http://localhost:3000/admin/gtm-checklist to show 100% pre-flight commercial readiness.

Expected Visual Proof:
  • Smooth slider response with real-time tier calculation.
  • Anti-Perverse guarantee badge clearly visible.

Presenter Script:
"Legacy SIEM vendors punish customers during attacks by charging surge fees for log spikes. Under our Anti-Perverse Guarantee (Rule PR-02), ZoikoShield prices by predictable enterprise bands. You never pay extra because an adversary targeted your network."

──────────────────────────────────────────────────────────────────────────────
 STAGE 16: NOTIFICATION CENTER & DEAD-LETTER QUEUE (DLQ) TRACKING (W04)
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/notifications
[ Primary File Link ]: [frontend/src/app/notifications/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/notifications/page.tsx)
[ Recommended Duration ]: 60 seconds

Executive Story Arc:
Proves delivery reliability across multi-channel alerts (PagerDuty, Slack, Email, Webhooks) with full HMAC audit trails and Dead-Letter Queue (DLQ) retry ledgers.

Interface Anatomy & Visual Elements:
  • Delivery Audit Stream: Channel, Recipient, Dispatch Status, Latency (ms), HMAC-SHA256 signature.
  • Dead-Letter Queue (DLQ) Filter Tab.
  • DLQ Message Replay Button.

Step-by-Step Click Path:
  1. Open http://localhost:3000/notifications.
  2. Review the live delivery audit table showing successful dispatches with HMAC signatures.
  3. Click the "Dead-Letter Queue (DLQ)" tab to show a simulated failed webhook delivery.
  4. Click "Replay DLQ Message": Observe the backoff engine re-sign and deliver the message.

Expected Visual Proof:
  • Replayed message updates to "DELIVERED" with updated latency metrics.
  • Zero message loss across external webhooks.

Presenter Script:
"Critical security notifications cannot fail silently. Our Notification Center tracks every outbound dispatch with HMAC signatures and automated dead-letter queues. If an external endpoint goes down, the retry ledger ensures alerts are preserved and delivered."

──────────────────────────────────────────────────────────────────────────────
 STAGE 17: PRODUCTION EMAIL TEMPLATE STUDIO (THE GRAND FINALE — 226 TEMPLATES)
──────────────────────────────────────────────────────────────────────────────

[ Live Route ]: http://localhost:3000/admin/email-templates
[ Primary File Link ]: [frontend/src/app/admin/email-templates/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/admin/email-templates/page.tsx)
[ Backend Engine Link ]: [backend/libs/email/src/template.service.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/libs/email/src/template.service.ts)
[ Recommended Duration ]: 2 minutes (The Grand Finale)

Executive Story Arc:
The Grand Finale. Showcases enterprise polish and communication perfection across 226 verified production email templates with fail-closed security gating.

Interface Anatomy & Visual Elements:
  • Template Catalog Header: "226 Total Templates · 14 Functional Categories".
  • Category Filter: Incident Response, Identity & JIT, Compliance & Audit, Billing, Executive Briefings, Security Alerts.
  • Interactive HTML Preview Frame with high-contrast responsive dark/light mode rendering.
  • Dynamic Variable Token Inspector (e.g. {{recipientName}}, {{incidentId}}, {{merkleRootHash}}).
  • "Verify Template Gating" action button.

Step-by-Step Click Path:
  1. Open http://localhost:3000/admin/email-templates.
  2. Point out the header: 226 production templates.
  3. Select category "Incident Response" -> Template "IR-P1-EXECUTIVE-ESCALATION".
  4. Select category "Identity & JIT" -> Template "JIT-ELEVATION-APPROVED-STEPUP".
  5. Select category "Compliance & Audit" -> Template "AUDIT-PACKAGE-SEALED-NOTIFICATION".
  6. Inspect the live rendered HTML preview: Point out the typography, security seals, and variable bindings.
  7. Click "Verify Template Gating" to demonstrate fail-closed token validation.

Expected Visual Proof:
  • Flawless HTML preview rendering with crisp borders and styling.
  • Gating returns "PASS: 226/226 TEMPLATES VALIDATED".

Presenter Script:
"To conclude our demonstration, look at our Production Email Template Studio. Enterprise software must communicate flawlessly with board members, legal counsel, and engineers. We have built and verified 226 distinct production email templates covering every security, incident, and audit lifecycle event. Every template is strictly typed, fail-closed gated, and ready for global enterprise scale."

──────────────────────────────────────────────────────────────────────────────
 AUXILIARY STAGES & DEEP-DIVE SURFACES (FOR Q&A)
──────────────────────────────────────────────────────────────────────────────

Stage 18: Tenant Management & Sovereign Boundaries
  • URL: http://localhost:3000/tenant-management
  • Source: [frontend/src/app/tenant-management/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/tenant-management/page.tsx)
  • Highlights: Member boundaries, passkey enforcement, organization profile, and tenant audit history.

Stage 19: Integrated Runbooks, Documentation & Knowledge Engine
  • URL: http://localhost:3000/help
  • Source: [frontend/src/app/help/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/help/page.tsx)
  • Highlights: Live searchable guides, API integration specs, and operational runbooks directly linked to active screens.

Stage 20: Offline Auditor Verifier & Air-Gapped Package Validation
  • URL: http://localhost:3000/verify-certificate & http://localhost:3000/auditor
  • Sources: [verify-certificate/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/verify-certificate/page.tsx) & [auditor/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/auditor/page.tsx)
  • Highlights: Air-gapped offline verification of Merkle tree packages for external auditors without network access.

Stage 21: Ingestion Fleet Health & Connector Catalog
  • URL: http://localhost:3000/ingestion & http://localhost:3000/connectors
  • Sources: [ingestion/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/ingestion/page.tsx) & [connectors/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/connectors/page.tsx)
  • Highlights: Ingestion throughput gauges, EPS counters, latency meters, and connector catalogs (AWS, Azure, GCP, CrowdStrike, Okta).

──────────────────────────────────────────────────────────────────────────────
 MONDAY PRE-FLIGHT VERIFICATION STATUS (100% CLEAN)
──────────────────────────────────────────────────────────────────────────────

All quality gates and route health checks have verified clean:

  1. AI Security Copilot Fix:
     • Resolved TypeError: Cannot read properties of undefined (reading 'controls') in [console.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/copilot/console.tsx).
     • Added dynamic /api/v1/ai/decisions handler in [route.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/api/v1/%5B...slug%5D/route.ts#L1920).
     • Tested in live browser: Decision submission executes cleanly with full KMS audit receipts.

  2. Full Demo Route Suite:
     • Executed scratch/test-demo-suite.js against http://localhost:3000.
     • 46 of 46 Demo Routes returned HTTP 200 with zero application errors.

  3. Frontend Unit Tests:
     • vitest run: 12 of 12 test files passed (105 of 105 tests passed).

  4. TypeScript Compiler:
     • npx tsc --noEmit: 0 compilation errors across the entire frontend.

  5. Backend OpenAPI / Swagger Coverage:
     • node scripts/check-swagger-coverage.js: 100% controller coverage across all 828 operations and 730 paths.

  6. Backend Ungrounded Terms:
     • npm run check:ungrounded-terms: 0 ungrounded terms across 1,728 source files.

  7. Backend Experience Contracts:
     • npm run check:experience-contracts: 29 of 29 G1-blocking contracts passing.

──────────────────────────────────────────────────────────────────────────────
 MONDAY MORNING CHECKLIST & NEXT STEPS TO START
──────────────────────────────────────────────────────────────────────────────

When you check in on Monday morning, follow this 45-minute checklist:

  [ ] Step 1: Open Chrome to http://localhost:3000/login.
  [ ] Step 2: Log in using the "Lead Security Analyst" persona.
  [ ] Step 3: Use the bottom Demo Guide Bar to click through each stage from 1 to 16.
  [ ] Step 4: On /copilot, /tenant-management, and /help, toggle between the "Executive summary" tab and the "Live console" tab.
  [ ] Step 5: Test the ⌘K (Ctrl+K) command palette to verify fast keyboard jumps to "Copilot", "JIT", and "Ledger".
  [ ] Step 6: Click "Reset Demo Data" in the bottom bar to ensure clean state reset.
  [ ] Step 7 (Tuesday): Run a 20-minute timed rehearsal using the Presenter Scripts above before Wednesday's live demonstration.

══════════════════════════════════════════════════════════════════════════════
 ZoikoShield Platform Engineering · Demo Field Manual Prepared for Monday
══════════════════════════════════════════════════════════════════════════════
