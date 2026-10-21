# 🛡️ ZoikoShield Enterprise Platform — Live Demo Screen-by-Screen Links Guide

> **Production Cloud Instance:** `https://app.zoikoshield.com`  
> **Local Development Server:** `http://localhost:3000`  
> **Status:** All routes 100% verified with `200 OK`, zero runtime TypeErrors, zero TypeScript compilation errors.  
> **Recommended Presentation Mode:** Open **[https://app.zoikoshield.com/login](https://app.zoikoshield.com/login)** (or `http://localhost:3000/login`) in your browser and proceed link-by-link in the exact numerical order below.

---

## 🔑 Demonstration Credentials & Tenant Context

- **Default Tenant ID:** `00000000-0000-4000-8000-000000000001` (Acme Financial Services Inc.)
- **Password (for all users):** `Shield@SecOps2026!`
- **Lead Security Analyst (SOC L2):** `sarah.chen@acme.com` *(Default Demo Persona)*
- **Incident Commander / SOC Lead:** `analyst@zoikoshield-demo.com`
- **Tenant Owner / CISO:** `owner@acme.com`
- **Platform Super Admin:** `admin@zoikoshield.io`

---

## 🎬 Master Live Demo Sequence (1 to 26)

### Phase 1: Zero-Trust Onboarding & Telemetry Ingestion

#### 1. Zero-Trust Passkey Authentication
- **Production Cloud URL:** [https://app.zoikoshield.com/login](https://app.zoikoshield.com/login)
- **Local Dev URL:** [http://localhost:3000/login](http://localhost:3000/login)
- **Role / Persona:** Platform Security Operator / CISO
- **Key Action:** Click **"Simulate Passkey / FIDO2 Authentication"** to log in securely.
- **Presenter Talking Point:** *"ZoikoShield enforces WebAuthn FIDO2 biometric authentication with cryptographic session tokens, completely eliminating phishable passwords."*

---

#### 2. Sovereign Organization & Tenant Onboarding
- **Production Cloud URL:** [https://app.zoikoshield.com/onboarding](https://app.zoikoshield.com/onboarding)
- **Local Dev URL:** [http://localhost:3000/onboarding](http://localhost:3000/onboarding)
- **Key Action:** Select your organization name (`Acme Corp`) and sovereign isolation tier, then submit tenant onboarding.
- **Presenter Talking Point:** *"Demonstrates multi-tenant cryptographic isolation with PostgreSQL Row-Level Security (RLS) and sovereign boundary registration."*

---

#### 3. Security Analyst Team & Role-Based Access
- **Production Cloud URL:** [https://app.zoikoshield.com/team](https://app.zoikoshield.com/team)
- **Local Dev URL:** [http://localhost:3000/team](http://localhost:3000/team)
- **Key Action:** Review the active team roster (`Elena Rostova - CISO`, `Marcus Vance - Lead SOC`, `Sarah Chen - Tier-2 Analyst`).
- **Presenter Talking Point:** *"Strict least-privilege governance with hardware token attestation and role separation across SOC tiers."*

---

#### 4. Multi-Cloud Telemetry Connectors Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/connectors](https://app.zoikoshield.com/connectors)
- **Local Dev URL:** [http://localhost:3000/connectors](http://localhost:3000/connectors)
- **Key Action:** View pre-configured connectors (`Microsoft Entra ID`, `CrowdStrike Falcon FDR`, `AWS GuardDuty`, `Generic Webhook Gateway`). Toggle ingestion status or review HMAC secrets.
- **Presenter Talking Point:** *"Live multi-cloud telemetry ingress supporting high-throughput streaming with SHA-256 HMAC signature verification."*

---

#### 5. High-Speed Ingestion & OCSF Normalizer
- **Production Cloud URL:** [https://app.zoikoshield.com/ingestion](https://app.zoikoshield.com/ingestion)
- **Local Dev URL:** [http://localhost:3000/ingestion](http://localhost:3000/ingestion)
- **Key Action:** Review real-time ingress event stream and click **"Trigger Synthetic Ingestion Stream"** to generate live security telemetry.
- **Presenter Talking Point:** *"Raw security logs from heterogeneous vendors are normalized into Open Cybersecurity Schema Framework (OCSF v1.1.0) with zero schema drift."*

---

### Phase 2: Threat Detection, Investigation & Autonomous Hunting

#### 6. Real-Time Security Alerts Triage Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/alerts](https://app.zoikoshield.com/alerts)
- **Local Dev URL:** [http://localhost:3000/alerts](http://localhost:3000/alerts)
- **Key Action:** Inspect the high-severity alert: `Distributed Credential Brute-Force & Entra ID Compromise`. Click the alert card to open its deep-dive.
- **Presenter Talking Point:** *"Sliding-window correlation engine detects credential stuffing and privilege escalation attacks within milliseconds."*

---

#### 7. Alert Deep-Dive & Forensic Evidence Chain
- **Production Cloud URL:** [https://app.zoikoshield.com/alerts/alt-failed-login-bruteforce-01](https://app.zoikoshield.com/alerts/alt-failed-login-bruteforce-01)
- **Local Dev URL:** [http://localhost:3000/alerts/alt-failed-login-bruteforce-01](http://localhost:3000/alerts/alt-failed-login-bruteforce-01)
- **Key Action:** Review the raw OCSF event telemetry, affected user (`usr-compromised-analyst`), and MITRE ATT&CK mapping (`T1078.004`). Click **"Promote Alert to Governed Case"**.
- **Presenter Talking Point:** *"Every alert maintains an immutable cryptographic link back to raw source events, satisfying evidentiary chain-of-custody requirements."*

---

#### 8. Sovereign Security Cases Workspace
- **Production Cloud URL:** [https://app.zoikoshield.com/cases](https://app.zoikoshield.com/cases)
- **Local Dev URL:** [http://localhost:3000/cases](http://localhost:3000/cases)
- **Key Action:** View open cases table and click on `case-2026-auth-attack-01` to enter the investigation workspace.
- **Presenter Talking Point:** *"Full incident lifecycle tracking with automated MITRE technique correlation and blast radius estimation."*

---

#### 9. Live Case Workspace, Timeline & Evidence Ledger
- **Production Cloud URL:** [https://app.zoikoshield.com/cases/case-2026-auth-attack-01](https://app.zoikoshield.com/cases/case-2026-auth-attack-01)
- **Local Dev URL:** [http://localhost:3000/cases/case-2026-auth-attack-01](http://localhost:3000/cases/case-2026-auth-attack-01)
- **Key Action:** Switch between tabs:
  - **Overview & Timeline:** Step-by-step incident progression.
  - **Evidence Ledger:** SHA-256 Merkle-anchored items.
  - **AI Investigation:** Gemini 1.5 Pro hypothesis and recommended containment.
  - **Simulation Receipt:** Pre-flight downtime prediction (0s outage).
- **Presenter Talking Point:** *"All incident evidence is anchored into tamper-evident Merkle epochs, guaranteeing non-repudiation."*

---

#### 10. Autonomous Threat Hunting Copilot & ReAct Graph Explorer
- **Production Cloud URL:** [https://app.zoikoshield.com/hunting](https://app.zoikoshield.com/hunting)
- **Local Dev URL:** [http://localhost:3000/hunting](http://localhost:3000/hunting)
- **Key Action:**
  1. Select a pre-built hypothesis scenario (`Kerberoasting` or `High-Frequency C2 Beaconing`).
  2. Click **"Execute Threat Hunt"** to run the 4-step ReAct reasoning loop.
  3. Inspect the **Multi-Hop Attack Path Trajectory (§14 Graph Explorer)** visualizer showing:
     `usr-analyst (Entry) ➔ ec2-jump-01 (Pivot) ➔ srv-db-prod-01 (Crown Jewel)`.
  4. View the **Blast Radius Assessment** (Estimated outage: 0s, Verdict: SAFE_TO_EXECUTE).
- **Presenter Talking Point:** *"Our ReAct threat hunting copilot correlates multi-hop lateral movement across bastion hosts and predicts blast radius downtime prior to containment execution."*

---

#### 11. AI Security Copilot & §16.1 Decision Review Envelopes
- **Production Cloud URL:** [https://app.zoikoshield.com/copilot](https://app.zoikoshield.com/copilot)
- **Local Dev URL:** [http://localhost:3000/copilot](http://localhost:3000/copilot)
- **Key Action:** Switch between the 6 operational modes (`INVESTIGATION`, `RESPONSE_PROPOSAL`, `HUNTING`, `POLICY_RECOMMENDATION`, `REPORT_GENERATION`, `GENERAL_QUERY`). Inspect the 10-field mandatory Decision Review Envelope.
- **Presenter Talking Point:** *"Enterprise AI governance ensures every generative output includes model armor provenance, citation digests, and human operator sign-off."*

---

### Phase 3: Governed Containment, SOAR Playbooks & JIT Elevation

#### 12. Governed SOAR Playbooks Cockpit & Step Execution
- **Production Cloud URL:** [https://app.zoikoshield.com/playbooks](https://app.zoikoshield.com/playbooks)
- **Local Dev URL:** [http://localhost:3000/playbooks](http://localhost:3000/playbooks)
- **Key Action:** Click on playbook run `run-2026-credential-compromise-01` to view planned steps (`REVOKE_ACTIVE_SESSIONS`, `ENFORCE_MFA_CHALLENGE`, `EMIT_AUDIT_ATTESTATION`).
- **Presenter Talking Point:** *"Every automated action is bound by authority levels (R0 to R3) and requires dual-custody or compensation tokens before altering infrastructure."*

---

#### 13. Human-In-The-Loop Response Containment Proposals
- **Production Cloud URL:** [https://app.zoikoshield.com/response-proposals](https://app.zoikoshield.com/response-proposals)
- **Local Dev URL:** [http://localhost:3000/response-proposals](http://localhost:3000/response-proposals)
- **Key Action:** Review the proposed containment action (`ISOLATE_ENDPOINT` on `srv-db-prod-01`). Click **"Execute Governed Containment"** or **"Simulate in Sandbox"**.
- **Presenter Talking Point:** *"Eliminates dangerous autonomous hallucinations with human-in-the-loop ratification and sandboxed rollback validation."*

---

#### 14. JIT Ephemeral Privileged Access Elevation Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/jit-elevation](https://app.zoikoshield.com/admin/jit-elevation)
- **Local Dev URL:** [http://localhost:3000/admin/jit-elevation](http://localhost:3000/admin/jit-elevation)
- **Key Action:** Click **"Request JIT Elevation"**, enter justification (`P1 Incident Investigation`), set duration (60 min), and submit request.
- **Presenter Talking Point:** *"Zero standing admin privileges. Temporary elevation requires dual-quorum hardware step-up and automatically expires upon timer completion."*

---

#### 15. Emergency SOAR Playbook Freeze Control
- **Production Cloud URL:** [https://app.zoikoshield.com/admin](https://app.zoikoshield.com/admin)
- **Local Dev URL:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Key Action:** View the **SOAR Emergency Kill-Switch** card and click **"Freeze Autonomous Playbooks"** (or **"Unfreeze"** to restore).
- **Presenter Talking Point:** *"Fail-closed break-glass safety mechanism that instantly suspends all automated containment across all regional clusters."*

---

### Phase 4: Compliance, Cryptographic Ledger & Policy Lifecycle

#### 16. Continuous Compliance Controls Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/controls](https://app.zoikoshield.com/controls)
- **Local Dev URL:** [http://localhost:3000/controls](http://localhost:3000/controls)
- **Key Action:** Review live control evaluations (`SOC2 CC6.1`, `SOC2 CC6.6`, `ISO 27001 A.5.18`). Click **"Run Automated Test"** to re-verify compliance in real time.
- **Presenter Talking Point:** *"Continuous compliance automation replaces stressful annual audits with sub-second cryptographic proof evaluation."*

---

#### 17. Sealed Merkle Audit Package Studio
- **Production Cloud URL:** [https://app.zoikoshield.com/audit](https://app.zoikoshield.com/audit)
- **Local Dev URL:** [http://localhost:3000/audit](http://localhost:3000/audit)
- **Key Action:** View the continuous audit package `pkg-soc2-q3-2026`, inspect the root hash `0x89f72b14...`, and download the attestation package.
- **Presenter Talking Point:** *"Packages all telemetry digests, policy approvals, and SOAR execution receipts into a mathematically verifiable audit bundle."*

---

#### 18. Sovereign Post-Quantum Merkle Proof Verifier
- **Production Cloud URL:** [https://app.zoikoshield.com/ledger](https://app.zoikoshield.com/ledger)
- **Local Dev URL:** [http://localhost:3000/ledger](http://localhost:3000/ledger)
- **Key Action:** Enter an evidence hash or epoch ID and click **"Verify Cryptographic Inclusion Proof"** to see instant green verification.
- **Presenter Talking Point:** *"Independent mathematical verification confirming that evidence records have never been tampered with or deleted from the immutable ledger."*

---

#### 19. Cryptographic Verifiable Credentials Verifier
- **Production Cloud URL:** [https://app.zoikoshield.com/verify-certificate](https://app.zoikoshield.com/verify-certificate)
- **Local Dev URL:** [http://localhost:3000/verify-certificate](http://localhost:3000/verify-certificate)
- **Key Action:** Paste a JSON-LD verifiable credential or click **"Verify Sample Attestation"** to inspect digital signatures and public keys.
- **Presenter Talking Point:** *"W3C-standard Verifiable Credentials for auditor attestations, penetration test certificates, and compliance sign-offs."*

---

#### 20. Cedar Policy Lifecycle & Dual-Custody 4-Eyes Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/policies](https://app.zoikoshield.com/policies)
- **Local Dev URL:** [http://localhost:3000/policies](http://localhost:3000/policies)
- **Key Action:**
  1. Inspect policy diffs between previous and proposed Cedar rules.
  2. Click **"Dual-Custody 4-Eyes Sign-Off"** to authorize.
  3. Adjust canary deployment percentage slider (e.g. 10% ➔ 50% ➔ 100%).
- **Presenter Talking Point:** *"Every security policy change requires dual-custody authorization and supports canary deployments to prevent enterprise-wide misconfigurations."*

---

### Phase 5: AI Safety, Platform Health, Commercials & Notifications

#### 21. AI Governance, Model Inventory & Drift Monitor
- **Production Cloud URL:** [https://app.zoikoshield.com/ai-governance](https://app.zoikoshield.com/ai-governance)
- **Local Dev URL:** [http://localhost:3000/ai-governance](http://localhost:3000/ai-governance)
- **Key Action:** Switch between tabs:
  - **Model Inventory:** Registered LLMs (`Gemini 1.5 Pro`, `Claude 3.5 Sonnet`, `Text Embedding 004`).
  - **Drift & PSI Monitoring:** Population Stability Index tracking.
  - **AI Safety Incidents:** Engage or disengage model kill-switches.
- **Presenter Talking Point:** *"Full compliance with NIST AI Risk Management Framework and EU AI Act, featuring automated drift detection and instant model kill-switches."*

---

#### 22. G1 Enterprise Launch Gate 8-Signer Ratification Cockpit
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/g1-gate](https://app.zoikoshield.com/admin/g1-gate)
- **Local Dev URL:** [http://localhost:3000/admin/g1-gate](http://localhost:3000/admin/g1-gate)
- **Key Action:** Review the 8 mandatory executive roles (`CISO`, `DPO`, `VP Eng`, `AI Risk Lead`, `QA Lead`, `SRE Lead`, `Product Lead`, `SOC Lead`). Click to sign or reset.
- **Presenter Talking Point:** *"Enterprise release gate requiring 100% cryptographic sign-off from all 8 required stakeholders before production rollout."*

---

#### 23. Platform Service Health & Non-Destructive DR Drill
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/platform-health](https://app.zoikoshield.com/admin/platform-health)
- **Local Dev URL:** [http://localhost:3000/admin/platform-health](http://localhost:3000/admin/platform-health)
- **Key Action:** Inspect the 6 backend microservices health matrix, then click **"Trigger Non-Destructive DR Restore Drill"** to run an automated backup restore verification.
- **Presenter Talking Point:** *"Real-time platform observability with continuous disaster recovery drills proving backup integrity across PostgreSQL, Kafka, and OpenSearch."*

---

#### 24. Commercial Pricing Ladder & Band Sizing
- **Production Cloud URL:** [https://app.zoikoshield.com/pricing](https://app.zoikoshield.com/pricing)
- **Local Dev URL:** [http://localhost:3000/pricing](http://localhost:3000/pricing)
- **Key Action:** Use the interactive sliders for **Protected Assets** and **Daily Ingestion Volume** to see real-time plan recommendation (`Essential`, `Professional`, `Enterprise Sovereign`).
- **Presenter Talking Point:** *"Predictable, asset-based pricing with transparent billing and zero penalty for security telemetry spikes."*

---

### Phase 6: Grand Finale — Notifications & Template Studio

#### 25. Notification Center & Webhook DLQ Tracking
- **Production Cloud URL:** [https://app.zoikoshield.com/notifications](https://app.zoikoshield.com/notifications)
- **Local Dev URL:** [http://localhost:3000/notifications](http://localhost:3000/notifications)
- **Key Action:** Review delivery receipts, email dispatched statuses, and dead-letter queue (DLQ) tracking with exponential backoff retry metadata.
- **Presenter Talking Point:** *"Guaranteed delivery engine with dead-letter queue handling for webhooks, SMS, and high-priority email alerts."*

---

#### 26. Enterprise Email Template Studio
- **Production Cloud URL:** [https://app.zoikoshield.com/admin/email-templates](https://app.zoikoshield.com/admin/email-templates)
- **Local Dev URL:** [http://localhost:3000/admin/email-templates](http://localhost:3000/admin/email-templates)
- **Key Action:** Browse through the 226 production security email templates, preview live HTML rendering, and send test dispatch.
- **Presenter Talking Point:** *"Complete enterprise notification studio with 226 responsive templates covering breach disclosures, JIT approvals, and compliance receipts."*

---

## ⚡ Presenter Quick Copy-Paste URL Flows

### Production Cloud Flow (`app.zoikoshield.com`)
```
1.  https://app.zoikoshield.com/login
2.  https://app.zoikoshield.com/onboarding
3.  https://app.zoikoshield.com/team
4.  https://app.zoikoshield.com/connectors
5.  https://app.zoikoshield.com/ingestion
6.  https://app.zoikoshield.com/alerts
7.  https://app.zoikoshield.com/alerts/alt-failed-login-bruteforce-01
8.  https://app.zoikoshield.com/cases
9.  https://app.zoikoshield.com/cases/case-2026-auth-attack-01
10. https://app.zoikoshield.com/hunting
11. https://app.zoikoshield.com/copilot
12. https://app.zoikoshield.com/playbooks
13. https://app.zoikoshield.com/response-proposals
14. https://app.zoikoshield.com/admin/jit-elevation
15. https://app.zoikoshield.com/admin
16. https://app.zoikoshield.com/controls
17. https://app.zoikoshield.com/audit
18. https://app.zoikoshield.com/ledger
19. https://app.zoikoshield.com/verify-certificate
20. https://app.zoikoshield.com/policies
21. https://app.zoikoshield.com/ai-governance
22. https://app.zoikoshield.com/admin/g1-gate
23. https://app.zoikoshield.com/admin/platform-health
24. https://app.zoikoshield.com/pricing
25. https://app.zoikoshield.com/notifications
26. https://app.zoikoshield.com/admin/email-templates
```

### Local Dev Server Flow (`localhost:3000`)
```
1.  http://localhost:3000/login
2.  http://localhost:3000/onboarding
3.  http://localhost:3000/team
4.  http://localhost:3000/connectors
5.  http://localhost:3000/ingestion
6.  http://localhost:3000/alerts
7.  http://localhost:3000/alerts/alt-failed-login-bruteforce-01
8.  http://localhost:3000/cases
9.  http://localhost:3000/cases/case-2026-auth-attack-01
10. http://localhost:3000/hunting
11. http://localhost:3000/copilot
12. http://localhost:3000/playbooks
13. http://localhost:3000/response-proposals
14. http://localhost:3000/admin/jit-elevation
15. http://localhost:3000/admin
16. http://localhost:3000/controls
17. http://localhost:3000/audit
18. http://localhost:3000/ledger
19. http://localhost:3000/verify-certificate
20. http://localhost:3000/policies
21. http://localhost:3000/ai-governance
22. http://localhost:3000/admin/g1-gate
23. http://localhost:3000/admin/platform-health
24. http://localhost:3000/pricing
25. http://localhost:3000/notifications
26. http://localhost:3000/admin/email-templates
```
