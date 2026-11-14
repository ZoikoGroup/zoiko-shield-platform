import type {
  Connector,
  Guide,
  HelpArticle,
  PublicPlan,
  PublicSource,
  TrustTopic,
} from './types';

/**
 * Reviewed seed corpus (D5, content-as-code).
 *
 * These entries are engineering samples. They are written to be safe to show
 * publicly: no invented prices, certifications, uptime numbers or connector
 * commitments. Every commercial or certification statement is qualified and
 * points at the owner who must confirm it.
 *
 * In production the same shape is loaded from YAML by `content:publish`; the
 * service reads only PUBLISHED + PUBLIC rows inside the effective window.
 */

export const SOURCES: PublicSource[] = [
  {
    id: 'cap-overview',
    kind: 'CAPABILITY',
    title: 'ZoikoShield platform overview',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product Marketing',
    reviewer: 'Product',
    summary:
      'ZoikoShield brings detection, investigation, governed AI assistance, controlled response and verifiable audit evidence into one security operations platform.',
    body: `ZoikoShield is an enterprise security operations platform for security leadership, SOC teams, IT operations and managed security providers.

The platform is organised around five public capabilities: continuous detection, investigation and case management, governed AI assistance, controlled response with human approval, and verifiable evidence for audit.

Detection normalises telemetry from connected sources so analysts can investigate a single alert across endpoint, identity, network and cloud signals. Investigation keeps the evidence, timeline and decisions with the case. Governed AI can summarise and suggest next steps, but recommendations are advisory and require human authority before any response action.

Controlled response routes proposed actions through policy, approval and an auditable record. Verifiable evidence produces a tamper-evident audit package that can be checked offline.

Public descriptions are capability statements, not a warranty of coverage for a specific environment. Contracted scope, regional availability and service levels are confirmed in an order form or statement of work.`,
    tags: [
      'platform',
      'overview',
      'what is zoikoshield',
      'capabilities',
      'detection',
      'response',
      'evidence',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 3,
    answer:
      'ZoikoShield is an enterprise security operations platform. Its public capabilities cover continuous detection, investigation and case management, governed AI assistance, controlled response with human approval, and verifiable audit evidence. It is built for security leadership, SOC teams, IT operations and MSSP evaluators. Contracted scope and service levels are confirmed with sales.',
  },
  {
    id: 'cap-detection',
    kind: 'CAPABILITY',
    title: 'Threat detection across endpoint, identity, network and cloud',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product Marketing',
    reviewer: 'Product',
    summary:
      'Detection correlates normalised telemetry from connected sources and raises alerts with the context analysts need to triage.',
    body: `ZoikoShield detection starts with normalised telemetry from the sources an organisation connects, such as endpoint, identity, network, cloud and SaaS audit logs.

Rules and behavioural detections evaluate that telemetry and raise alerts with the entities, timeline and supporting events attached. Alerts can be grouped into cases so an analyst works one investigation instead of a queue of disconnected notifications.

Detection quality depends on which sources are connected, how they are configured and the retention available in the contract. The platform does not claim to see telemetry that has not been ingested, and it does not monitor an organisation's environment before onboarding and authorisation are complete.

A public chat cannot inspect alerts, cases or telemetry. Existing customers should use their authenticated ZoikoShield workspace or their contracted support channel.`,
    tags: [
      'detection',
      'threat detection',
      'alerts',
      'telemetry',
      'endpoint',
      'identity',
      'cloud',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Detection correlates normalised endpoint, identity, network, cloud and SaaS telemetry from the sources you connect, then raises alerts with the entities and timeline attached. Alerts can be grouped into cases for investigation. Coverage depends on which sources are connected and the retention in your contract. Public chat cannot inspect your alerts or telemetry.',
  },
  {
    id: 'cap-investigation',
    kind: 'CAPABILITY',
    title: 'Investigation and case management',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product Marketing',
    reviewer: 'Product',
    summary:
      'Cases keep the timeline, evidence, hypotheses and decisions together so an investigation is reviewable after the fact.',
    body: `An investigation in ZoikoShield is a case: a durable record of the alert, affected entities, evidence, analyst notes, hypotheses and decisions.

Cases keep the timeline in order and link the evidence that supported each conclusion. That structure makes handover between analysts easier and gives auditors a record of what was known and decided at each point.

AI assistance can summarise a case or propose next questions, but it does not close a case, change a severity or authorise a response on its own.

Case data belongs to the authenticated tenant workspace. The public assistant has no route to it.`,
    tags: [
      'investigation',
      'case management',
      'cases',
      'timeline',
      'evidence',
      'analyst',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Investigations are kept as cases: a durable record of the alert, entities, evidence, analyst notes and decisions. Cases preserve the timeline and support handover and audit review. AI can summarise or suggest next questions but cannot close a case or authorise action. Case data is only available inside the authenticated tenant workspace.',
  },
  {
    id: 'cap-ai-governance',
    kind: 'CAPABILITY',
    title: 'Governed AI assistance and human authority',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'AI Governance',
    reviewer: 'Security',
    summary:
      'AI in ZoikoShield is advisory. Recommendations carry their evidence, and a human authority approves any response action.',
    body: `ZoikoShield uses AI to reduce reading and drafting effort: summarising a case, explaining an entity, proposing investigation questions and recommending a response for review.

AI output is labelled, source-linked where public content is used, and treated as advisory. A response action is not executed because a model recommended it. The action passes through policy evaluation, approval by an authorised human and an auditable record.

AI use is governed by a use-case registry, prompt and output controls, redaction, retention policy and a kill switch. Model providers and regions are selected through a separate risk and legal review.

The public assistant on this website is a different surface from the authenticated AI copilot. It uses approved public content only and cannot read tenant data.`,
    tags: [
      'ai',
      'governed ai',
      'human approval',
      'copilot',
      'governance',
      'model',
      'advisory',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 3,
    answer:
      'AI in ZoikoShield is advisory. It can summarise cases, explain entities, propose investigation questions and recommend responses, but every response action needs policy evaluation and approval by an authorised human. AI use is governed by a use-case registry, prompt and output controls, redaction, retention policy and a kill switch. The public assistant only uses approved public content.',
  },
  {
    id: 'cap-evidence',
    kind: 'CAPABILITY',
    title: 'Verifiable evidence and audit packages',
    canonicalUrl: '/audit',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product Marketing',
    reviewer: 'Compliance',
    summary:
      'Audit packages collect the evidence for a period and support offline verification of integrity.',
    body: `ZoikoShield can assemble an audit package for a defined period. The package groups the relevant records and evidence and supports offline verification of its integrity.

Verification is about whether the package is intact and internally consistent. It is not, by itself, a certification that an organisation meets a framework. Compliance conclusions depend on the organisation's controls, scope and auditor assessment.

Public pages describe the capability. A specific audit scope or report should be requested through the trust access process and reviewed by the trust team.`,
    tags: [
      'audit',
      'evidence',
      'verification',
      'compliance',
      'audit package',
      'merkle',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'ZoikoShield can assemble an audit package for a defined period and supports offline verification of its integrity. Verification confirms the package is intact and internally consistent; it is not a certification that an organisation meets a framework. Specific audit scope or reports go through the trust access review process.',
  },
  {
    id: 'help-getting-started',
    kind: 'HELP_ARTICLE',
    title: 'Getting started with ZoikoShield',
    canonicalUrl: '/onboarding',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'GENERAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'customer',
    owner: 'Customer Education',
    reviewer: 'Support',
    summary:
      'A high-level path from contract to first investigation: workspace, identity, sources, detections and response policy.',
    body: `Onboarding follows a deliberate order so that detection and response are not switched on before the guardrails exist.

1. Confirm the commercial scope, data region and tenant details with the delivery team.
2. Set up administrator identity with strong authentication, then invite the initial team with least-privilege roles.
3. Connect the first telemetry sources and confirm that events arrive and normalise correctly.
4. Review which detections are appropriate for the environment and tune out known-benign activity.
5. Agree the response policy: which actions need approval, who can approve and what is prohibited.
6. Run a first investigation end to end and verify that evidence is recorded.
7. Only then expand source coverage and automation.

The onboarding checklist in this assistant is a planning aid. It is not a substitute for the contracted implementation plan.`,
    tags: [
      'onboarding',
      'getting started',
      'setup',
      'implementation',
      'first steps',
      'deployment',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'A safe onboarding order is: confirm commercial scope and data region; set up administrator identity and least-privilege roles; connect and validate the first telemetry sources; review detection coverage and tune; agree the response approval policy; run one investigation end to end; then expand coverage and automation. The in-panel checklist is a planning aid, not the contracted implementation plan.',
  },
  {
    id: 'help-connectors',
    kind: 'HELP_ARTICLE',
    title: 'Connecting telemetry sources',
    canonicalUrl: '/connectors',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'INTEGRATION',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'customer',
    owner: 'Solutions Engineering',
    reviewer: 'Solutions',
    summary:
      'How source connection works at a high level, what to prepare, and why version support must be confirmed.',
    body: `A connector brings telemetry from a source into ZoikoShield. Depending on the source, it may be an agent, a cloud-native export, a webhook or an API poller.

Before connecting a source, confirm the account or subscription, the region, the identity or key the connector will use, and the data the source can export. Use a dedicated credential with the minimum permission needed and rotate it through your normal process.

Normalisation maps source fields to a common schema so detections and investigations can work across vendors. Field coverage differs by source and version.

The public connector catalogue shows documented integrations, not a guarantee that every product version or module is supported. Confirm the exact version and deployment model with Solutions Engineering before committing to a rollout.

Documented integrations in the public catalogue: Microsoft Sentinel (cloud SIEM), Splunk (SIEM), CrowdStrike Falcon (endpoint), AWS GuardDuty (cloud), Okta (identity) and Slack (notifications). Confirm region, version, module and permissions for each with Solutions Engineering.

Not verified in public content: ServiceNow (ITSM) and Jira (ticketing). Public content does not confirm that these work for your version, module or deployment model, so the assistant cannot confirm them. Ask Solutions Engineering.`,
    tags: [
      'connectors',
      'integrations',
      'integration',
      'telemetry',
      'ingestion',
      'sources',
      'normalisation',
      'ocsf',
      'splunk',
      'crowdstrike',
      'falcon',
      'sentinel',
      'okta',
      'guardduty',
      'slack',
      'servicenow',
      'jira',
      'siem',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'A connector brings telemetry in through an agent, cloud export, webhook or API poller. Prepare a dedicated least-privilege credential, confirm the region and the fields the source can export, then validate normalisation after connection. The catalogue documents Microsoft Sentinel, Splunk, CrowdStrike Falcon, AWS GuardDuty, Okta and Slack. ServiceNow and Jira are not verified in public content. It is not a guarantee for every product version, so confirm the exact version with Solutions Engineering.',
  },
  {
    id: 'help-response',
    kind: 'HELP_ARTICLE',
    title: 'Response actions, approvals and freeze',
    canonicalUrl: '/actions',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'SECURITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'customer',
    owner: 'Security Engineering',
    reviewer: 'Security',
    summary:
      'Response is policy-gated: proposals are reviewed, approved by an authorised human and recorded. A freeze can stop execution.',
    body: `ZoikoShield separates a response proposal from the action itself. A proposal describes what would change, on which target and why, with the evidence that led to it.

Policy decides whether a proposal is allowed, needs approval or is prohibited. Approval comes from an authorised human role, not from the model and not from the public assistant. Execution is recorded so the action can be reviewed later.

An emergency freeze can stop response execution while detection and investigation continue. Freeze state is visible to operators and is itself audited.

Public chat cannot execute, approve or unfreeze anything. Those controls exist only in the authenticated workspace.`,
    tags: [
      'response',
      'soar',
      'approval',
      'playbook',
      'freeze',
      'isolation',
      'action',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Response is separated from proposal: a proposal states the target, change and evidence, policy decides whether it is allowed or needs approval, and an authorised human approves it. Execution is recorded. An emergency freeze can stop response while detection continues. Public chat cannot execute, approve or unfreeze anything.',
  },
  {
    id: 'help-pricing-guide',
    kind: 'HELP_ARTICLE',
    title: 'How plans and commercial terms are confirmed',
    canonicalUrl: '/pricing',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'COMMERCIAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Commercial',
    reviewer: 'Commercial',
    summary:
      'Plan families, what shapes sizing, and why public chat never quotes a final price.',
    body: `ZoikoShield plans are organised by operating model and scale rather than by a single feature toggle.

Sizing usually depends on the number of assets or identities in scope, telemetry volume, the number of environments, retention, the response model and any regional or sovereign requirement.

Public pages may show a plan family and the features that are typically associated with it. A final price, discount, service level and contract term are confirmed by the commercial team in a written quote or order form.

The public plan families are Essential (a single security operations team), Advanced (several environments, governed response automation), Enterprise (complex, regulated or multi-region estates) and MSSP (managed providers serving multiple customer tenants). All are quote-based.

Service levels, uptime commitments and SLAs are contractual. They are confirmed in writing in the order form and are not promised in public chat.

The public assistant will not invent a price, a discount, a booking or a service-level commitment. If you need a number, request a quote and the team will confirm scope first.`,
    tags: [
      'pricing',
      'plans',
      'cost',
      'quote',
      'commercial',
      'sizing',
      'contract',
      'sla',
      'uptime',
      'guarantee',
      'discount',
      'trial',
      'essential',
      'advanced',
      'enterprise',
      'mssp',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Plan families are organised by operating model and scale. Sizing usually depends on assets or identities, telemetry volume, environments, retention, response model and regional or sovereign requirements. A final price, discount, SLA and term are confirmed in a written quote or order form. This assistant will not invent a price or booking.',
  },
  {
    id: 'help-trust-guide',
    kind: 'HELP_ARTICLE',
    title: 'Security and compliance questions',
    canonicalUrl: '/trust',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CERTIFICATION',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Trust',
    reviewer: 'Legal',
    summary:
      'Where to find current security and compliance information, and why public chat qualifies certification answers.',
    body: `Security and compliance information changes. The current position is the one recorded in the trust centre or provided by the trust team for a specific scope and date.

ZoikoShield can describe its control approach, data protection practices, encryption, residency options and audit evidence process at a public level.

The assistant does not claim a certification, audit opinion or regulatory approval unless the current approved trust content says so for the relevant scope. Where the position is not published, the assistant will say that it cannot confirm it and offer the trust access route.

Encryption: ZoikoShield describes encryption in transit and at rest, with key management controls. Specific algorithms and key custody are confirmed in the security documentation for your scope.

Certifications such as SOC 2, ISO 27001 or HIPAA: public content does not state a current certification, so the assistant cannot confirm one. The trust team can confirm the current status for a given scope and date.

Requests for reports, questionnaires or evidence go through the trust access process so the right owner can review the scope and any confidentiality terms.`,
    tags: [
      'trust',
      'compliance',
      'certification',
      'certified',
      'soc 2',
      'iso 27001',
      'hipaa',
      'gdpr',
      'security',
      'questionnaire',
      'encryption',
      'encrypted',
      'encrypt',
      'key management',
      'at rest',
      'in transit',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 3,
    answer:
      'Security and compliance information is date- and scope-specific. The current position is the one in the trust centre or provided by the trust team. The assistant can describe the control approach, data protection, encryption, residency options and audit evidence process, but it will not claim a certification or audit opinion unless current approved content supports it. Reports and questionnaires go through trust access review.',
  },
  {
    id: 'help-support-routes',
    kind: 'HELP_ARTICLE',
    title: 'Contacting support safely',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'GENERAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'customer',
    owner: 'Support',
    reviewer: 'Support',
    summary:
      'Use the contracted channel for live incidents. Public chat is for general questions and non-urgent intake.',
    body: `Existing customers should use their contracted support or incident channel for anything time-critical. That channel is staffed and tracked under the customer's agreement.

The public assistant can take a general support request, but it cannot open a live incident, dispatch a responder or promise a response time. It also cannot see an organisation's cases or environment.

When submitting a public request, do not include passwords, tokens, customer data, live incident details or anything you would not put in an email to a new contact. The assistant screens input and will reject obvious secrets.

If a request is urgent and you are an existing customer, stop and use your contracted incident channel.`,
    tags: [
      'support',
      'contact',
      'help',
      'incident',
      'urgent',
      'ticket',
      'human',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Existing customers should use their contracted support or incident channel for anything time-critical. The public assistant can take a general, non-urgent support request but cannot open a live incident, dispatch a responder or promise a response time. Do not include passwords, tokens, customer data or live incident details.',
  },
  {
    id: 'help-data-protection',
    kind: 'HELP_ARTICLE',
    title: 'Privacy, data protection and data rights',
    canonicalUrl: '/trust',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'SECURITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Privacy',
    reviewer: 'DPO',
    summary:
      'How to reach the privacy team and what this public assistant does with a conversation.',
    body: `The public assistant creates an anonymous session when you first send a message. It does not create an account, infer a tenant or read customer environments.

Message content is processed to answer the question and is not sent to product analytics. Retention and deletion follow the published privacy notice. Do not enter personal data, credentials or confidential information.

For a data-subject request or a privacy question, use the privacy contact route published in the privacy notice. In this build the assistant links to that route rather than collecting a request itself, until the DPO-approved intake process is enabled.

Marketing consent is separate from a support or sales request and is never pre-selected.`,
    tags: [
      'privacy',
      'gdpr',
      'data protection',
      'data subject',
      'delete my data',
      'retention',
      'consent',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'The assistant creates an anonymous session only when you first send a message. It does not create an account, infer a tenant or read customer environments, and message content is not sent to product analytics. Do not enter personal data, credentials or confidential information. Privacy and data-subject requests go through the privacy route in the published notice.',
  },
  {
    id: 'help-ai-disclosure',
    kind: 'HELP_ARTICLE',
    title: 'What this assistant can and cannot do',
    canonicalUrl: '/assistant',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'GENERAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product',
    reviewer: 'Legal',
    summary:
      'The public assistant answers from approved public content and cannot access accounts, alerts, cases or response controls.',
    body: `This assistant is an AI-assisted public information service. It answers from approved public content, cites what it used and says when it cannot confirm an answer.

It cannot access an account, tenant, alert, case, evidence ledger, playbook or response control. It cannot book a meeting, promise a price, confirm a certification for a scope it cannot see, or start an incident response.

It can take a demo, general support, quote, trust access, technical evaluation or onboarding request as a durable intake. A receipt means the request was accepted for the team, not that a meeting is booked or a ticket is open.

You can clear the conversation at any time. Do not share passwords, tokens or live incident information.`,
    tags: [
      'assistant',
      'ai disclosure',
      'what can you do',
      'limitations',
      'public information',
      'capabilities',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'This assistant answers from approved public content, cites what it used and says when it cannot confirm an answer. It cannot access accounts, tenants, alerts, cases, evidence or response controls, cannot book a meeting or promise a price, and cannot start incident response. It can take a durable intake request and give you a receipt, which is not a booking.',
  },
  {
    id: 'help-deployment',
    kind: 'HELP_ARTICLE',
    title: 'Deployment models and regional considerations',
    canonicalUrl: '/trust',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'SECURITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Solutions Engineering',
    reviewer: 'Solutions',
    summary:
      'Cloud-hosted and region-specific options exist; exact availability depends on contract and region.',
    body: `ZoikoShield is offered as a hosted service. Data region, retention and any sovereign or dedicated deployment requirement are agreed during commercial and technical review.

Regional availability, data residency commitments and any dedicated deployment option depend on the contract and the current service catalogue. Public content does not promise a region that has not been confirmed for your organisation.

A technical evaluation can cover the deployment model, identity integration, network path, telemetry sources and data handling. Use the technical evaluation request if you need those topics confirmed in writing.

Public content describes a hosted, cloud-delivered service (SaaS). It does not describe an on-premises product; any dedicated or sovereign deployment requirement is agreed during commercial and technical review.`,
    tags: [
      'deployment',
      'region',
      'residency',
      'sovereign',
      'cloud',
      'hosting',
      'architecture',
      'saas',
      'hosted',
      'on-premises',
      'on-prem',
      'premises',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'ZoikoShield is offered as a hosted service. Data region, retention and any sovereign or dedicated deployment requirement are agreed during commercial and technical review. Regional availability and residency commitments depend on the contract and current service catalogue. A technical evaluation can confirm deployment, identity, network and data handling in writing.',
  },
  {
    id: 'help-use-cases',
    kind: 'HELP_ARTICLE',
    title: 'Common ZoikoShield use cases',
    canonicalUrl: '/help',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'CAPABILITY',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Product Marketing',
    reviewer: 'Product',
    summary:
      'Security operations, threat investigation, governed automation, compliance evidence and MSSP delivery.',
    body: `Common public use cases include:

Security operations: consolidate alert triage and investigation so analysts work from one case timeline.

Threat investigation: correlate endpoint, identity, network and cloud evidence to understand scope and impact.

Governed automation: propose response actions, route them through approval and keep an audit record.

Compliance evidence: assemble period evidence and verify package integrity offline.

Managed security delivery: give an MSSP a repeatable operating model across customer tenants, with isolation and approval controls.

These are descriptions of intended use. Fit for a specific environment is confirmed in a discovery or technical evaluation.`,
    tags: [
      'use cases',
      'use case',
      'soc',
      'mssp',
      'compliance',
      'automation',
      'investigation',
    ],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 2,
    answer:
      'Common use cases are security operations and alert triage, threat investigation across endpoint, identity, network and cloud, governed response automation with approval, compliance evidence and audit verification, and managed security delivery for MSSPs. Fit for a specific environment is confirmed in discovery or a technical evaluation.',
  },
  {
    id: 'guide-first-30-days',
    kind: 'GUIDE',
    title: 'First 30 days onboarding guide',
    canonicalUrl: '/onboarding',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'GENERAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'customer',
    owner: 'Customer Education',
    reviewer: 'Support',
    summary:
      'A deterministic checklist for the first month after contract signature.',
    body: 'A guided checklist covering access, sources, detections, response policy and the first investigation.',
    tags: ['onboarding', 'guide', 'checklist', '30 days'],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 1,
    answer:
      'Use the onboarding checklist: confirm scope and region, set up administrators and roles, connect and validate sources, review detections, agree the response policy, run one investigation end to end, then expand.',
  },
  {
    id: 'plan-essential',
    kind: 'PLAN',
    title: 'ZoikoShield Essential',
    canonicalUrl: '/pricing',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'COMMERCIAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Commercial',
    reviewer: 'Commercial',
    summary:
      'Core detection and investigation for a single security team, with standard support and a quote-based price.',
    body: `Essential is the entry plan family for a single security operations team that needs detection, investigation and evidence basics.

Typical scope: one production environment, core telemetry sources, standard retention, and business-hours support. Response automation and governed AI are available as options, subject to the current service catalogue.

Pricing is quote-based. Sizing depends on assets or identities, telemetry volume, retention and the response model.`,
    tags: ['essential', 'plan', 'pricing', 'entry', 'small team'],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 1,
  },
  {
    id: 'plan-advanced',
    kind: 'PLAN',
    title: 'ZoikoShield Advanced',
    canonicalUrl: '/pricing',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'COMMERCIAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Commercial',
    reviewer: 'Commercial',
    summary:
      'For multi-environment operations that need governed automation, broader retention and extended support.',
    body: `Advanced is for security teams operating more than one environment or a larger telemetry estate.

It typically includes broader source coverage, longer retention options, governed response automation with approval, and extended support hours. Exact inclusions are confirmed in the order form.

Pricing is quote-based and sized on assets or identities, telemetry volume, environments, retention and response model.`,
    tags: ['advanced', 'plan', 'pricing', 'multi environment', 'automation'],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 1,
  },
  {
    id: 'plan-enterprise',
    kind: 'PLAN',
    title: 'ZoikoShield Enterprise',
    canonicalUrl: '/pricing',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'COMMERCIAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Commercial',
    reviewer: 'Commercial',
    summary:
      'For complex estates with dedicated delivery, advanced governance and contractual service levels.',
    body: `Enterprise is for complex, regulated or multi-region estates that need dedicated delivery and advanced governance.

It can include custom retention, region-specific deployment review, advanced approval models, named delivery contacts and contractual service levels. Availability and inclusions are confirmed through commercial and technical review.

Pricing is quote-based. Do not treat public plan descriptions as a binding offer.`,
    tags: ['enterprise', 'plan', 'pricing', 'regulated', 'multi region', 'sla'],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 1,
  },
  {
    id: 'plan-mssp',
    kind: 'PLAN',
    title: 'ZoikoShield for MSSPs',
    canonicalUrl: '/pricing',
    status: 'PUBLISHED',
    classification: 'PUBLIC',
    claimType: 'COMMERCIAL',
    markets: ['us', 'eu', 'uk', 'apac', 'undecided'],
    locale: 'en-US',
    audience: 'prospect',
    owner: 'Commercial',
    reviewer: 'Partners',
    summary:
      'Multi-customer operating model with tenant isolation, delegated administration and approval controls.',
    body: `The MSSP plan family is designed for providers operating security services across multiple customer tenants.

It typically covers tenant isolation, delegated administration, approval controls, evidence handling and reporting. Commercial structure and per-tenant terms are agreed with the partner team.

Pricing is quote-based and depends on the number of tenants, aggregate telemetry, service model and support commitments.`,
    tags: ['mssp', 'partner', 'multi tenant', 'plan', 'pricing'],
    effectiveFrom: '2026-10-01',
    reviewAt: '2027-01-31',
    revision: 1,
  },
];

export const HELP_ARTICLES: HelpArticle[] = SOURCES.filter(
  (source) => source.kind === 'HELP_ARTICLE',
).map((source) => ({
  id: source.id,
  title: source.title,
  category: source.tags.includes('onboarding')
    ? 'Getting started'
    : source.tags.includes('integrations')
      ? 'Integrations'
      : source.tags.includes('support')
        ? 'Support'
        : source.tags.includes('privacy')
          ? 'Privacy'
          : source.tags.includes('pricing')
            ? 'Commercial'
            : source.tags.includes('response')
              ? 'Response'
              : 'Platform',
  summary: source.summary,
  body: source.body,
  sourceId: source.id,
}));

export const PLANS: PublicPlan[] = [
  {
    id: 'essential',
    name: 'Essential',
    tagline: 'Core detection and investigation',
    audience: 'A single security operations team',
    priceDisplay: 'QUOTE_REQUIRED',
    priceNote: 'Quote-based. Confirmed after scope and sizing review.',
    sourceId: 'plan-essential',
    features: [
      {
        key: 'detection',
        label: 'Continuous detection',
        state: 'INCLUDED',
        sourceId: 'plan-essential',
      },
      {
        key: 'cases',
        label: 'Case investigation',
        state: 'INCLUDED',
        sourceId: 'plan-essential',
      },
      {
        key: 'evidence',
        label: 'Audit evidence basics',
        state: 'INCLUDED',
        sourceId: 'plan-essential',
      },
      {
        key: 'response',
        label: 'Governed response automation',
        state: 'OPTIONAL',
        sourceId: 'plan-essential',
      },
      {
        key: 'ai',
        label: 'Governed AI assistance',
        state: 'OPTIONAL',
        sourceId: 'plan-essential',
      },
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    tagline: 'Multi-environment operations',
    audience: 'Teams running several environments',
    priceDisplay: 'QUOTE_REQUIRED',
    priceNote: 'Quote-based. Confirmed after scope and sizing review.',
    sourceId: 'plan-advanced',
    features: [
      {
        key: 'detection',
        label: 'Continuous detection',
        state: 'INCLUDED',
        sourceId: 'plan-advanced',
      },
      {
        key: 'cases',
        label: 'Case investigation',
        state: 'INCLUDED',
        sourceId: 'plan-advanced',
      },
      {
        key: 'evidence',
        label: 'Audit evidence',
        state: 'INCLUDED',
        sourceId: 'plan-advanced',
      },
      {
        key: 'response',
        label: 'Governed response automation',
        state: 'INCLUDED',
        sourceId: 'plan-advanced',
      },
      {
        key: 'retention',
        label: 'Extended retention options',
        state: 'OPTIONAL',
        sourceId: 'plan-advanced',
      },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Complex and regulated estates',
    audience: 'Regulated, multi-region organisations',
    priceDisplay: 'QUOTE_REQUIRED',
    priceNote: 'Quote-based. Contractual SLAs and scope confirmed in writing.',
    sourceId: 'plan-enterprise',
    features: [
      {
        key: 'detection',
        label: 'Continuous detection',
        state: 'INCLUDED',
        sourceId: 'plan-enterprise',
      },
      {
        key: 'cases',
        label: 'Case investigation',
        state: 'INCLUDED',
        sourceId: 'plan-enterprise',
      },
      {
        key: 'evidence',
        label: 'Audit evidence',
        state: 'INCLUDED',
        sourceId: 'plan-enterprise',
      },
      {
        key: 'response',
        label: 'Advanced approval models',
        state: 'OPTIONAL',
        sourceId: 'plan-enterprise',
      },
      {
        key: 'sla',
        label: 'Contractual service levels',
        state: 'OPTIONAL',
        sourceId: 'plan-enterprise',
      },
    ],
  },
  {
    id: 'mssp',
    name: 'MSSP',
    tagline: 'Multi-customer service delivery',
    audience: 'Managed security providers',
    priceDisplay: 'QUOTE_REQUIRED',
    priceNote: 'Quote-based. Per-tenant terms agreed with the partner team.',
    sourceId: 'plan-mssp',
    features: [
      {
        key: 'isolation',
        label: 'Tenant isolation',
        state: 'INCLUDED',
        sourceId: 'plan-mssp',
      },
      {
        key: 'admin',
        label: 'Delegated administration',
        state: 'INCLUDED',
        sourceId: 'plan-mssp',
      },
      {
        key: 'approvals',
        label: 'Approval controls',
        state: 'INCLUDED',
        sourceId: 'plan-mssp',
      },
      {
        key: 'reporting',
        label: 'Evidence and reporting',
        state: 'INCLUDED',
        sourceId: 'plan-mssp',
      },
    ],
  },
];

export const CONNECTORS: Connector[] = [
  {
    id: 'microsoft-sentinel',
    name: 'Microsoft Sentinel',
    category: 'Cloud SIEM',
    availability: 'VERIFIED',
    note: 'Documented integration. Confirm workspace region and export scope with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'splunk',
    name: 'Splunk',
    category: 'SIEM',
    availability: 'VERIFIED',
    note: 'Documented integration. Confirm version and index permissions with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'crowdstrike-falcon',
    name: 'CrowdStrike Falcon',
    category: 'Endpoint',
    availability: 'VERIFIED',
    note: 'Documented integration. Confirm module and API scope with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'aws-guardduty',
    name: 'AWS GuardDuty',
    category: 'Cloud',
    availability: 'VERIFIED',
    note: 'Documented integration. Confirm account and region coverage with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'okta',
    name: 'Okta',
    category: 'Identity',
    availability: 'VERIFIED',
    note: 'Documented integration. Confirm tenant and log export scope with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'servicenow',
    name: 'ServiceNow',
    category: 'ITSM',
    availability: 'NOT_VERIFIED',
    note: 'Availability for your version and module is not verified in public content. Confirm with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'jira',
    name: 'Jira',
    category: 'Ticketing',
    availability: 'NOT_VERIFIED',
    note: 'Availability for your deployment model is not verified in public content. Confirm with Solutions.',
    sourceId: 'help-connectors',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Collaboration',
    availability: 'VERIFIED',
    note: 'Documented notification integration. Confirm workspace governance with Solutions.',
    sourceId: 'help-connectors',
  },
];

export const TRUST_TOPICS: TrustTopic[] = [
  {
    id: 'security-program',
    title: 'Security programme',
    summary:
      'ZoikoShield operates a documented security programme with named ownership, risk review and change control. Current scope and evidence are provided by the trust team.',
    claimPolicy: 'QUALIFY',
    sourceId: 'help-trust-guide',
  },
  {
    id: 'certifications',
    title: 'Certifications and audit reports',
    summary:
      'Certification and audit report status is date- and scope-specific. The assistant will not claim a certification that current approved trust content does not support.',
    claimPolicy: 'ABSTAIN',
    sourceId: 'help-trust-guide',
  },
  {
    id: 'data-protection',
    title: 'Data protection and privacy',
    summary:
      'The public assistant uses an anonymous session, does not infer a tenant and does not send message content to product analytics. Retention follows the published privacy notice.',
    claimPolicy: 'ALLOW',
    sourceId: 'help-data-protection',
  },
  {
    id: 'encryption',
    title: 'Encryption and key management',
    summary:
      'ZoikoShield describes encryption in transit and at rest, with key management controls. Specific algorithms and key custody are confirmed in the security documentation for your scope.',
    claimPolicy: 'QUALIFY',
    sourceId: 'help-trust-guide',
  },
  {
    id: 'residency',
    title: 'Data residency',
    summary:
      'Data region and residency commitments are agreed in the contract. Public content does not promise a region that has not been confirmed for your organisation.',
    claimPolicy: 'QUALIFY',
    sourceId: 'help-deployment',
  },
  {
    id: 'audit-evidence',
    title: 'Audit evidence',
    summary:
      'Audit packages support offline verification of integrity. Verification is not a certification that an organisation meets a framework.',
    claimPolicy: 'QUALIFY',
    sourceId: 'cap-evidence',
  },
];

export const GUIDES: Guide[] = [
  {
    id: 'first-30-days',
    title: 'First 30 days',
    intro: 'A planning checklist for a safe onboarding sequence.',
    steps: [
      {
        id: 'scope',
        title: 'Confirm scope and region',
        body: 'Agree the environments, data region, retention and any sovereign requirement with the delivery team.',
        choices: [
          { id: 'done', label: 'Confirmed', next: 'identity' },
          { id: 'help', label: 'I need help with scope', next: 'scope-help' },
        ],
      },
      {
        id: 'scope-help',
        title: 'Scope needs a human',
        body: 'Scope and residency commitments are confirmed in writing by the commercial and delivery team. Use the onboarding contact request.',
        choices: [{ id: 'request', label: 'Request onboarding contact' }],
      },
      {
        id: 'identity',
        title: 'Set up administrator identity',
        body: 'Enable strong authentication for administrators, then invite the initial team with least-privilege roles.',
        choices: [
          { id: 'done', label: 'Administrators set up', next: 'sources' },
          { id: 'later', label: 'Not yet' },
        ],
      },
      {
        id: 'sources',
        title: 'Connect the first sources',
        body: 'Connect a small, well-understood set of sources and confirm events arrive and normalise correctly before expanding.',
        choices: [
          { id: 'done', label: 'Sources validated', next: 'detections' },
          { id: 'catalogue', label: 'See connector catalogue' },
        ],
      },
      {
        id: 'detections',
        title: 'Review detections',
        body: 'Review which detections fit the environment and tune known-benign activity. Do not enable broad automation yet.',
        choices: [
          { id: 'done', label: 'Detection review done', next: 'response' },
          { id: 'later', label: 'Not yet' },
        ],
      },
      {
        id: 'response',
        title: 'Agree the response policy',
        body: 'Define which actions need approval, who can approve and what is prohibited. Response stays human-approved.',
        choices: [
          { id: 'done', label: 'Policy agreed', next: 'first-case' },
          { id: 'help', label: 'I need help with policy' },
        ],
      },
      {
        id: 'first-case',
        title: 'Run the first investigation',
        body: 'Work one investigation end to end and verify that evidence and decisions are recorded.',
        choices: [{ id: 'done', label: 'Checklist complete' }],
      },
    ],
  },
];

export const DISCOVERY_CATALOG = {
  priorities: [
    { id: 'detect', label: 'Detect threats earlier' },
    { id: 'investigate', label: 'Investigate faster' },
    { id: 'automate', label: 'Automate response safely' },
    { id: 'evidence', label: 'Prove compliance with evidence' },
    { id: 'mssp', label: 'Deliver security to multiple customers' },
  ],
  roles: [
    { id: 'ciso', label: 'CISO / security leadership' },
    { id: 'soc', label: 'SOC analyst or manager' },
    { id: 'it', label: 'IT operations' },
    { id: 'mssp', label: 'MSSP / service provider' },
    { id: 'procurement', label: 'Procurement' },
  ],
  environments: [
    { id: 'cloud', label: 'Mostly cloud' },
    { id: 'hybrid', label: 'Hybrid cloud and on-premises' },
    { id: 'regulated', label: 'Regulated or sovereign' },
    { id: 'undecided', label: 'Not sure yet' },
  ],
  markets: [
    { id: 'us', label: 'United States' },
    { id: 'eu', label: 'European Union' },
    { id: 'uk', label: 'United Kingdom' },
    { id: 'apac', label: 'Asia Pacific' },
    { id: 'undecided', label: 'Not decided' },
  ],
  disclaimer:
    'Discovery matches are guidance from published capabilities, not a recommendation, quote or security assessment. A human review confirms fit.',
};

export const DISCOVERY_RULES = {
  rulesetVersion: '2026.10.1',
  rules: [
    {
      id: 'detect-cloud',
      priority: 'detect',
      environment: 'cloud',
      capabilityIds: ['cap-detection', 'cap-investigation'],
      title: 'Start with detection and triage',
      why: 'Cloud telemetry is the fastest place to prove detection value without a broad rollout.',
    },
    {
      id: 'investigate-hybrid',
      priority: 'investigate',
      environment: 'hybrid',
      capabilityIds: ['cap-investigation', 'cap-detection'],
      title: 'Unify investigation across hybrid sources',
      why: 'A single case timeline matters most when evidence is split across cloud and on-premises tools.',
    },
    {
      id: 'automate-any',
      priority: 'automate',
      environment: 'any',
      capabilityIds: ['cap-ai-governance', 'help-response'],
      title: 'Automate with human approval',
      why: 'Response value comes with policy and approval guardrails, not from autonomous execution.',
    },
    {
      id: 'evidence-regulated',
      priority: 'evidence',
      environment: 'regulated',
      capabilityIds: ['cap-evidence', 'help-trust-guide'],
      title: 'Make evidence reviewable',
      why: 'Regulated estates need period evidence that can be verified and discussed with an auditor.',
    },
    {
      id: 'mssp-any',
      priority: 'mssp',
      environment: 'any',
      capabilityIds: ['plan-mssp', 'cap-investigation'],
      title: 'Operate across customer tenants',
      why: 'MSSP delivery depends on isolation, delegated administration and approval controls.',
    },
  ],
};

export const ONBOARDING = {
  personas: [
    { id: 'ciso', label: 'Security leadership' },
    { id: 'soc', label: 'SOC team' },
    { id: 'it', label: 'IT operations' },
    { id: 'mssp', label: 'MSSP delivery' },
  ],
  questions: [
    {
      id: 'scope',
      persona: 'ciso',
      question: 'Which environments and regions are in the first phase?',
      topic: 'scope',
    },
    {
      id: 'owners',
      persona: 'ciso',
      question: 'Who owns risk acceptance and response approval?',
      topic: 'governance',
    },
    {
      id: 'identity',
      persona: 'soc',
      question: 'Which identity provider and administrator roles will be used?',
      topic: 'identity',
    },
    {
      id: 'sources',
      persona: 'soc',
      question:
        'Which three telemetry sources matter most in the first 30 days?',
      topic: 'sources',
    },
    {
      id: 'detections',
      persona: 'soc',
      question: 'Which known-benign activity should be tuned before go-live?',
      topic: 'detections',
    },
    {
      id: 'network',
      persona: 'it',
      question: 'What network path and egress rules are required?',
      topic: 'network',
    },
    {
      id: 'retention',
      persona: 'it',
      question:
        'What retention period is required for investigations and evidence?',
      topic: 'retention',
    },
    {
      id: 'tenants',
      persona: 'mssp',
      question:
        'How are customer tenants and delegated administrators structured?',
      topic: 'tenancy',
    },
    {
      id: 'reporting',
      persona: 'mssp',
      question: 'Which customer reports and evidence exports are required?',
      topic: 'reporting',
    },
  ],
  checklist: [
    {
      id: 'scope',
      topic: 'scope',
      title: 'Confirm phase-one scope and data region',
      sourceId: 'help-getting-started',
    },
    {
      id: 'identity',
      topic: 'identity',
      title: 'Set up administrators and least-privilege roles',
      sourceId: 'help-getting-started',
    },
    {
      id: 'sources',
      topic: 'sources',
      title: 'Connect and validate the first telemetry sources',
      sourceId: 'help-connectors',
    },
    {
      id: 'detections',
      topic: 'detections',
      title: 'Review detection coverage and tune known-benign activity',
      sourceId: 'cap-detection',
    },
    {
      id: 'response',
      topic: 'governance',
      title: 'Agree response approval policy and prohibited actions',
      sourceId: 'help-response',
    },
    {
      id: 'evidence',
      topic: 'retention',
      title: 'Confirm retention and evidence review process',
      sourceId: 'cap-evidence',
    },
    {
      id: 'first-case',
      topic: 'scope',
      title: 'Run one investigation end to end',
      sourceId: 'cap-investigation',
    },
  ],
};

export const ROUTES = {
  WEB_CAPABILITIES: {
    label: 'Explore capabilities',
    href: '/help',
    owner: 'Web',
    status: 'PUBLISHED',
  },
  WEB_PRICING: {
    label: 'Plans and pricing',
    href: '/pricing',
    owner: 'Commercial',
    status: 'PUBLISHED',
  },
  WEB_DEMO: {
    label: 'Book a demo',
    href: '/assistant?flow=demo',
    owner: 'Revenue',
    status: 'PUBLISHED',
  },
  WEB_SUPPORT: {
    label: 'Contact support',
    href: '/assistant?flow=support',
    owner: 'Support',
    status: 'PUBLISHED',
  },
  WEB_TRUST: {
    label: 'Trust centre',
    href: '/trust',
    owner: 'Trust',
    status: 'PUBLISHED',
  },
  WEB_INTEGRATIONS: {
    label: 'Integrations',
    href: '/connectors',
    owner: 'Solutions',
    status: 'PUBLISHED',
  },
  WEB_ONBOARDING: {
    label: 'Onboarding',
    href: '/onboarding',
    owner: 'Delivery',
    status: 'PUBLISHED',
  },
  WEB_PRIVACY: {
    label: 'Privacy notice',
    href: '/trust',
    owner: 'Privacy',
    status: 'PUBLISHED',
  },
  INCIDENT_ROUTE: {
    label: 'Contracted incident channel',
    href: '/help',
    owner: 'Support',
    status: 'PUBLISHED',
    note: 'Existing customers must use their contracted incident channel. Public chat cannot start incident response.',
  },
};

export const TOPIC_TILES = [
  {
    id: 'detection',
    title: 'Threat Detection',
    description: 'Stop threats before they impact your business.',
    prompt: 'How does ZoikoShield detect threats?',
    sourceId: 'cap-detection',
  },
  {
    id: 'platform',
    title: 'Platform Overview',
    description: 'Explore key capabilities and benefits.',
    prompt: 'What is ZoikoShield and what does the platform do?',
    sourceId: 'cap-overview',
  },
  {
    id: 'incident',
    title: 'Incident Response',
    description: 'Detect, analyze, and respond faster.',
    prompt: 'How does ZoikoShield support incident response?',
    sourceId: 'cap-investigation',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Works with your existing security stack.',
    prompt: 'Which integrations and connectors are available?',
    sourceId: 'help-connectors',
  },
  {
    id: 'compliance',
    title: 'Compliance',
    description: 'Support for global regulatory frameworks.',
    prompt: 'Which compliance frameworks do you support?',
    sourceId: 'help-trust-guide',
  },
  {
    id: 'demo',
    title: 'Book a Demo',
    description: 'See ZoikoShield in action.',
    prompt: 'I would like to book a demo.',
    sourceId: 'help-ai-disclosure',
    flow: 'demo',
  },
];

export const SUGGESTED_QUESTIONS = [
  'What is ZoikoShield?',
  'What are key use cases?',
  'Which compliance frameworks do you support?',
  'How does ZoikoShield detect threats?',
];

export const FOLLOW_UP_CHIPS: Record<string, string[]> = {
  INFO: [
    'Explore plans and pricing',
    'How does detection work?',
    'Which integrations are available?',
  ],
  WRITE_DEMO: ['What happens after I submit?', 'Which plan fits a small team?'],
  WRITE_SUPPORT: [
    'What should I include in a request?',
    'How do I contact support urgently?',
  ],
  PRIVACY: [
    'What data does this assistant keep?',
    'How do I contact the privacy team?',
  ],
  INCIDENT: [
    'What is the support route?',
    'How does incident investigation work?',
  ],
};

export const ASSISTANT_COPY = {
  displayName: 'ZoikoShield Assistant',
  disclosure: 'AI-assisted • Public information',
  welcomeHeading: 'Hello! I’m the ZoikoShield AI Assistant.',
  welcomeSupport:
    'I can help you learn about ZoikoShield’s cybersecurity platform, use cases, integrations, compliance, and more. Ask me anything or choose a topic below.',
  composerPlaceholder: 'Ask a question about ZoikoShield…',
  safetyNotice: 'Do not share passwords, tokens, or live incident information.',
  footerNotice:
    'The ZoikoShield AI Assistant provides general information about our products and services. It does not have access to your organisation’s data or any customer environments.',
  unavailable:
    'The assistant is temporarily unavailable. You can still explore our site or contact support.',
};
