"""
ZoikoShield Platform Comprehensive PDF Documentation Generator
Produces two publication-quality, exhaustive engineering & operator PDF manuals:
1. ZoikoShield_Frontend_StepByStep_Guide.pdf (Enforced >= 16 Pages)
2. ZoikoShield_Backend_Architecture_Pipeline_Guide.pdf (Enforced >= 14 Pages)

Covers:
- Exact operational justification ("Why we have used this page/component")
- Step-by-step user and operator journeys from Login to Evidence Export
- Complete ZS-EML-TPL-001 v2.0 Email Engine implementation (226 templates, 16 domains, 5 gates)
- All sidebar categories, cockpit widgets, ERB-01 Runbooks, and G2 Experience Contracts
- Post-Quantum KMS signing, Cedar ABAC, Sigstore Rekor, and ADR-01 offline verifier
"""

import os
import sys
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.pdfgen import canvas

# Palette
DARK_NAVY = colors.HexColor("#090d16")
PANEL_BG = colors.HexColor("#0f172a")
SLATE_BORDER = colors.HexColor("#334155")
SLATE_TEXT = colors.HexColor("#1e293b")
LIGHT_BG = colors.HexColor("#f8fafc")
BRAND_BLUE = colors.HexColor("#0284c7")
ACCENT_CYAN = colors.HexColor("#0ea5e9")
PASS_GREEN = colors.HexColor("#059669")
WARN_AMBER = colors.HexColor("#d97706")
FAIL_RED = colors.HexColor("#dc2626")
TEXT_MUTED = colors.HexColor("#64748b")
WHITE = colors.HexColor("#ffffff")
CARD_BG = colors.HexColor("#f1f5f9")


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas that computes total page count dynamically.
    Draws professional running headers and footers on every page.
    """

    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(TEXT_MUTED)

        # Header (Pages 2+)
        if self._pageNumber > 1:
            self.drawString(
                54,
                755,
                "ZOIKOSHIELD SOVEREIGN PLATFORM — COMPREHENSIVE SPECIFICATION",
            )
            self.setFont("Helvetica", 7.5)
            self.drawRightString(
                558,
                755,
                "CONFIDENTIAL • AUDITED v2.4.0 • ISO 27001 / SOC 2 / DORA",
            )
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.75)
            self.line(54, 747, 558, 747)

        # Footer (All pages)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.75)
        self.line(54, 45, 558, 45)

        self.setFont("Helvetica", 7.5)
        self.drawString(
            54,
            33,
            "Zoiko Shield Sovereign Cyber Defense Platform • Authoritative Engineering Baseline • Multi-Tenant Cell eu-west-1",
        )
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.setFont("Helvetica-Bold", 7.5)
        self.drawRightString(558, 33, page_text)
        self.restoreState()


def get_custom_styles():
    styles = getSampleStyleSheet()

    doc_title = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=DARK_NAVY,
        spaceAfter=6,
    )

    doc_subtitle = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=BRAND_BLUE,
        spaceAfter=12,
    )

    h1_style = ParagraphStyle(
        "H1Style",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=DARK_NAVY,
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "H2Style",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13,
        textColor=BRAND_BLUE,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11.5,
        textColor=SLATE_TEXT,
        spaceAfter=5,
    )

    bullet_style = ParagraphStyle(
        "BulletStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.8,
        leading=11,
        textColor=SLATE_TEXT,
        leftIndent=14,
        firstLineIndent=-9,
        spaceAfter=3,
    )

    callout_style = ParagraphStyle(
        "CalloutStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.8,
        leading=11,
        textColor=DARK_NAVY,
    )

    code_style = ParagraphStyle(
        "CodeStyle",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=7.5,
        leading=9.5,
        textColor=DARK_NAVY,
    )

    th_style = ParagraphStyle(
        "THStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=WHITE,
    )

    td_style = ParagraphStyle(
        "TDStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.2,
        leading=9.5,
        textColor=SLATE_TEXT,
    )

    return {
        "title": doc_title,
        "subtitle": doc_subtitle,
        "h1": h1_style,
        "h2": h2_style,
        "body": body_style,
        "bullet": bullet_style,
        "callout": callout_style,
        "code": code_style,
        "th": th_style,
        "td": td_style,
    }


def make_box(
    title,
    text,
    styles,
    bg=LIGHT_BG,
    border=BRAND_BLUE,
    width=504,
    badge="ARCHITECTURE INVARIANT",
):
    content = [
        Paragraph(
            f"<b>{badge.upper()}</b> — <b>{title}</b>",
            styles["callout"].clone("BoxTitle", textColor=border),
        ),
        Spacer(1, 2),
        Paragraph(text, styles["callout"]),
    ]
    t = Table([[content]], colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 1, border),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def build_frontend_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = get_custom_styles()
    story = []

    # ================= PAGE 1: COVER & EXECUTIVE ARCHITECTURE =================
    story.append(
        Paragraph("ZOIKO SHIELD PLATFORM", styles["subtitle"].clone("PreTitle"))
    )
    story.append(
        Paragraph(
            "Frontend Architecture & Complete Operator Journey Manual",
            styles["title"],
        )
    )
    story.append(
        Paragraph(
            "Exhaustive Step-by-Step Operator Flow • Operational Justifications ('Why We Have Used This') • All 38 Cockpit Routes • ZS-EML-TPL-001 v2.0",
            styles["subtitle"],
        )
    )
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=BRAND_BLUE,
            spaceAfter=8,
            spaceBefore=0,
        )
    )

    story.append(
        Paragraph(
            "1. Executive Frontend Architecture & System Justification",
            styles["h1"],
        )
    )
    story.append(
        Paragraph(
            "The Zoiko Shield frontend application is a sovereign, zero-trust cloud security workspace engineered on Next.js 14 App Router, "
            "React 18, TypeScript (strict typechecking), and Tailwind CSS. The interface serves multi-tenant enterprises, financial institutions, "
            "and defense operators who mandate cryptographic verification, non-repudiable audit logs, and strict human-in-the-loop AI governance.",
            styles["body"],
        )
    )

    story.append(
        make_box(
            "Why This Frontend Architecture Was Built",
            "Modern cyber defense platforms frequently suffer from three systemic flaws: (1) ungrounded autonomous AI actions causing outages, "
            "(2) lack of cryptographic proof for audit events, and (3) cross-tenant data leakage in multi-tenant environments. "
            "Zoiko Shield solves this by enforcing Cedar fine-grained ABAC on every client route, mandatory §16.1 Decision Review Envelopes "
            "for AI actions, deterministic SHA-256 rendering of 226 contractual email notifications, and an immutable Merkle Evidence Ledger.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="EXECUTIVE RATIONALE",
        )
    )
    story.append(Spacer(1, 8))

    story.append(
        Paragraph(
            "2. Global Context Bar & Multi-Tenant State Header", styles["h1"]
        )
    )
    story.append(
        Paragraph(
            "Visible at the pinnacle of every screen, the Global Context Bar anchors the operator's operational scope and security boundaries:",
            styles["body"],
        )
    )

    header_cols = [
        Paragraph("Header Badge Element", styles["th"]),
        Paragraph("Live Runtime Value", styles["th"]),
        Paragraph("Operational Justification ('Why We Use This')", styles["th"]),
    ]
    header_rows = [
        [
            Paragraph("Tenant Scope", styles["td"]),
            Paragraph("Acme Financial Services Inc. [ENTERPRISE]", styles["td"]),
            Paragraph(
                "Guarantees that the session is strictly isolated to the authorized customer organization, preventing accidental cross-tenant queries.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Environment Tag", styles["td"]),
            Paragraph("PRODUCTION-US-EAST", styles["td"]),
            Paragraph(
                "Prevents operators from confusing staging/sandbox test runs with live production infrastructure containment actions.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Sovereign Residency Cell", styles["td"]),
            Paragraph("Region: eu-west-1", styles["td"]),
            Paragraph(
                "Ensures strict data residency compliance (GDPR / DORA) by verifying telemetry remains within the declared sovereign jurisdiction.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Evidence Ledger Status", styles["td"]),
            Paragraph("Evidence: Signed Merkle Checkpoints", styles["td"]),
            Paragraph(
                "Continuously attests that the hourly Merkle tree root has been dual-signed with Post-Quantum KMS keys and anchored to Sigstore Rekor.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Microservices Fleet Health", styles["td"]),
            Paragraph("Microservices: 5/5 OK", styles["td"]),
            Paragraph(
                "Monitors real-time heartbeats across shield-core, shield-ingest, shield-ai, shield-action, and shield-anchor.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Principal & Active Role", styles["td"]),
            Paragraph("ANALYST OPS (SECURITY_ANALYST)", styles["td"]),
            Paragraph(
                "Binds user permissions to Cedar ABAC policies; prevents unprivileged execution of destructive containment playbooks.",
                styles["td"],
            ),
        ],
        [
            Paragraph("BFF Experience Contract", styles["td"]),
            Paragraph("HEALTHY_SYNCED | Live (0s drift)", styles["td"]),
            Paragraph(
                "Validates LAB 14 frontend-to-backend contract freshness, guaranteeing zero data staleness in streaming dashboards.",
                styles["td"],
            ),
        ],
    ]
    t_header = Table([header_cols] + header_rows, colWidths=[110, 140, 254])
    t_header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [WHITE, colors.HexColor("#f8fafc")],
                ),
            ]
        )
    )
    story.append(t_header)

    # ================= PAGE 2: STEP 1 - AUTHENTICATION & LOGIN =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 1: Identity & Zero-Trust Authentication (/login)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page",
            "The /login interface is the non-negotiable zero-trust entrypoint for Zoiko Shield. Modern threat actors frequently compromise "
            "static credentials via phishing and credential stuffing. To satisfy SOC 2, ISO 27001, and NIST SP 800-63B standards, "
            "Zoiko Shield implements WebAuthn FIDO2 biometric passkeys alongside traditional credentials, coupled with dynamic Cedar ABAC "
            "claims hydration and strict multi-tenant boundary selection.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="SECURITY JUSTIFICATION",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & User Interface Layout", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Tenant Selector Dropdown:</b> Allows the operator to choose their target organization (e.g. Acme Financial Services Inc., sovereign-defense-cell), "
            "which binds the <code>x-tenant-id</code> header to every subsequent HTTP request.<br/>"
            "• <b>WebAuthn FIDO2 Passkey Button:</b> Prompts the operating system's hardware authenticator (TouchID, Windows Hello, YubiKey) for biometric sign-in.<br/>"
            "• <b>Password & Email Fields:</b> Standard credential inputs backed by rate-limiting (max 5 failed attempts per 15 minutes before temporary lockout).<br/>"
            "• <b>Quick Demo Persona Pills:</b> Pre-configured persona selectors (SOC Analyst, Security Officer, Platform Admin) that permit rapid validation "
            "of role-based view permissions during audits without manual credential typing.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Data Flow", styles["h2"]
        )
    )
    story.append(
        Paragraph(
            "1. <b>Operator Navigation:</b> The analyst navigates to <code>https://shield.zoiko.internal/login</code>.<br/>"
            "2. <b>Tenant Selection:</b> The user selects their sovereign tenant. If omitted, the default primary workspace is bound.<br/>"
            "3. <b>Credential Submission:</b> The user clicks 'Sign In with Passkey' or enters email/password. The browser invokes <code>ZoikoShieldApiClient.login()</code>.<br/>"
            "4. <b>Backend Verification:</b> <code>shield-core</code> verifies credentials, queries Cedar authorization engine for role grants, and issues an ephemeral JWT.<br/>"
            "5. <b>State Hydration:</b> The frontend stores the token in secure memory (never in localStorage to prevent XSS exfiltration) and populates the Global Context Bar.<br/>"
            "6. <b>Error Handling:</b> If authentication fails or the tenant is disabled, the page transitions to <code>UnauthorizedState</code> with detailed Cedar rationale.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "C. Data Contracts & Microservice Endpoints Involved", styles["h2"]
        )
    )
    auth_endpoints = [
        [
            Paragraph("HTTP Method & Endpoint", styles["th"]),
            Paragraph("Payload Contract", styles["th"]),
            Paragraph("Handling Microservice & Security Gate", styles["th"]),
        ],
        [
            Paragraph("POST /api/v1/auth/login", styles["td"]),
            Paragraph("{ email, password, tenantId, fidoAssertion }", styles["td"]),
            Paragraph(
                "shield-core • Gate 1: Cedar Principal Validation & Rate Limiter",
                styles["td"],
            ),
        ],
        [
            Paragraph("POST /api/v1/auth/passkey/challenge", styles["td"]),
            Paragraph("{ email, tenantId }", styles["td"]),
            Paragraph(
                "shield-core • Generates random 32-byte cryptographic challenge",
                styles["td"],
            ),
        ],
    ]
    t_auth = Table(auth_endpoints, colWidths=[150, 180, 174])
    t_auth.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t_auth)

    # ================= PAGE 3: STEP 2 - ONBOARDING =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 2: Tenant Workspace Onboarding (/onboarding)", styles["h1"]
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page",
            "Multi-tenant defense platforms cannot rely on generic user registration. Every tenant represents a legally sovereign entity "
            "with mandatory cryptographic data boundaries, regional residency requirements (e.g. EU GDPR, US FedRAMP), and data classification levels. "
            "The /onboarding page guarantees that new organizations establish strict PostgreSQL Row-Level Security (RLS) schemas, "
            "provision Cloud KMS encryption keyrings, and register root compliance contacts before any security telemetry is ingested.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="REGULATORY JUSTIFICATION",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & Configuration Fields", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Organization Name & Slug:</b> Canonical enterprise identifier (e.g., 'Acme Financial Services', slug: 'acme').<br/>"
            "• <b>Legal Entity Name:</b> Legal registrant used for compliance disclosure contracts and billing invoices.<br/>"
            "• <b>Sovereign Residency Cell:</b> Selectable geographic processing cells (<code>us-east-1</code>, <code>eu-central-1</code>, <code>ap-southeast-1</code>) "
            "which pins all Kafka streams and PostgreSQL storage to that specific cloud region.<br/>"
            "• <b>Data Classification Selector:</b> Sets the baseline sensitivity (<code>PUBLIC</code>, <code>INTERNAL</code>, <code>CONFIDENTIAL</code>, <code>RESTRICTED</code>).<br/>"
            "• <b>Order Reference Identifier:</b> Cryptographically generated unique onboarding order ID (<code>ord-enterprise-XXXX</code>).",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Provisioning Flow",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "1. <b>Navigation:</b> Administrator accesses <code>https://shield.zoiko.internal/onboarding</code>.<br/>"
            "2. <b>Input Completion:</b> Administrator enters company details, chooses <code>RESTRICTED</code> classification, and selects residency region.<br/>"
            "3. <b>Order Issuance:</b> Frontend validates inputs against regex schemas and displays order confirmation banner.<br/>"
            "4. <b>Provisioning Dispatch:</b> User clicks 'Complete Sovereign Provisioning'. Frontend dispatches <code>POST /api/v1/organizations/onboard</code>.<br/>"
            "5. <b>Backend Execution:</b> <code>shield-core</code> creates tenant record, binds PostgreSQL RLS policy, requests tenant signing key from Cloud KMS, "
            "and initializes empty Merkle tree leaf node.<br/>"
            "6. <b>Automatic Redirection:</b> On completion, the frontend switches tenant context to the new organization and redirects the administrator "
            "to the Command Overview Cockpit (<code>/</code>).",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "C. Data Contracts & Microservice Endpoints Involved", styles["h2"]
        )
    )
    onboard_endpoints = [
        [
            Paragraph("HTTP Method & Endpoint", styles["th"]),
            Paragraph("Payload Contract", styles["th"]),
            Paragraph("Handling Microservice & Security Gate", styles["th"]),
        ],
        [
            Paragraph("POST /api/v1/organizations/onboard", styles["td"]),
            Paragraph(
                "{ name, slug, legalEntity, residencyRegion, classification, orderId }",
                styles["td"],
            ),
            Paragraph(
                "shield-core • Gate 3: Tenant Isolation Boundary & Cloud KMS Provisioner",
                styles["td"],
            ),
        ],
    ]
    t_onboard = Table(onboard_endpoints, colWidths=[150, 180, 174])
    t_onboard.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t_onboard)

    # ================= PAGE 4: STEP 3 - COMMAND CENTER =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 3: SecOps Command Center & Operational Cockpit (/)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page",
            "The primary dashboard (/) is the centralized nerve center for the Security Operations Center (SOC). "
            "In high-threat environments, analysts cannot afford to navigate multiple fragmented tools to assess risk posture. "
            "This cockpit provides a unified, real-time single-pane-of-glass displaying posture health, active P0 alerts, "
            "AI safety guardrail status, active ingestion health, and continuous compliance adherence.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="SOC OPERATIONAL JUSTIFICATION",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & Key Operational Widgets", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Master Posture Score (99.98% Healthy):</b> Weighted aggregate score computing vulnerability density, open incident duration, and connector uptime.<br/>"
            "• <b>AI Safety Guardrail Warning Banner:</b> Displays active guardrail state (e.g. 'AI Safety Guardrail Degraded (Deterministic Rule Engine Active)'). "
            "Informs analysts that Vertex AI LLMs are operating in fail-safe fallback mode due to detected drift, routing response proposals through deterministic rule evaluators.<br/>"
            "• <b>KPI Metric Cards:</b><br/>"
            "  - <i>Unresolved Alerts:</i> 4 active alerts (5 total detected) requiring operator triage.<br/>"
            "  - <i>AI Safety & Drift:</i> 1 active drift anomaly linked to AI Copilot and SOAR response proposals.<br/>"
            "  - <i>Active Connectors:</i> 6 connectors reporting 100% ingestion health across AWS, Azure, and CrowdStrike.<br/>"
            "  - <i>Compliance Posture:</i> 100% Pass across SOC 2 Type II, ISO 27001, and DORA controls.<br/>"
            "• <b>Action Buttons:</b><br/>"
            "  - <i>AI Safety Cockpit:</i> Opens the AI Governance drawer to inspect Model Armor screening and killswitch toggles.<br/>"
            "  - <i>Simulate Telemetry:</i> Injects synthetic security event bursts into Kafka for live demonstration and drill exercises.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Real-Time Flow",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "1. <b>Page Load & SSE Handshake:</b> Frontend establishes Server-Sent Events (SSE) connection to <code>GET /api/v1/telemetry/stream</code>.<br/>"
            "2. <b>Live Metric Rendering:</b> KPI cards update dynamically every 1,000ms with zero page reload.<br/>"
            "3. <b>Alert Notification:</b> When an ingestion burst occurs, an animated badge flashes on the 'Unresolved Alerts' card.<br/>"
            "4. <b>Drill-Down Trigger:</b> Clicking 'Unresolved Alerts' redirects the operator directly to the Alerts Cockpit (<code>/alerts</code>) with pre-applied P0 severity filters.",
            styles["body"],
        )
    )

    # ================= PAGE 5: STEP 4 - ERB-01 RUNBOOK =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 4: ERB-01 Demonstration Runbook Workflow (10 Stages)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Runbook",
            "Standard Operating Procedures (SOPs) often fail because they exist as static PDFs rather than live, verifiable software workflows. "
            "The ERB-01 Runbook bar (anchored at the footer of the Command Cockpit) is an interactive demonstration and training engine "
            "that steps operators through all 10 stages of the platform's multi-microservice defense grid, validating live contracts across "
            "shield-core, shield-ingest, shield-ai, shield-action, and shield-anchor.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="RUNBOOK ARCHITECTURE",
        )
    )
    story.append(Spacer(1, 6))

    runbook_stages = [
        [
            Paragraph("Stage #", styles["th"]),
            Paragraph("Stage Title", styles["th"]),
            Paragraph("Microservice", styles["th"]),
            Paragraph("Operational Action & Live Contract Verification", styles["th"]),
        ],
        [
            Paragraph("1", styles["td"]),
            Paragraph("Ingestion Heartbeat", styles["td"]),
            Paragraph("shield-ingest", styles["td"]),
            Paragraph(
                "Validates connector health, buffer latency, and OPS-INV-13 liveness signals.",
                styles["td"],
            ),
        ],
        [
            Paragraph("2", styles["td"]),
            Paragraph("OCSF Normalization", styles["td"]),
            Paragraph("shield-ingest", styles["td"]),
            Paragraph(
                "Validates raw telemetry mapping to OCSF v1.1.0 (normalization files preserved untouched).",
                styles["td"],
            ),
        ],
        [
            Paragraph("3", styles["td"]),
            Paragraph("Asset Inventory Matching", styles["td"]),
            Paragraph("shield-core", styles["td"]),
            Paragraph(
                "Correlates IP and MAC addresses against the sovereign CMDB asset database.",
                styles["td"],
            ),
        ],
        [
            Paragraph("4", styles["td"]),
            Paragraph("Cloud Armor WAF Sync", styles["td"]),
            Paragraph("shield-action", styles["td"]),
            Paragraph(
                "Checks perimeter firewall rule synchronization and blocklist capacities.",
                styles["td"],
            ),
        ],
        [
            Paragraph("5", styles["td"]),
            Paragraph("Threat Intel IOC Match", styles["td"]),
            Paragraph("shield-core", styles["td"]),
            Paragraph(
                "Pivots extracted hashes and IPs against global STIX/TAXII threat intelligence.",
                styles["td"],
            ),
        ],
        [
            Paragraph("6", styles["td"]),
            Paragraph("Detection & Alerting", styles["td"]),
            Paragraph("shield-core", styles["td"]),
            Paragraph(
                "Executes threshold detection rules, generating correlated P1/P0 security alerts.",
                styles["td"],
            ),
        ],
        [
            Paragraph("7", styles["td"]),
            Paragraph("AI Copilot §16.1 Synthesis", styles["td"]),
            Paragraph("shield-ai", styles["td"]),
            Paragraph(
                "Vertex AI synthesizes 10-field Decision Envelope with hallucination risk interval.",
                styles["td"],
            ),
        ],
        [
            Paragraph("8", styles["td"]),
            Paragraph("4-Eyes Cedar Ratification", styles["td"]),
            Paragraph("shield-core", styles["td"]),
            Paragraph(
                "Cedar policy engine mandates dual-custody approval before containment authorization.",
                styles["td"],
            ),
        ],
        [
            Paragraph("9", styles["td"]),
            Paragraph("SOAR Action Execution", styles["td"]),
            Paragraph("shield-action", styles["td"]),
            Paragraph(
                "Executes endpoint quarantine with guaranteed compensating rollback staging.",
                styles["td"],
            ),
        ],
        [
            Paragraph("10", styles["td"]),
            Paragraph("Merkle Root Epoch Sealing", styles["td"]),
            Paragraph("shield-anchor", styles["td"]),
            Paragraph(
                "Computes domain-separated Merkle root, signs with Cloud KMS, anchors to Sigstore Rekor.",
                styles["td"],
            ),
        ],
    ]
    t_runbook = Table(runbook_stages, colWidths=[35, 115, 84, 270])
    t_runbook.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [WHITE, colors.HexColor("#f8fafc")],
                ),
            ]
        )
    )
    story.append(t_runbook)
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "<b>Operator Control:</b> Operators click 'Next Stage >' to advance through the runbook. "
            "A green pill ('All Steps Verified') illuminates once Stage 10 anchors the cryptographic receipt.",
            styles["body"],
        )
    )

    # ================= PAGE 6: STEP 5 - INGESTION & CONNECTORS =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 5: Ingestion Fleet & Connectors Wizard (/ingestion, /connectors)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "A SIEM/SOAR platform is only as trustworthy as its telemetry ingress. Ingestion failures or unhandled schema drifts lead to blind spots. "
            "The /connectors and /ingestion workspaces allow security engineers to provision cloud log connectors (AWS, Azure, Okta, CrowdStrike), "
            "monitor Events Per Second (EPS), track Dead-Letter Queues (DLQ), and inspect quarantined schema-mismatched records.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="INGESTION INTEGRITY",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & Ingestion Monitoring", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Connector Grid:</b> Cards for AWS CloudTrail, CrowdStrike Falcon, Okta SystemLog, Microsoft Sentinel, and Azure Monitor.<br/>"
            "• <b>OPS-INV-13 Heartbeat Monitor:</b> Live status indicator tracking connector polling cycles. If a connector drops below 1 poll/minute, "
            "an automated P1 operational alert is raised.<br/>"
            "• <b>Throughput Velocity Charts:</b> Real-time EPS ingestion graphs visualizing 100,000 EPS peak capacity.<br/>"
            "• <b>Dead-Letter Queue (DLQ) Inspector:</b> Table displaying malformed events with payload diffs, error messages, and an 'Auto-Retry' button.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Provisioning", styles["h2"]
        )
    )
    story.append(
        Paragraph(
            "1. <b>Add Connector:</b> Engineer clicks '+ Add Connector' on <code>/connectors</code>.<br/>"
            "2. <b>Select Source:</b> Chooses 'AWS CloudTrail' and specifies IAM Role ARN and SQS Queue URL.<br/>"
            "3. <b>Validate Credentials:</b> Clicks 'Test Connection'. <code>shield-ingest</code> assumes the role and polls a test batch.<br/>"
            "4. <b>Activate Ingestion:</b> On success, connector status shifts to 'HEALTHY_SYNCED' and telemetry streams to Kafka topic <code>telemetry.raw.aws</code>.<br/>"
            "5. <b>Schema Normalization:</b> Telemetry is normalized by <code>apps/shield-ingest/src/normalization/</code> into standard OCSF v1.1.0.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "C. Data Contracts & Microservice Endpoints Involved", styles["h2"]
        )
    )
    conn_endpoints = [
        [
            Paragraph("HTTP Method & Endpoint", styles["th"]),
            Paragraph("Payload Contract", styles["th"]),
            Paragraph("Handling Microservice & Security Gate", styles["th"]),
        ],
        [
            Paragraph("GET /api/v1/connectors", styles["td"]),
            Paragraph("Headers: x-tenant-id", styles["td"]),
            Paragraph(
                "shield-ingest • Returns active connector inventory and heartbeat status",
                styles["td"],
            ),
        ],
        [
            Paragraph("POST /api/v1/connectors/test", styles["td"]),
            Paragraph("{ connectorType, credentials, endpoint }", styles["td"]),
            Paragraph(
                "shield-ingest • Validates connectivity without persisting credentials to disk",
                styles["td"],
            ),
        ],
    ]
    t_conn = Table(conn_endpoints, colWidths=[150, 180, 174])
    t_conn.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t_conn)

    # ================= PAGE 7: STEP 6 - ALERTS & DETECTIONS =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 6: Detection Stream & Alerts Cockpit (/detections, /alerts, /alerts/[alertId])",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Security analysts face alert fatigue. Displaying hundreds of raw alerts without context causes missed intrusions. "
            "The /alerts and /detections interfaces ingest OCSF-normalized security events, group them using MITRE ATT&CK techniques, "
            "evaluate Sigma and YARA-L detection rules, and provide deep drawer inspection with one-click escalation to Incident Casework.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="ALERT TRIAGE EFFICIENCY",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & Visual Triage Feed", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Severity Badges:</b> Distinct visual indicators (<code>P0 CRITICAL</code> in crimson, <code>P1 HIGH</code> in amber, <code>MEDIUM</code> in blue, <code>LOW</code> in slate).<br/>"
            "• <b>MITRE ATT&CK Attribution:</b> Displays tactic and technique IDs (e.g. <code>T1078 Valid Accounts</code>, <code>T1059 Command and Scripting Interpreter</code>).<br/>"
            "• <b>Affected Cloud Asset:</b> Shows hostnames, AWS EC2 Instance IDs, or Kubernetes pods linked to the sovereign CMDB.<br/>"
            "• <b>Alert Inspection Drawer:</b> Sliding right-hand drawer revealing:<br/>"
            "  - Raw OCSF v1.1.0 JSON payload.<br/>"
            "  - Detection Rule Logic (Sigma YAML / YARA-L expression).<br/>"
            "  - Correlated Indicators of Compromise (IOCs).<br/>"
            "  - Action Buttons: 'Escalate to Incident Case', 'Consult AI Copilot', 'Suppress with Exception'.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Casework Escalation",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "1. <b>Feed Monitoring:</b> Analyst reviews the alerts table, sorting by P0 Critical.<br/>"
            "2. <b>Drawer Opening:</b> Analyst clicks on alert <code>alt-ec2-credential-exfil-992</code>.<br/>"
            "3. <b>Payload Inspection:</b> Verifies the source IP against known adversary threat actor infrastructure.<br/>"
            "4. <b>Case Escalation:</b> Clicks 'Escalate to Incident Case'. The system creates Case <code>case-2026-10-0042</code> and opens the Case Workspace.<br/>"
            "5. <b>Audit Trail:</b> An alert transition event (<code>ZS-EML-SEC-010 Case created from alert/hunt</code>) is recorded in the Merkle Ledger.",
            styles["body"],
        )
    )

    # ================= PAGE 8: STEP 7 - AI COPILOT & GOVERNANCE =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 7: AI Security Copilot & AI Governance (/copilot, /ai-governance)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Generative AI provides unprecedented speed in correlating threat signals, but unconstrained LLMs introduce catastrophic risks: "
            "hallucinated facts, prompt injection attacks, and ungrounded advice. "
            "The /copilot and /ai-governance screens implement Google Vertex AI (Gemini 1.5 Pro) with strict Model Armor screening, "
            "calibrated confidence intervals, and emergency killswitches that instantly degrade the model to deterministic rule engines.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="AI SAFETY INVARIANT",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. AI Copilot 6 Operating Modes", styles["h2"])
    )
    copilot_modes = [
        [
            Paragraph("Mode", styles["th"]),
            Paragraph("Operational Focus", styles["th"]),
            Paragraph("Model Armor & Safety Guardrails", styles["th"]),
        ],
        [
            Paragraph("1. Triage", styles["td"]),
            Paragraph(
                "Rapid classification of high-volume alert queues.", styles["td"]
            ),
            Paragraph(
                "Input token sanitization; scrubs PII and passwords.",
                styles["td"],
            ),
        ],
        [
            Paragraph("2. Investigation", styles["td"]),
            Paragraph(
                "Graph-based correlation across multi-cloud logs.", styles["td"]
            ),
            Paragraph(
                "Strict grounding against ingested OCSF telemetry only.",
                styles["td"],
            ),
        ],
        [
            Paragraph("3. Lateral Movement", styles["td"]),
            Paragraph(
                "Reconstructs adversary pivot paths across IAM & VPCs.",
                styles["td"],
            ),
            Paragraph(
                "Validates path reachability against network ACLs.", styles["td"]
            ),
        ],
        [
            Paragraph("4. Code Analysis", styles["td"]),
            Paragraph(
                "Reverse-engineers suspect PowerShell & bash scripts.",
                styles["td"],
            ),
            Paragraph(
                "Executes in sandboxed isolated worker container.", styles["td"]
            ),
        ],
        [
            Paragraph("5. IOC Extraction", styles["td"]),
            Paragraph(
                "Extracts IPs, domains, and SHA-256 hashes from unstructured text.",
                styles["td"],
            ),
            Paragraph(
                "Regex verification before database attachment.", styles["td"]
            ),
        ],
        [
            Paragraph("6. Attribution", styles["td"]),
            Paragraph(
                "Correlates adversary TTPs against MITRE ATT&CK groups.",
                styles["td"],
            ),
            Paragraph(
                "Flags low-confidence attribution (<85%) with explicit disclaimer.",
                styles["td"],
            ),
        ],
    ]
    t_modes = Table(copilot_modes, colWidths=[90, 200, 214])
    t_modes.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t_modes)
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("B. AI Governance Cockpit & Safety Killswitch", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>AI Drift Monitor:</b> Tracks model divergence from deterministic rule baselines.<br/>"
            "• <b>Emergency AI Killswitch:</b> Toggling 'AI_GOVERNANCE_KILL_SWITCH_ACTIVE' immediately revokes LLM API keys and "
            "forces the entire platform into safe degradation mode (Deterministic Rule Engine).",
            styles["body"],
        )
    )

    # ================= PAGE 9: STEP 8 - RESPONSE PROPOSALS (§16.1) =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 8: Response Proposals (W34) & Mandatory §16.1 Envelopes (/response-proposals)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page (Spec §16.1 Compliance)",
            "CRITICAL ARCHITECTURAL RULE: An AI model must NEVER be permitted to execute autonomous containment actions "
            "without explicit human operator ratification. Doing so risks catastrophic service outages and uncontainable blast radiuses. "
            "Under Platform Spec §16.1 & Figure 11, any remediation recommended by Vertex AI must be packaged inside a mandatory "
            "10-Field Decision Review Envelope and ratified by a human operator using cryptographic signatures.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="MANDATORY GOVERNANCE GATE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph(
            "A. The 10-Field Decision Review Envelope Specification",
            styles["h2"],
        )
    )
    envelope_fields = [
        [
            Paragraph("Field #", styles["th"]),
            Paragraph("Envelope Field Name", styles["th"]),
            Paragraph("Type / Format", styles["th"]),
            Paragraph("Engineering Purpose & Regulatory Invariant", styles["th"]),
        ],
        [
            Paragraph("1", styles["td"]),
            Paragraph("proposal_id", styles["td"]),
            Paragraph("UUIDv4", styles["td"]),
            Paragraph(
                "Unique idempotent identifier for tracking the proposal across microservices.",
                styles["td"],
            ),
        ],
        [
            Paragraph("2", styles["td"]),
            Paragraph("model_version", styles["td"]),
            Paragraph("String (vertex-gemini-1.5)", styles["td"]),
            Paragraph(
                "Exact model and prompt template hash used to generate the recommendation.",
                styles["td"],
            ),
        ],
        [
            Paragraph("3", styles["td"]),
            Paragraph("hallucination_probability", styles["td"]),
            Paragraph("Float (0.00 - 1.00)", styles["td"]),
            Paragraph(
                "Calibrated confidence metric; proposals > 0.15 require Tier-2 senior operator sign-off.",
                styles["td"],
            ),
        ],
        [
            Paragraph("4", styles["td"]),
            Paragraph("action_type", styles["td"]),
            Paragraph("Enum (ALLOWLISTED)", styles["td"]),
            Paragraph(
                "Must be an approved action: ISOLATE_HOST, BLOCK_IP, REVOKE_SESSION.",
                styles["td"],
            ),
        ],
        [
            Paragraph("5", styles["td"]),
            Paragraph("target_infrastructure", styles["td"]),
            Paragraph("Array of Resource URIs", styles["td"]),
            Paragraph(
                "Exact CMDB assets affected (e.g. arn:aws:ec2:us-east-1:123456:instance/i-0abc).",
                styles["td"],
            ),
        ],
        [
            Paragraph("6", styles["td"]),
            Paragraph("blast_radius_estimate", styles["td"]),
            Paragraph("Enum (LOW/MED/HIGH/CRIT)", styles["td"]),
            Paragraph(
                "Estimated operational impact on active customer business traffic.",
                styles["td"],
            ),
        ],
        [
            Paragraph("7", styles["td"]),
            Paragraph("technical_justification", styles["td"]),
            Paragraph("String (Markdown)", styles["td"]),
            Paragraph(
                "Synthesized reasoning explaining why this action halts the adversary.",
                styles["td"],
            ),
        ],
        [
            Paragraph("8", styles["td"]),
            Paragraph("compensating_rollback_plan", styles["td"]),
            Paragraph("Executable JSON Spec", styles["td"]),
            Paragraph(
                "Exact reverse action guaranteed to restore the asset if containment was erroneous.",
                styles["td"],
            ),
        ],
        [
            Paragraph("9", styles["td"]),
            Paragraph("expiry_window", styles["td"]),
            Paragraph("ISO 8601 Timestamp", styles["td"]),
            Paragraph(
                "Proposal auto-expires within 30 minutes if unratified to prevent stale action execution.",
                styles["td"],
            ),
        ],
        [
            Paragraph("10", styles["td"]),
            Paragraph("operator_ratification_signature", styles["td"]),
            Paragraph("ECDSA / Ed25519 Sig", styles["td"]),
            Paragraph(
                "Cryptographic signature of the human operator approving the action.",
                styles["td"],
            ),
        ],
    ]
    t_env = Table(envelope_fields, colWidths=[35, 120, 89, 260])
    t_env.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [WHITE, colors.HexColor("#f8fafc")],
                ),
            ]
        )
    )
    story.append(t_env)
    story.append(Spacer(1, 4))

    story.append(
        Paragraph("B. Human Operator Ratification Workflow", styles["h2"])
    )
    story.append(
        Paragraph(
            "1. Analyst opens <code>/response-proposals</code> and selects pending proposal.<br/>"
            "2. Modal prompts for mandatory operator written rationale (minimum 20 characters).<br/>"
            "3. Operator clicks 'Ratify & Dispatch'. Frontend submits cryptographic signature to <code>shield-action</code>.",
            styles["body"],
        )
    )

    # ================= PAGE 10: STEP 9 - SOAR ACTIONS & FREEZE =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 9: SOAR Containment Actions & Emergency Freeze (/actions, /playbooks)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "When active breaches unfold, seconds determine whether ransomware spreads across the enterprise. "
            "Manual remediation through multiple cloud consoles is too slow and error-prone. "
            "The /actions and /playbooks workspaces provide deterministic, automated containment execution (SOAR) "
            "with two critical fail-safes: (1) guaranteed atomic compensating rollbacks and (2) an Emergency Action Freeze killswitch.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="SOAR RELIABILITY INVARIANT",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Containment Actions Registry & Actuator Fleet", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Host Quarantine:</b> Calls cloud provider APIs (AWS Security Group revoke, Azure NSG deny, CrowdStrike Network Contain) "
            "to isolate the infected endpoint from all network traffic except the Zoiko Shield agent.<br/>"
            "• <b>IP Perimeter Block:</b> Pushes dynamic IP deny rules to Google Cloud Armor and AWS WAF.<br/>"
            "• <b>Credential Revocation:</b> Revokes compromised Okta and Azure AD user sessions, forcing immediate sign-out.<br/>"
            "• <b>IAM Policy Detachment:</b> Strips administrative permissions from compromised service accounts.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Emergency Action Freeze Killswitch (Levels R0 - R4)",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "In the event of adversary deception, rule misconfiguration, or cloud provider API flapping, "
            "operators can engage the global <b>Emergency Action Freeze</b> toggle. "
            "Engaging the freeze immediately locks the SOAR execution broker (<code>shield-action</code>), "
            "rejecting all inbound execution requests and notifying leadership via email template <code>ZS-EML-ACT-010 Tenant action freeze activated</code>.",
            styles["body"],
        )
    )

    story.append(
        Paragraph("C. Compensating Rollback Guarantee", styles["h2"])
    )
    story.append(
        Paragraph(
            "Every containment action is paired with an idempotent rollback script. "
            "If an operator isolates an essential production database server by mistake, clicking 'Rollback Action' "
            "executes the compensating script, restoring original firewall rules in under 3.5 seconds.",
            styles["body"],
        )
    )

    # ================= PAGE 11: STEP 10 - THREAT HUNTING & CASES =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 10: Threat Hunting Workbench & Case Management (/hunting, /cases, /cases/[caseId])",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Advanced Persistent Threats (APTs) often evade standard signature-based detection rules. "
            "The /hunting and /cases cockpits provide forensic analysts with a hypothesis-driven ReAct query workbench "
            "and formal incident case management. Every evidence item, forensic timeline entry, and analyst note "
            "is cryptographically linked to prevent tampering or spoliation of legal evidence.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="INVESTIGATION GOVERNANCE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Threat Hunting Workbench Features", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>ReAct Query Builder:</b> Combines natural language questions with structured SQL/Sigma pivots.<br/>"
            "• <b>Graph Link Explorer:</b> Visualizes entity relationships between compromised user accounts, infected VMs, "
            "and external command-and-control (C2) IP addresses.<br/>"
            "• <b>IOC Sweeper:</b> One-click sweep that scans 90 days of cold storage telemetry for newly discovered adversary hashes.",
            styles["body"],
        )
    )

    story.append(
        Paragraph("B. Incident Case Workspace (/cases/[caseId])", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Authoritative Incident Timeline:</b> Reconstructs every adversary action in chronological order.<br/>"
            "• <b>Evidence Locker:</b> Attaches raw PCAP files, memory dumps, and disk image hashes. "
            "Raw evidence is hashed using SHA-256 and anchored to the Merkle Ledger.<br/>"
            "• <b>SLA & Milestone Tracker:</b> Monitors Mean Time to Acknowledge (MTTA) and Mean Time to Contain (MTTC). "
            "Approaching SLA breaches trigger template <code>ZS-EML-SEC-013 Case SLA approaching breach</code>.",
            styles["body"],
        )
    )

    # ================= PAGE 12: STEP 11 - POLICY LIFECYCLE =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 11: Policy Governance & 4-Eyes Lifecycle (/policies, /controls, /compliance)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Security policies govern access to sensitive data and control automated response thresholds. "
            "A single malicious or accidental policy modification could disable defenses or grant unauthorized privileges. "
            "The /policies cockpit implements strict Cedar policy authoring with mandatory 4-Eyes dual-custody review, "
            "canary deployment staging, and automated rollback if anomaly rates exceed thresholds.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="4-EYES GOVERNANCE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph(
            "A. Dual-Custody 4-Eyes Workflow (Step-by-Step)", styles["h2"]
        )
    )
    story.append(
        Paragraph(
            "1. <b>Policy Authoring:</b> Policy Admin drafts a new Cedar authorization rule (e.g. restricting SOAR containment to SOC tier 2).<br/>"
            "2. <b>Diff Review:</b> Frontend displays visual diff between active policy version (v3) and proposed version (v4).<br/>"
            "3. <b>Dual-Approval Gate:</b> The author cannot self-approve. The policy transitions to 'PENDING_SECOND_APPROVAL'.<br/>"
            "4. <b>Second Approver Sign-off:</b> A second administrator receives email <code>ZS-EML-ACT-003 Dual-custody / second approval requested</code>, "
            "reviews the diff, and provides FIDO2 biometric confirmation.<br/>"
            "5. <b>Canary Staging:</b> The policy is deployed to 10% of ingestion nodes for 1 hour.<br/>"
            "6. <b>Full Rollout or Rollback:</b> If zero anomalies are reported, the policy promotes to 100% production. "
            "If false positives spike > 1%, the engine triggers an immediate atomic rollback to v3.",
            styles["body"],
        )
    )

    story.append(
        Paragraph("B. Continuous Controls & Compliance Mapping", styles["h2"])
    )
    story.append(
        Paragraph(
            "The /controls and /compliance pages continuously evaluate live infrastructure against SOC 2 Type II, ISO 27001, DORA, and HIPAA controls. "
            "Failing controls immediately trigger template <code>ZS-EML-ASSURE-001 Control status changed to failing/non-compliant state</code>.",
            styles["body"],
        )
    )

    # ================= PAGE 13: STEP 12 - MERKLE LEDGER =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 12: Merkle Evidence Ledger & Transparency Log (/ledger, /evidence-operations)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "In high-stakes regulatory audits and legal disputes, internal database logs are dismissed as self-serving because database administrators "
            "can alter records retroactively. To guarantee mathematical tamper-evidence, Zoiko Shield anchors all state transitions, "
            "alert decisions, and policy approvals into a domain-separated cryptographic Merkle Tree (ZS-MERKLE-V1) "
            "and publishes epoch witness roots to public Sigstore Rekor transparency logs.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="CRYPTOGRAPHIC INTEGRITY",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Merkle Tree Architecture & Epoch Sealing", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Leaf Node Construction:</b> Each audit event is serialized into canonical JSON and hashed: "
            "<code>Leaf_Hash = SHA-256('ZS-LEAF-V1' || Event_Data)</code>.<br/>"
            "• <b>Hourly Epoch Sealing:</b> Every 3,600 seconds, <code>shield-anchor</code> seals the epoch, computes the Merkle Root, "
            "and signs it using Google Cloud KMS HSM keys with Post-Quantum Dilithium3 + Ed25519 dual-signatures.<br/>"
            "• <b>Sigstore Rekor Publication:</b> The signed root is published to the public Rekor transparency log, creating an immutable timestamped receipt.",
            styles["body"],
        )
    )

    story.append(
        Paragraph("B. Merkle Ledger UI Explorer (/ledger)", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Epoch Visualizer:</b> Interactive tree graph displaying epoch roots, tree depths, and leaf counts.<br/>"
            "• <b>Inclusion Proof Validator:</b> Operators enter any event ID (e.g. <code>evt-alert-contain-1002</code>) and click 'Verify Proof'. "
            "The UI reconstructs the audit path in real-time, verifying that the mathematical hash matches the public Rekor witness root.<br/>"
            "• <b>Offline Proof Package Download:</b> Exports a self-contained <code>.proof.json</code> bundle allowing independent offline verification.",
            styles["body"],
        )
    )

    # ================= PAGE 14: STEP 13 - EMAIL STUDIO (226 TEMPLATES) =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 13: Production Email Template Studio (/admin/email-templates)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page (Contract ZS-EML-TPL-001 v2.0)",
            "Email notifications in cybersecurity platforms are high-risk attack surfaces: phishing lures, credential leaks, and notification noise "
            "can devastate operations. The /admin/email-templates studio implements the authoritative engineering baseline "
            "for all 226 contractual production email templates across 16 domains, enforcing 5 strict engineering release gates, "
            "deterministic SHA-256 render hashing, fail-closed secret scrubbing, and multi-tenant URL allowlisting.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="NOTIFICATION SECURITY",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Studio Capabilities & Inspection Features", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>226 Template Catalog:</b> Filterable by 16 operational domains (SEC, IAM, ORG, CONN, POL, ACT, INC, REP, BIL, SUB, AUD, DIS, DRI, OFF, OPS, GOV).<br/>"
            "• <b>Live Multipart Render:</b> Renders simultaneous HTML and plain-text output with Dark/Light theme toggles and Mobile/Desktop viewport emulation.<br/>"
            "• <b>Deterministic SHA-256 Render Hashing:</b> Displays live SHA-256 digest of the rendered HTML payload, providing a non-repudiable audit fingerprint.<br/>"
            "• <b>Test Secret Gate:</b> Button that simulates accidental secret injection (e.g. API keys, passwords); confirms the engine fails-closed and sanitizes the output.<br/>"
            "• <b>Live Verification Test Dispatch:</b> Sends a live test email directly to designated administrator mailboxes.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. The 5 Engineering Release Gates (ZS-EML-TPL-001)", styles["h2"]
        )
    )
    gate_table = [
        [
            Paragraph("Gate #", styles["th"]),
            Paragraph("Release Gate Standard", styles["th"]),
            Paragraph("Enforcement Logic in Codebase", styles["th"]),
        ],
        [
            Paragraph("Gate 1", styles["td"]),
            Paragraph("Completeness (226/226)", styles["td"]),
            Paragraph(
                "All 226 template contracts implemented; zero unmapped event IDs.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Gate 2", styles["td"]),
            Paragraph("Allowlisted Enums", styles["td"]),
            Paragraph(
                "template-enums.registry.ts maps raw state strings to customer-safe labels.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Gate 3", styles["td"]),
            Paragraph("Tenant Isolation", styles["td"]),
            Paragraph(
                "tenant-isolation-validator.service.ts rejects cross-tenant URLs and non-HTTPS links.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Gate 6", styles["td"]),
            Paragraph("Fail-Closed Secret Sanitization", styles["td"]),
            Paragraph(
                "Automated regex inspection strips passwords, API keys, and bearer tokens.",
                styles["td"],
            ),
        ],
        [
            Paragraph("Gate 9", styles["td"]),
            Paragraph("Sender Class Reputation Router", styles["td"]),
            Paragraph(
                "sender-class-router.service.ts routes traffic across 8 isolated reputation mailboxes.",
                styles["td"],
            ),
        ],
    ]
    t_gates = Table(gate_table, colWidths=[45, 175, 284])
    t_gates.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t_gates)

    # ================= PAGE 15: STEP 14 - NOTIFICATION CENTER =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 14: Notification Center (W04) & Delivery Tracking (/notifications)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used This Page",
            "In high-severity security operations, sending an email is not enough; the security platform must guarantee delivery receipt "
            "and human operator acknowledgement. The /notifications center implements Experience Contract W04, displaying an outbox "
            "of all tenant delivery attempts, dead-letter statuses, and operator acknowledgement buttons that record compliance evidence.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="DELIVERY ASSURANCE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Screen Components & Outbox Table", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Delivery Outbox Table:</b> Displays timestamp, recipient email, subject line, sender class (e.g. <code>security_sender</code>), "
            "delivery status (<code>DELIVERED</code>, <code>DEAD_LETTERED</code>, <code>PENDING</code>, <code>BOUNCED</code>), and acknowledgement status.<br/>"
            "• <b>Filter by Status & Sender Class:</b> Enables rapid triage of failed dispatches.<br/>"
            "• <b>Operator Acknowledgement Actions:</b> Clicking 'Acknowledge' records a cryptographic timestamp proving the operator reviewed the notice.<br/>"
            "• <b>Delivery Diagnostics Drawer:</b> Inspects SMTP response codes (e.g. <code>250 OK Message accepted for delivery</code>) and render hashes.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. Step-by-Step Operator Interaction & Inbound Webhooks",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "1. Security event occurs (e.g. P0 Alert).<br/>"
            "2. <code>shield-core</code> renders email, writes record to <code>NotificationDelivery</code> table with status <code>PENDING</code>.<br/>"
            "3. Dispatcher transmits message via SMTP relay. Status updates to <code>DELIVERED</code>.<br/>"
            "4. Webhook listener (<code>POST /api/v1/webhooks/notification-delivery</code>) ingests SMTP delivery confirmation.<br/>"
            "5. Operator opens <code>/notifications</code>, views the alert delivery, and clicks 'Acknowledge'.<br/>"
            "6. Backend records acknowledgement in audit log, fulfilling DORA and SOC 2 notification compliance.",
            styles["body"],
        )
    )

    # ================= PAGE 16: STEP 15 - JIT ELEVATION & G1 GATES =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 15: JIT Elevation Quorum (§13) & G1 Launch Gate Protocol (/admin/jit, /admin/g1-gate)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Standing administrative privileges are the primary target for lateral movement. Under Zero-Trust Architecture, "
            "no user should hold permanent administrative rights. The /admin/jit interface implements Just-In-Time (JIT) privileged escalation "
            "with FIDO2 biometric step-up and multi-party quorum, while /admin/g1-gate enforces pre-flight production release readiness.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="PRIVILEGE GOVERNANCE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. JIT Privileged Elevation Quorum (§13)", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Time-Bounded Grants:</b> Elevations automatically expire after a configurable duration (default: 60 minutes).<br/>"
            "• <b>Biometric Step-Up:</b> Requesting elevation triggers a hardware FIDO2 passkey challenge to prevent session hijacking.<br/>"
            "• <b>Multi-Party Approval:</b> Requires two distinct security officers to ratify break-glass requests.<br/>"
            "• <b>Automatic Revocation:</b> Upon expiration, Cedar ABAC claims immediately drop back to standard analyst privileges.",
            styles["body"],
        )
    )

    story.append(
        Paragraph(
            "B. G1 Launch Gate Protocol & GTM Pre-Flight Checklist",
            styles["h2"],
        )
    )
    story.append(
        Paragraph(
            "The /admin/g1-gate and /admin/gtm-checklist dashboards track production readiness across 12 mandatory criteria: "
            "TypeScript typecheck, Swagger OpenAPI coverage, Controller Access tests, Capability Claims validation, "
            "Zero ungrounded terminology, Vitest suites (80/80 passed), and offline Merkle verifier attestation. "
            "All gates must show 'PASS' before production releases are authorized.",
            styles["body"],
        )
    )

    # ================= PAGE 17: STEP 16 - PLATFORM HEALTH & AUDITOR =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "STEP 16: Platform Service Health & Independent Auditor Portal (/admin/platform-health, /auditor)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used These Pages",
            "Continuous service availability and transparent third-party auditability are paramount for sovereign cyber defense platforms. "
            "The /admin/platform-health cockpit monitors distributed microservices health, latency budgets, and failover drills (§31/§32), "
            "while the /auditor portal provides external compliance officers with a read-only, cryptographically verified evidence environment.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="COMPLIANCE & RESILIENCE",
        )
    )
    story.append(Spacer(1, 6))

    story.append(
        Paragraph("A. Platform Service Health Cockpit (§31/§32)", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Microservices Telemetry:</b> Real-time health gauges for <code>shield-core</code>, <code>shield-ingest</code>, <code>shield-ai</code>, "
            "<code>shield-action</code>, and <code>shield-anchor</code>.<br/>"
            "• <b>Disaster Recovery (DR) Drills:</b> Triggers simulated regional cell failover exercises (RTO < 30s, RPO = 0s).<br/>"
            "• <b>Capacity Gauges:</b> Evaluates Kafka partition lag, PostgreSQL connection pool saturation, and Redis cache hit ratios.",
            styles["body"],
        )
    )

    story.append(
        Paragraph("B. Independent Auditor Portal (/auditor)", styles["h2"])
    )
    story.append(
        Paragraph(
            "• <b>Read-Only Evidence Dossier:</b> External auditors review continuous control mappings (SOC 2, ISO 27001, DORA) without administrative access.<br/>"
            "• <b>Offline Cryptographic Verifier:</b> Auditors can download the standalone <code>verifier-cli</code> binary and verify the complete audit trail "
            "on an air-gapped laptop with zero network dependencies.",
            styles["body"],
        )
    )

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated Comprehensive Frontend PDF: {filename}")


def build_backend_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = get_custom_styles()
    story = []

    # ================= PAGE 1: TITLE & MONOREPO TOPOLOGY =================
    story.append(
        Paragraph("ZOIKO SHIELD PLATFORM", styles["subtitle"].clone("PreTitle"))
    )
    story.append(
        Paragraph(
            "Backend Microservices Architecture & Pipeline Specification",
            styles["title"],
        )
    )
    story.append(
        Paragraph(
            "6 Microservices Topology • Preserved Ingestion Normalization • 8-Stage Event Pipeline • 226 Email Templates • Post-Quantum Cryptography",
            styles["subtitle"],
        )
    )
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=BRAND_BLUE,
            spaceAfter=8,
            spaceBefore=0,
        )
    )

    story.append(
        Paragraph(
            "1. Monorepo Microservices Architecture (6 Applications)",
            styles["h1"],
        )
    )
    story.append(
        Paragraph(
            "The Zoiko Shield backend is a distributed, high-concurrency microservices architecture built with NestJS, Fastify, TypeScript, "
            "Kafka, and PostgreSQL. It enforces clean domain boundaries across 6 dedicated applications, ensuring isolation between "
            "ingestion, detection, AI reasoning, response execution, and cryptographic ledger attestation.",
            styles["body"],
        )
    )

    services_table = [
        [
            Paragraph("Application", styles["th"]),
            Paragraph("Domain Responsibility", styles["th"]),
            Paragraph("Key Codebase Path", styles["th"]),
            Paragraph("Critical Security Invariant", styles["th"]),
        ],
        [
            Paragraph("shield-core", styles["td"]),
            Paragraph(
                "Identity, Cedar RBAC/ABAC, Multi-Tenancy, 226 Email Engine, Notifications, Rules.",
                styles["td"],
            ),
            Paragraph("backend/apps/shield-core", styles["td"]),
            Paragraph(
                "Gate 3 Tenant Isolation; Fail-closed secret scanner.",
                styles["td"],
            ),
        ],
        [
            Paragraph("shield-ingest", styles["td"]),
            Paragraph(
                "Connector fleet, high-throughput sharding, OCSF normalization, DLQ retry.",
                styles["td"],
            ),
            Paragraph("backend/apps/shield-ingest", styles["td"]),
            Paragraph(
                "apps/shield-ingest/src/normalization/ PRESERVED UNTOUCHED.",
                styles["td"],
            ),
        ],
        [
            Paragraph("shield-ai", styles["td"]),
            Paragraph(
                "Vertex AI SecOps Copilot, Hallucination bounds, §16.1 Decision Envelopes.",
                styles["td"],
            ),
            Paragraph("backend/apps/shield-ai", styles["td"]),
            Paragraph(
                "Model Armor screening; Mandatory human ratification.",
                styles["td"],
            ),
        ],
        [
            Paragraph("shield-action", styles["td"]),
            Paragraph(
                "SOAR response actuator, Cloud Armor sync, emergency freeze, rollback broker.",
                styles["td"],
            ),
            Paragraph("backend/apps/shield-action", styles["td"]),
            Paragraph(
                "Guaranteed idempotent compensating rollback.", styles["td"]
            ),
        ],
        [
            Paragraph("shield-anchor", styles["td"]),
            Paragraph(
                "Post-quantum Merkle trees (Dilithium3 + Ed25519), Sigstore Rekor witness.",
                styles["td"],
            ),
            Paragraph("backend/apps/shield-anchor", styles["td"]),
            Paragraph(
                "Domain-separated ZS-MERKLE-V1; Cloud KMS HSM signing.",
                styles["td"],
            ),
        ],
        [
            Paragraph("verifier-cli", styles["td"]),
            Paragraph(
                "Zero-network standalone offline cryptographic evidence verifier (ADR-01).",
                styles["td"],
            ),
            Paragraph("backend/apps/verifier-cli", styles["td"]),
            Paragraph(
                "Fails-closed (Exit Code 1) on single-bit tampering.",
                styles["td"],
            ),
        ],
    ]
    t_serv = Table(services_table, colWidths=[70, 160, 134, 140])
    t_serv.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [WHITE, colors.HexColor("#f8fafc")],
                ),
            ]
        )
    )
    story.append(t_serv)
    story.append(Spacer(1, 6))

    story.append(
        make_box(
            "Strict Ingestion Normalization Preservation Mandate",
            "CRITICAL ARCHITECTURAL BASELINE: All normalization mapping code located in apps/shield-ingest/src/normalization/ "
            "represents audited, standardized OCSF v1.1.0 ground truth. It must NEVER be mutated, refactored, or overridden. "
            "Every downstream consumer (rules, AI Copilot, SOAR) relies on this immutable contract.",
            styles,
            bg=LIGHT_BG,
            border=FAIL_RED,
            badge="STRICT SYSTEM INVARIANT",
        )
    )

    # ================= PAGE 2: EVENT LIFECYCLE PIPELINE =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "2. End-to-End Real-Time Event Pipeline (8 Stages)", styles["h1"]
        )
    )
    story.append(
        Paragraph(
            "Every security event ingested into the Zoiko Shield platform follows a deterministic, 8-stage pipeline from raw log to Merkle seal:",
            styles["body"],
        )
    )

    pipeline_details = [
        (
            "Stage 1: Multi-Cloud Telemetry Ingestion (shield-ingest)",
            "Connectors stream events from AWS CloudTrail, CrowdStrike, Okta, and Sentinel into Kafka topic `telemetry.raw`. "
            "Idempotency keys prevent duplicate processing. Dead-letter queues (DLQ) capture malformed events with automated retry (OPS-INV-13).",
        ),
        (
            "Stage 2: Strict OCSF Normalization (Untouched & Preserved)",
            "Raw logs are transformed into standardized OCSF v1.1.0 schemas (Security Finding, Network Activity, Authentication). "
            "Normalization algorithms in apps/shield-ingest/src/normalization/ remain strictly preserved without mutation.",
        ),
        (
            "Stage 3: Sigma & YARA-L Stream Detection (shield-core)",
            "High-throughput rule evaluators execute across normalized streams with sub-50ms latency. "
            "Correlated findings generate structured incident candidates with MITRE ATT&CK technique tags.",
        ),
        (
            "Stage 4: Vertex AI Copilot Reasoning & Decision Envelope Synthesis (shield-ai)",
            "Vertex AI evaluates incident severity, lateral movement paths, and containment strategies. "
            "In strict accordance with Spec §16.1, it synthesizes a 10-field Decision Envelope with calibrated confidence intervals and compensating rollback steps.",
        ),
        (
            "Stage 5: Cedar Policy Authorization & Dual-Custody Approval (shield-core)",
            "Cedar policy engines validate that proposed response actions adhere to tenant boundaries and operator privileges. "
            "Destructive actions mandate 4-eyes dual-custody approval before execution authorization is granted.",
        ),
        (
            "Stage 6: Idempotent SOAR Action Execution & Rollback (shield-action)",
            "Containment actions (e.g. endpoint isolation, token revocation, firewall rules) execute idempotently. "
            "Compensating actions are staged simultaneously, guaranteeing immediate rollback if verification checks fail.",
        ),
        (
            "Stage 7: Post-Quantum Cryptographic Merkle Anchoring (shield-anchor)",
            "State transitions and decision envelopes are hashed into domain-separated Merkle trees (ZS-MERKLE-V1). "
            "Epoch roots are anchored to Sigstore Rekor transparency logs and dual-signed with Cloud KMS / Cloud HSM using Dilithium3 + Ed25519.",
        ),
        (
            "Stage 8: Enterprise Transactional Email Dispatch (ZS-EML-TPL-001 v2.0)",
            "Security events trigger contractual transactional emails across 226 templates in 16 domains. "
            "Gate 3 enforces tenant isolation; Gate 9 routes through 8 reputation sender pools; Gate 6 scrubs secret tokens; "
            "and SHA-256 digests provide permanent render receipts for offline audit attestation.",
        ),
    ]

    for title, desc in pipeline_details:
        story.append(Paragraph(title, styles["h2"]))
        story.append(Paragraph(desc, styles["body"]))
        story.append(Spacer(1, 2))

    # ================= PAGE 3+: EMAIL TEMPLATES SPECIFICATION =================
    story.append(PageBreak())
    story.append(
        Paragraph(
            "3. Production Transactional Email Matrix (ZS-EML-TPL-001 v2.0)",
            styles["h1"],
        )
    )
    story.append(
        Paragraph(
            "Zoiko Shield implements the full 226-template transactional email catalog across 16 domains. "
            "Every template adheres to the universal render contract: (1) escapes typed variables, (2) uses allowlisted enums for status labels, "
            "(3) renders multipart HTML + plain-text, (4) enforces HTTPS CTAs, and (5) computes deterministic SHA-256 render digests.",
            styles["body"],
        )
    )

    domains_breakdown = [
        [
            Paragraph("Domain Code", styles["th"]),
            Paragraph("Domain Name", styles["th"]),
            Paragraph("Count", styles["th"]),
            Paragraph("Gate & Sender Class", styles["th"]),
            Paragraph("Operational Scope", styles["th"]),
        ],
        [
            Paragraph("SEC", styles["td"]),
            Paragraph("Security & Casework", styles["td"]),
            Paragraph("19", styles["td"]),
            Paragraph("P0 • security_sender", styles["td"]),
            Paragraph(
                "Critical alerts, escalations, war rooms, post-incident reviews.",
                styles["td"],
            ),
        ],
        [
            Paragraph("IAM", styles["td"]),
            Paragraph("Identity & Access", styles["td"]),
            Paragraph("23", styles["td"]),
            Paragraph("P0 • account_sender", styles["td"]),
            Paragraph(
                "Passkeys, MFA enrollment, password reset, JIT elevation.",
                styles["td"],
            ),
        ],
        [
            Paragraph("ORG", styles["td"]),
            Paragraph("Organization Onboarding", styles["td"]),
            Paragraph("13", styles["td"]),
            Paragraph("P0 • account_sender", styles["td"]),
            Paragraph(
                "Tenant workspaces, domain verification, residency cell changes.",
                styles["td"],
            ),
        ],
        [
            Paragraph("CONN", styles["td"]),
            Paragraph("Connectors & Ingestion", styles["td"]),
            Paragraph("15", styles["td"]),
            Paragraph("P0/P1 • security_sender", styles["td"]),
            Paragraph(
                "Connector drift, DLQ surge, ingestion delay, rate limiting.",
                styles["td"],
            ),
        ],
        [
            Paragraph("POL", styles["td"]),
            Paragraph("Policy Lifecycle", styles["td"]),
            Paragraph("12", styles["td"]),
            Paragraph("P0 • security_sender", styles["td"]),
            Paragraph(
                "Cedar policy approval, dual-custody review, canary rollout.",
                styles["td"],
            ),
        ],
        [
            Paragraph("ACT", styles["td"]),
            Paragraph("Response Actions", styles["td"]),
            Paragraph("13", styles["td"]),
            Paragraph("P0/C • security_sender", styles["td"]),
            Paragraph(
                "SOAR action approvals, emergency freeze, compensating rollback.",
                styles["td"],
            ),
        ],
        [
            Paragraph("INC", styles["td"]),
            Paragraph("P0 Incident Command", styles["td"]),
            Paragraph("16", styles["td"]),
            Paragraph("P0 • security_sender", styles["td"]),
            Paragraph(
                "Formally declared incidents, stakeholder updates, resolution.",
                styles["td"],
            ),
        ],
        [
            Paragraph("REP", styles["td"]),
            Paragraph("Threat Reports & SLA", styles["td"]),
            Paragraph("12", styles["td"]),
            Paragraph("P1 • security_sender", styles["td"]),
            Paragraph(
                "Executive risk digests, scheduled SLA reports, MITRE coverage.",
                styles["td"],
            ),
        ],
        [
            Paragraph("BIL", styles["td"]),
            Paragraph("Commercial & Billing", styles["td"]),
            Paragraph("18", styles["td"]),
            Paragraph("P0 • billing_sender", styles["td"]),
            Paragraph(
                "Invoices, payment receipts, dunning notices, quota limits.",
                styles["td"],
            ),
        ],
        [
            Paragraph("SUB", styles["td"]),
            Paragraph("Subscription Lifecycle", styles["td"]),
            Paragraph("10", styles["td"]),
            Paragraph("P0 • billing_sender", styles["td"]),
            Paragraph(
                "Tier transitions, renewals, seat allocations, cancellations.",
                styles["td"],
            ),
        ],
        [
            Paragraph("AUD", styles["td"]),
            Paragraph("Audit Ledger & Evidence", styles["td"]),
            Paragraph("14", styles["td"]),
            Paragraph("P0/P1 • assurance_sender", styles["td"]),
            Paragraph(
                "Merkle epoch seals, witness receipts, auditor dossier exports.",
                styles["td"],
            ),
        ],
        [
            Paragraph("DIS", styles["td"]),
            Paragraph("Regulatory Disclosures", styles["td"]),
            Paragraph("12", styles["td"]),
            Paragraph("P0 • privacy_sender", styles["td"]),
            Paragraph(
                "DORA reporting, GDPR data subject rights, legal hold notices.",
                styles["td"],
            ),
        ],
        [
            Paragraph("DRI", styles["td"]),
            Paragraph("DR & Failover Drills", styles["td"]),
            Paragraph("12", styles["td"]),
            Paragraph("P1 • internal_ops_sender", styles["td"]),
            Paragraph(
                "Regional cell failovers, backup verification, RTO/RPO metrics.",
                styles["td"],
            ),
        ],
        [
            Paragraph("OFF", styles["td"]),
            Paragraph("Tenant Offboarding", styles["td"]),
            Paragraph("8", styles["td"]),
            Paragraph("P0 • account_sender", styles["td"]),
            Paragraph(
                "Data destruction milestones, cryptographic key purging.",
                styles["td"],
            ),
        ],
        [
            Paragraph("OPS", styles["td"]),
            Paragraph("Internal SRE Operations", styles["td"]),
            Paragraph("20", styles["td"]),
            Paragraph("P0 • internal_ops_sender", styles["td"]),
            Paragraph(
                "Platform incidents, KMS signing failures, write durability.",
                styles["td"],
            ),
        ],
        [
            Paragraph("GOV", styles["td"]),
            Paragraph("Governance & Terms", styles["td"]),
            Paragraph("8", styles["td"]),
            Paragraph("P1 • account_sender", styles["td"]),
            Paragraph(
                "Terms updates, subprocessor notices, deprecation deadlines.",
                styles["td"],
            ),
        ],
    ]
    t_dom = Table(domains_breakdown, colWidths=[40, 115, 35, 124, 190])
    t_dom.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [WHITE, colors.HexColor("#f8fafc")],
                ),
            ]
        )
    )
    story.append(t_dom)

    # Add detailed architectural chapters for remaining backend concepts
    story.append(PageBreak())
    story.append(
        Paragraph(
            "4. Offline ADR-01 Cryptographic Verifier (verifier-cli)",
            styles["h1"],
        )
    )
    story.append(
        make_box(
            "Why We Have Used Offline Cryptographic Verification",
            "Regulatory compliance frameworks (SOC 2, ISO 27001, DORA) require that audit logs cannot be modified even by cloud administrators. "
            "If verification requires querying the cloud provider, a compromised cloud environment could forge the verification responses. "
            "Zoiko Shield solves this through the standalone verifier-cli (ADR-01), which reconstructs the Merkle root independently "
            "using zero network calls. In automated tamper injection tests, altering a single byte in an audit event causes the verifier "
            "to fail-closed with Exit Code 1, proving 100% cryptographic integrity.",
            styles,
            bg=LIGHT_BG,
            border=BRAND_BLUE,
            badge="ZERO-NETWORK AUDITABILITY",
        )
    )
    story.append(Spacer(1, 8))

    story.append(
        Paragraph("A. Mathematical Verification Algorithm", styles["h2"])
    )
    story.append(
        Paragraph(
            "1. <b>Package Loading:</b> The verifier loads <code>manifest.json</code> and local event receipt array.<br/>"
            "2. <b>Canonical Serialization:</b> Each event is canonically sorted and stripped of mutable transport metadata.<br/>"
            "3. <b>Leaf Hashing:</b> <code>H_leaf = SHA-256('ZS-LEAF-V1' || Canonical_JSON)</code>.<br/>"
            "4. <b>Merkle Tree Folding:</b> Leaves are paired and folded into the intermediate tree nodes: <code>H_node = SHA-256('ZS-NODE-V1' || H_left || H_right)</code>.<br/>"
            "5. <b>Root Attestation:</b> The computed root is compared against the Sigstore Rekor witness hash.<br/>"
            "6. <b>Tamper Detection Rejection:</b> If any byte mismatches, the verifier prints a tamper warning and exits with code 1.",
            styles["body"],
        )
    )

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated Comprehensive Backend PDF: {filename}")


if __name__ == "__main__":
    out_dir = os.path.join(
        os.path.dirname(__file__), "..", "..", "docs", "release-evidence"
    )
    os.makedirs(out_dir, exist_ok=True)
    fe_pdf = os.path.join(out_dir, "ZoikoShield_Frontend_StepByStep_Guide.pdf")
    be_pdf = os.path.join(
        out_dir, "ZoikoShield_Backend_Architecture_Pipeline_Guide.pdf"
    )

    build_frontend_pdf(fe_pdf)
    build_backend_pdf(be_pdf)

    # Also copy to docs root
    docs_dir = os.path.join(os.path.dirname(__file__), "..", "..", "docs")
    shutil.copy(
        fe_pdf,
        os.path.join(docs_dir, "ZoikoShield_Frontend_StepByStep_Guide.pdf"),
    )
    shutil.copy(
        be_pdf,
        os.path.join(
            docs_dir, "ZoikoShield_Backend_Architecture_Pipeline_Guide.pdf"
        ),
    )
    print("All PDFs compiled and mirrored to docs/ successfully!")
