import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print total page count: 'Page X of Y'
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#4B5563"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 11 * inch - 36, "ZOIKOSHIELD ™ — GCP Deployment & Production Architecture Specification")
            self.drawRightString(8.5 * inch - 54, 11 * inch - 36, "CONFIDENTIAL / ENGINEERING & DEPLOYMENT")
            self.setStrokeColor(colors.HexColor("#E5E7EB"))
            self.setLineWidth(0.75)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#E5E7EB"))
        self.setLineWidth(0.75)
        self.line(54, 46, 8.5 * inch - 54, 46)
        
        self.drawString(54, 32, "Zoiko Group • Production Engineering & Deployment Operations")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 32, page_text)
        self.restoreState()


def create_deployment_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    primary_color = colors.HexColor("#1E3A8A")   # Navy Blue
    secondary_color = colors.HexColor("#0D9488") # Teal / Emerald
    dark_neutral = colors.HexColor("#111827")    # Near Black
    text_color = colors.HexColor("#1F2937")      # Gray 800
    callout_bg = colors.HexColor("#F3F4F6")      # Gray 100
    alert_red = colors.HexColor("#DC2626")       # Red 600
    alert_bg = colors.HexColor("#FEF2F2")        # Red 50
    alert_border = colors.HexColor("#FCA5A5")    # Red 300
    info_bg = colors.HexColor("#EFF6FF")         # Blue 50
    info_border = colors.HexColor("#93C5FD")     # Blue 300

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=primary_color,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=secondary_color,
        spaceAfter=12
    )

    h1_style = ParagraphStyle(
        'SectionHeading1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionHeading2',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=text_color,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'BulletDark',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=text_color
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white
    )

    code_style = ParagraphStyle(
        'CodeText',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A")
    )

    code_bold = ParagraphStyle(
        'CodeBold',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0F172A")
    )

    story = []

    # Title Block
    story.append(Paragraph("ZOIKOSHIELD ™ PLATFORM", subtitle_style))
    story.append(Paragraph("Google Cloud Deployment & Infrastructure Blueprint", title_style))
    story.append(Paragraph("<b>Target:</b> Production / Staging Cloud Deployment on Google Cloud Platform (GCP)<br/>"
                           "<b>Compiled for:</b> Akshay Uppar (Lead Deployment Engineer) & Engineering Leadership<br/>"
                           "<b>Date:</b> 25 September 2026 • <b>Baseline:</b> GCP Native (ADR-18 Ratified)", body_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=primary_color, spaceBefore=4, spaceAfter=8))

    # Executive Summary / Context
    summary_text = (
        "<b>Executive Context & Mandate:</b> ZoikoShield has completed native GCP migration "
        "(ADR-18 ratified). All AWS KMS and S3 client dependencies have been replaced with Google Cloud KMS "
        "and Google Cloud Storage native Object Retention Lock. To satisfy the CTO Assurance Review (Lennox Report) "
        "and pass the remaining <b>NOT_RUN</b> gates (Live DR drills, regional cell verification, live pentests, "
        "and Cloud KMS HSM key custody), the platform must be provisioned and deployed on real GCP infrastructure. "
        "This document provides the authoritative, non-localhost specification, real environment variables, and operational constraints."
    )
    summary_table = Table([[Paragraph(summary_text, body_style)]], colWidths=[504])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), info_bg),
        ('BOX', (0, 0), (-1, -1), 1, info_border),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 8))

    # Section 1: The 6 Microservices
    story.append(Paragraph("1. Microservices Architecture & Container Runtime", h1_style))
    story.append(Paragraph(
        "All 6 microservices build from the <code>backend/</code> monorepo into individual container images "
        "stored in Artifact Registry. They deploy to <b>Cloud Run</b> or <b>GKE</b> with the following specifications:",
        body_style
    ))

    ms_data = [
        [
            Paragraph("Service", table_header),
            Paragraph("Port", table_header),
            Paragraph("Role & Key Responsibilities", table_header),
            Paragraph("GCP Sizing / Min Instances", table_header),
            Paragraph("Critical Runtime Constraints", table_header)
        ],
        [
            Paragraph("<b>shield-core</b>", table_cell),
            Paragraph("3001", table_cell),
            Paragraph("System of record. Identity, auth, tenants, cases, alerts, detection, evidence, commercial API.", table_cell),
            Paragraph("2 vCPU, 4GB RAM<br/><b>min-instances ≥ 1</b>", table_cell),
            Paragraph("<b>Must NOT scale to zero.</b> Runs Kafka outbox scheduler every 10s. Egress to internet (SMTP, ZoikoID) + Private Google Access.", table_cell)
        ],
        [
            Paragraph("<b>shield-ingest</b>", table_cell),
            Paragraph("3002", table_cell),
            Paragraph("High-throughput telemetry intake. Webhook / connector ingestion, OCSF normalization, quarantine.", table_cell),
            Paragraph("2 vCPU, 2GB RAM<br/><b>min-instances ≥ 1</b>", table_cell),
            Paragraph("<b>Must NOT scale to zero.</b> Runs Kafka consumer loops. Ingestion capacity is ~60 events/sec per instance (scale horizontally).", table_cell)
        ],
        [
            Paragraph("<b>shield-ai</b>", table_cell),
            Paragraph("3003", table_cell),
            Paragraph("AI copilot, guardrails, policy enforcement, Gemini / Vertex AI model routing with safe fallback.", table_cell),
            Paragraph("1 vCPU, 1GB RAM<br/>min-instances = 0/1", table_cell),
            Paragraph("Stateless HTTP service. Needs internet/VPC egress to reach Google Generative AI / Vertex AI endpoints.", table_cell)
        ],
        [
            Paragraph("<b>shield-action</b>", table_cell),
            Paragraph("3004", table_cell),
            Paragraph("Governed response. Action proposals, 4-eyes / approval quorum, simulation, signed command receipts.", table_cell),
            Paragraph("1 vCPU, 2GB RAM<br/><b>min = 1, MAX = 1</b>", table_cell),
            Paragraph("<b>CRITICAL: HARD CAP AT MAX 1 INSTANCE.</b> Approval quorum state & action locks are in-memory. Multi-instance loses pending approvals.", table_cell)
        ],
        [
            Paragraph("<b>shield-anchor</b>", table_cell),
            Paragraph("3005", table_cell),
            Paragraph("Evidence anchoring. Merkle tree checkpoints, witness receipts, Cloud KMS / PQC dual signing.", table_cell),
            Paragraph("1 vCPU, 1GB RAM<br/>min-instances = 0/1", table_cell),
            Paragraph("Needs Private Google Access to Cloud KMS for asymmetric P-256 signing.", table_cell)
        ],
        [
            Paragraph("<b>frontend</b>", table_cell),
            Paragraph("3000", table_cell),
            Paragraph("Next.js 14 Web Application & Operator Cockpit. Proxies <code>/api/v1/*</code> to backend services.", table_cell),
            Paragraph("1 vCPU, 1GB RAM<br/>min-instances ≥ 1", table_cell),
            Paragraph("Behind Cloud Load Balancing / Cloud Armor. <code>WEBHOOK_HMAC_SECRET</code> must match backend exactly.", table_cell)
        ],
        [
            Paragraph("<b>shield-core-migrate</b>", table_cell),
            Paragraph("N/A", table_cell),
            Paragraph("One-shot database migration job. Runs Prisma deploy + TypeORM SQL migrations.", table_cell),
            Paragraph("Cloud Run Job<br/>(Exit on complete)", table_cell),
            Paragraph("<b>MUST execute and exit with code 0 before shield-core or any service boots.</b>", table_cell)
        ]
    ]

    ms_table = Table(ms_data, colWidths=[80, 28, 150, 96, 150])
    ms_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(ms_table)
    story.append(Spacer(1, 8))

    # Section 2: Database Architecture
    story.append(Paragraph("2. Database Architecture (Cloud SQL for PostgreSQL 16)", h1_style))
    story.append(Paragraph(
        "ZoikoShield utilizes <b>one single PostgreSQL 16 database</b> (<code>shield_core</code>) partitioned across "
        "<b>four schemas</b> and managed by <b>two ORMs</b>. All migrations must be applied sequentially via <code>npm run migrate:deploy</code>.",
        body_style
    ))

    db_data = [
        [
            Paragraph("Schema Name", table_header),
            Paragraph("ORM Manager", table_header),
            Paragraph("Managed Objects & Models", table_header),
            Paragraph("Critical DB Engine Rules & Gotchas", table_header)
        ],
        [
            Paragraph("<b>public</b>", table_cell),
            Paragraph("<b>Prisma</b>", table_cell),
            Paragraph("231 models (events, detections, alerts, cases, evidence records, controls, commercial, telemetry)", table_cell),
            Paragraph("39 Prisma migrations in <code>backend/prisma/migrations/</code>. Requires direct connection for DDL.", table_cell)
        ],
        [
            Paragraph("<b>identity</b>", table_cell),
            Paragraph("<b>TypeORM</b>", table_cell),
            Paragraph("Principals, user credentials, sessions, passkeys (WebAuthn), federation, IAM policy documents", table_cell),
            Paragraph("20 TypeORM SQL migrations in <code>backend/typeorm-migrations/</code>. Checksummed in <code>public.infra_schema_migrations</code>.", table_cell)
        ],
        [
            Paragraph("<b>\"authorization\"</b>", table_cell),
            Paragraph("<b>TypeORM</b>", table_cell),
            Paragraph("Roles, permissions, tenant memberships, invitations, JIT access elevations", table_cell),
            Paragraph("<b>RESERVED KEYWORD WARNING:</b> <code>authorization</code> is a SQL keyword. Raw queries MUST quote it (e.g. <code>\"authorization\".tenant_memberships</code>).", table_cell)
        ],
        [
            Paragraph("<b>tenant</b>", table_cell),
            Paragraph("<b>TypeORM</b>", table_cell),
            Paragraph("Tenants, legal entities, environments, customer profiles, organization units", table_cell),
            Paragraph("Foreign keys enforce strict multi-tenant partition across regional cells.", table_cell)
        ]
    ]

    db_table = Table(db_data, colWidths=[80, 60, 184, 180])
    db_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(db_table)

    story.append(Spacer(1, 4))
    db_prereq_text = (
        "<b>Cloud SQL PostgreSQL 16 Prerequisites:</b><br/>"
        "1. Required Extensions: <code>CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";</code> and <code>CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";</code><br/>"
        "2. Private IP & SSL: Connect via Serverless VPC Connector or Cloud SQL Auth Proxy. When using <code>sslmode=require</code>, the Node.js pg driver auto-enables TLS.<br/>"
        "3. PgBouncer / Connection Poolers: TypeORM migrations split statements for transaction-mode PgBouncer, but Prisma migrations require a direct port 5432 connection."
    )
    story.append(Paragraph(db_prereq_text, body_style))

    # Page Break for clean reading
    story.append(PageBreak())

    # Section 3: Cloud Infrastructure Services to Create
    story.append(Paragraph("3. Google Cloud Services to Create (Infrastructure Checklist)", h1_style))
    story.append(Paragraph(
        "The deployment engineer (Akshay) must provision the following native GCP managed services. "
        "All configuration is declared in <code>infrastructure/tofu/regional-cell/</code>:",
        body_style
    ))

    gcp_infra_data = [
        [
            Paragraph("GCP Managed Service", table_header),
            Paragraph("Instance / Resource Name", table_header),
            Paragraph("Tier / Configuration Details", table_header),
            Paragraph("Access & Network Topology", table_header)
        ],
        [
            Paragraph("<b>Cloud SQL for PostgreSQL</b>", table_cell),
            Paragraph("<code>zs-{env}-pg-16</code>", table_cell),
            Paragraph("PostgreSQL 16, 2+ vCPU, 8GB RAM, SSD storage, automated backups & point-in-time recovery (PITR)", table_cell),
            Paragraph("Private IP only (VPC). Accessible via Serverless VPC Access connector or GKE private nodes.", table_cell)
        ],
        [
            Paragraph("<b>Memorystore for Redis</b>", table_cell),
            Paragraph("<code>zs-{env}-redis</code>", table_cell),
            Paragraph("Redis 7.x, 2GB+ Memory, Standard Tier (HA with replica in secondary zone for failover)", table_cell),
            Paragraph("Private IP only. Connected via default VPC peering.", table_cell)
        ],
        [
            Paragraph("<b>Managed Kafka (or GKE Redpanda)</b>", table_cell),
            Paragraph("<code>zs-{env}-kafka-cluster</code>", table_cell),
            Paragraph("Google Managed Service for Apache Kafka (or Redpanda cluster). Mechanism: <code>oauthbearer</code>.", table_cell),
            Paragraph("Authenticated via ambient Google Service Account (<code>roles/managedkafka.client</code>).", table_cell)
        ],
        [
            Paragraph("<b>Cloud Storage (Evidence Vault)</b>", table_cell),
            Paragraph("<code>zs-{env}-evidence-vault-{region}</code>", table_cell),
            Paragraph("<b>CRITICAL:</b> Must enable <code>--enable-per-object-retention</code>, <code>--uniform-bucket-level-access</code>, and versioning.", table_cell),
            Paragraph("Encrypted with Cloud KMS CMEK. Mode: <code>Locked</code>. No bucket-wide retention policy (per-object retention only).", table_cell)
        ],
        [
            Paragraph("<b>Cloud KMS KeyRing & Keys</b>", table_cell),
            Paragraph("KeyRing: <code>zoikoshield</code><br/>(4 Keys inside)", table_cell),
            Paragraph(
                "1. <code>anchor-checkpoint</code> (Asymmetric EC_SIGN_P256_SHA256)<br/>"
                "2. <code>evidence-collector</code> (Asymmetric EC_SIGN_P256_SHA256)<br/>"
                "3. <code>action-command</code> (Asymmetric EC_SIGN_P256_SHA256)<br/>"
                "4. <code>subject-key-wrapping</code> (Symmetric ENCRYPTION)",
                table_cell
            ),
            Paragraph("HSM protection level recommended for production. Keys 1-3 take version resource names; Key 4 takes bare key name.", table_cell)
        ],
        [
            Paragraph("<b>Artifact Registry</b>", table_cell),
            Paragraph("<code>zoikoshield-docker</code>", table_cell),
            Paragraph("Standard Docker Repository in regional location (e.g. <code>europe-west3</code> or <code>us-central1</code>)", table_cell),
            Paragraph("IAM access for CI/CD Cloud Build and Cloud Run / GKE image pulling.", table_cell)
        ],
        [
            Paragraph("<b>Secret Manager</b>", table_cell),
            Paragraph("<code>zs-{env}-*</code> secrets", table_cell),
            Paragraph("Stores JWT_SECRET, WEBHOOK_HMAC_SECRET, SSO keys, DB credentials. Injected as env vars into Cloud Run.", table_cell),
            Paragraph("Service accounts assigned <code>roles/secretmanager.secretAccessor</code>.", table_cell)
        ],
        [
            Paragraph("<b>Serverless VPC Access</b>", table_cell),
            Paragraph("<code>zs-{env}-vpc-connector</code>", table_cell),
            Paragraph("IP Range: <code>10.8.0.0/28</code>, min 2 instances, max 10 instances (e2-micro)", table_cell),
            Paragraph("Enables Cloud Run services to route private traffic to Cloud SQL, Redis, and Kafka.", table_cell)
        ]
    ]

    infra_table = Table(gcp_infra_data, colWidths=[90, 94, 170, 150])
    infra_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(infra_table)
    story.append(Spacer(1, 8))

    # Section 4: Real Environment Variables (No Localhost)
    story.append(Paragraph("4. Authoritative Real GCP Environment Variables", h1_style))
    story.append(Paragraph(
        "<b>Rule:</b> No <code>localhost</code> or <code>127.0.0.1</code> in production/staging. "
        "Omit optional environment variables rather than passing empty strings (<code>\"\"</code> overrides code defaults).",
        body_style
    ))

    env_data = [
        [
            Paragraph("Variable Name", table_header),
            Paragraph("Real GCP Value Pattern / Example", table_header),
            Paragraph("Target Service", table_header),
            Paragraph("Description & Exact Formatting Requirement", table_header)
        ],
        [
            Paragraph("<code>NODE_ENV</code>", code_bold),
            Paragraph("<code>production</code> (or <code>staging</code>)", code_style),
            Paragraph("All Services", table_cell),
            Paragraph("Activates strict production mode (dev signers throw on construction).", table_cell)
        ],
        [
            Paragraph("<code>SERVICE_NAME</code>", code_bold),
            Paragraph("<code>shield-core</code> / <code>shield-ingest</code> / ...", code_style),
            Paragraph("Per Service", table_cell),
            Paragraph("<b>Distinct per service.</b> Required to issue 60s workload identity tokens.", table_cell)
        ],
        [
            Paragraph("<code>DATABASE_URL</code>", code_bold),
            Paragraph("<code>postgres://shield:SECRET@10.10.0.3:5432/shield_core?sslmode=require</code>", code_style),
            Paragraph("shield-core, migrate", table_cell),
            Paragraph("Cloud SQL Private IP. Replace <code>SECRET</code> with fresh DB password.", table_cell)
        ],
        [
            Paragraph("<code>REDIS_URL</code>", code_bold),
            Paragraph("<code>redis://10.10.1.5:6379</code>", code_style),
            Paragraph("shield-core, ingest", table_cell),
            Paragraph("Memorystore Redis Private IP.", table_cell)
        ],
        [
            Paragraph("<code>KAFKA_BROKERS</code>", code_bold),
            Paragraph("<code>bootstrap.zs-cluster.region.managedkafka.proj.cloud.goog:9092</code>", code_style),
            Paragraph("core, ingest, action", table_cell),
            Paragraph("Managed Kafka bootstrap endpoint (comma-separated if multi-broker).", table_cell)
        ],
        [
            Paragraph("<code>KAFKA_SASL_MECHANISM</code>", code_bold),
            Paragraph("<code>oauthbearer</code>", code_style),
            Paragraph("core, ingest, action", table_cell),
            Paragraph("Uses attached GCP Service Account. No username/password needed.", table_cell)
        ],
        [
            Paragraph("<code>GOOGLE_CLOUD_PROJECT</code>", code_bold),
            Paragraph("<code>zs-production-proj</code>", code_style),
            Paragraph("core, ingest, anchor", table_cell),
            Paragraph("GCP Project ID hosting KMS and GCS Evidence Vault.", table_cell)
        ],
        [
            Paragraph("<code>EVIDENCE_GCS_BUCKET</code>", code_bold),
            Paragraph("<code>zs-prod-evidence-vault-europe-west3</code>", code_style),
            Paragraph("shield-core, ingest", table_cell),
            Paragraph("GCS Bucket created with Object Retention Lock enabled.", table_cell)
        ],
        [
            Paragraph("<code>ANCHOR_KMS_KEY_VERSION</code>", code_bold),
            Paragraph("<code>projects/P/locations/L/keyRings/zoikoshield/cryptoKeys/anchor-checkpoint/cryptoKeyVersions/1</code>", code_style),
            Paragraph("shield-anchor", table_cell),
            Paragraph("<b>MUST include /cryptoKeyVersions/N</b> (Asymmetric signing).", table_cell)
        ],
        [
            Paragraph("<code>COLLECTOR_KMS_KEY_VERSION</code>", code_bold),
            Paragraph("<code>projects/P/locations/L/keyRings/zoikoshield/cryptoKeys/evidence-collector/cryptoKeyVersions/1</code>", code_style),
            Paragraph("shield-core", table_cell),
            Paragraph("<b>MUST include /cryptoKeyVersions/N</b> (Evidence collector signature).", table_cell)
        ],
        [
            Paragraph("<code>ACTION_COMMAND_KMS_KEY_VERSION</code>", code_bold),
            Paragraph("<code>projects/P/locations/L/keyRings/zoikoshield/cryptoKeys/action-command/cryptoKeyVersions/1</code>", code_style),
            Paragraph("shield-action", table_cell),
            Paragraph("<b>MUST include /cryptoKeyVersions/N</b> (Governed response command signing).", table_cell)
        ],
        [
            Paragraph("<code>SUBJECT_KEY_KMS_KEY_NAME</code>", code_bold),
            Paragraph("<code>projects/P/locations/L/keyRings/zoikoshield/cryptoKeys/subject-key-wrapping</code>", code_style),
            Paragraph("shield-core", table_cell),
            Paragraph("<b>DO NOT append version.</b> Symmetric cryptoKey name for crypto-shredding.", table_cell)
        ],
        [
            Paragraph("<code>JWT_SECRET</code>", code_bold),
            Paragraph("<code>$(openssl rand -hex 48)</code>", code_style),
            Paragraph("shield-core", table_cell),
            Paragraph("Cryptographically secure secret for user session tokens.", table_cell)
        ],
        [
            Paragraph("<code>WEBHOOK_HMAC_SECRET</code>", code_bold),
            Paragraph("<code>$(openssl rand -hex 48)</code>", code_style),
            Paragraph("frontend, ingest", table_cell),
            Paragraph("<b>MUST BE IDENTICAL in frontend and backend</b> to forward webhooks.", table_cell)
        ],
        [
            Paragraph("<code>SHIELD_CORE_BASE_URL</code>", code_bold),
            Paragraph("<code>https://shield-core-prod-xxx-ew.a.run.app</code>", code_style),
            Paragraph("frontend, satellites", table_cell),
            Paragraph("Real Cloud Run internal URL or VPC Service Directory DNS.", table_cell)
        ]
    ]

    env_table = Table(env_data, colWidths=[120, 150, 74, 160])
    env_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ('PADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(env_table)

    # Page Break for clean reading
    story.append(PageBreak())

    # Section 5: Step-by-Step GCP Provisioning Commands
    story.append(Paragraph("5. Step-by-Step GCP Deployment Commands for Akshay", h1_style))
    story.append(Paragraph(
        "Execute these commands in the Google Cloud SDK shell (or apply via <code>infrastructure/tofu/regional-cell/</code>):",
        body_style
    ))

    cmd_text = (
        "<b>Step 1: Create Cloud KMS KeyRing and Keys</b><br/>"
        "<code>gcloud kms keyrings create zoikoshield --location=europe-west3</code><br/>"
        "<code>for KEY in anchor-checkpoint evidence-collector action-command; do<br/>"
        "&nbsp;&nbsp;gcloud kms keys create $KEY --keyring=zoikoshield --location=europe-west3 \\<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;--purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256<br/>"
        "done<br/>"
        "gcloud kms keys create subject-key-wrapping --keyring=zoikoshield --location=europe-west3 --purpose=encryption</code><br/><br/>"
        "<b>Step 2: Create GCS Evidence Bucket with Object Retention Lock</b><br/>"
        "<code>gcloud storage buckets create gs://zs-prod-evidence-vault-europe-west3 \\<br/>"
        "&nbsp;&nbsp;--location=europe-west3 --enable-per-object-retention --uniform-bucket-level-access<br/>"
        "gcloud storage buckets update gs://zs-prod-evidence-vault-europe-west3 --versioning</code><br/><br/>"
        "<b>Step 3: Create Cloud SQL PostgreSQL 16 & Enable Extensions</b><br/>"
        "<code>gcloud sql instances create zs-prod-pg-16 --database-version=POSTGRES_16 --cpu=2 --memory=8GB \\<br/>"
        "&nbsp;&nbsp;--region=europe-west3 --no-assign-ip --network=projects/PROJ/global/networks/VPC_NAME<br/>"
        "gcloud sql databases create shield_core --instance=zs-prod-pg-16<br/>"
        "# Connect via psql and execute: CREATE EXTENSION \"uuid-ossp\"; CREATE EXTENSION \"pgcrypto\";</code><br/><br/>"
        "<b>Step 4: Execute Database Migrations (One-shot Job)</b><br/>"
        "<code>gcloud run jobs create shield-core-migrate --image=europe-west3-docker.pkg.dev/PROJ/zoikoshield-docker/shield-core:latest \\<br/>"
        "&nbsp;&nbsp;--command=\"npm\",\"run\",\"migrate:deploy\" --vpc-connector=zs-prod-vpc-connector --region=europe-west3<br/>"
        "gcloud run jobs execute shield-core-migrate --wait</code><br/><br/>"
        "<b>Step 5: Deploy the Microservices (with Scaling Locks)</b><br/>"
        "<code># shield-core (min-instances=1, no CPU throttling)<br/>"
        "gcloud run deploy shield-core --image=.../shield-core:latest --min-instances=1 --no-cpu-throttling ...<br/>"
        "# shield-action (CRITICAL: min-instances=1, max-instances=1)<br/>"
        "gcloud run deploy shield-action --image=.../shield-action:latest --min-instances=1 --max-instances=1 ...<br/>"
        "# shield-ingest (min-instances=1, horizontal scale as needed)<br/>"
        "gcloud run deploy shield-ingest --image=.../shield-ingest:latest --min-instances=1 --no-cpu-throttling ...</code>"
    )

    cmd_table = Table([[Paragraph(cmd_text, body_style)]], colWidths=[504])
    cmd_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), callout_bg),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(cmd_table)
    story.append(Spacer(1, 8))

    # Section 6: Analysis of CTO Assurance Review (Lennox Report) & Next Steps
    story.append(Paragraph("6. Status of CTO Review Gaps & Testing Prerequisite", h1_style))
    story.append(Paragraph(
        "A critical analysis of the Lennox CTO Assurance Review indicates that the engineering core is sound "
        "(410/410 tests green, ADR-18 ratified, native KMS/GCS implemented). However, <b>live cloud deployment is the mandatory prerequisite</b> "
        "to resolve the remaining P0 and P1 audit gates:",
        body_style
    ))

    gap_data = [
        [
            Paragraph("Gate / Gap ID", table_header),
            Paragraph("CTO Concern", table_header),
            Paragraph("Current Status", table_header),
            Paragraph("Why Live GCP Deployment is Required", table_header)
        ],
        [
            Paragraph("<b>P0-01 Cloud Drift</b>", table_cell),
            Paragraph("AWS vs GCP baseline ambiguity.", table_cell),
            Paragraph("<b>RESOLVED</b><br/>(ADR-18 ratified)", table_cell),
            Paragraph("Google Cloud is formally ratified; native GCP KMS and GCS implemented in codebase.", table_cell)
        ],
        [
            Paragraph("<b>P0-02 Live Cell</b>", table_cell),
            Paragraph("No live regional-cell proof; tofu plan is intent only.", table_cell),
            Paragraph("<b>NOT_RUN</b><br/>(Blocked on deploy)", table_cell),
            Paragraph("Akshay must apply the OpenTofu regional cell to verify routing, health, and VPC isolation.", table_cell)
        ],
        [
            Paragraph("<b>P0-04 Security</b>", table_cell),
            Paragraph("External penetration testing & red-teaming absent.", table_cell),
            Paragraph("<b>NOT_RUN</b><br/>(Blocked on deploy)", table_cell),
            Paragraph("Independent ethical hackers require real, running HTTPS staging endpoints on GCP.", table_cell)
        ],
        [
            Paragraph("<b>P0-05 DR Proof</b>", table_cell),
            Paragraph("1,326-record drill was reconciliation, not full DR.", table_cell),
            Paragraph("<b>NOT_RUN</b><br/>(Blocked on deploy)", table_cell),
            Paragraph("Requires executing actual point-in-time recovery on Cloud SQL and GCS under live load.", table_cell)
        ],
        [
            Paragraph("<b>P0-08 PQC & KMS</b>", table_cell),
            Paragraph("Ephemeral keys used in CI; production key custody unproven.", table_cell),
            Paragraph("<b>NOT_RUN</b><br/>(Blocked on deploy)", table_cell),
            Paragraph("Requires testing against real Google Cloud KMS HSM asymmetric signing keys.", table_cell)
        ],
        [
            Paragraph("<b>P1-09 Ingest Scale</b>", table_cell),
            Paragraph("Ingestion load test measured ~60/sec vs 15k envelope.", table_cell),
            Paragraph("<b>FAIL</b><br/>(Needs live cluster)", table_cell),
            Paragraph("Must benchmark distributed multi-replica shield-ingest against Managed Kafka on GCP.", table_cell)
        ]
    ]

    gap_table = Table(gap_data, colWidths=[80, 120, 84, 220])
    gap_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(gap_table)
    story.append(Spacer(1, 8))

    # Section 7: Final Signoff Checklist
    story.append(Paragraph("7. Deployment Handover Summary for Akshay", h1_style))
    handover_box = (
        "<b>Immediate Action Items for Akshay:</b><br/>"
        "1. <b>Create GCP Resources:</b> Cloud SQL (Postgres 16 + uuid-ossp/pgcrypto), Memorystore Redis, Cloud Storage (Object Retention), Cloud KMS (4 keys), VPC Connector.<br/>"
        "2. <b>Configure Secret Manager:</b> Generate new 48-byte hex secrets for <code>JWT_SECRET</code>, <code>WEBHOOK_HMAC_SECRET</code>, <code>SSO_TRANSACTION_ENCRYPTION_KEY</code>.<br/>"
        "3. <b>Run Migration Job:</b> Execute <code>gcloud run jobs execute shield-core-migrate</code> and verify exit code 0.<br/>"
        "4. <b>Deploy Cloud Run Services:</b> Enforce <code>min-instances=1</code> on core/ingest/action, and <b>cap shield-action at max-instances=1</b>.<br/>"
        "5. <b>Provide Live Endpoints to Team:</b> Export HTTPS service URLs to enable the QA/Security team to run live DR drills, load tests, and G1 certification."
    )
    handover_table = Table([[Paragraph(handover_box, body_style)]], colWidths=[504])
    handover_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), alert_bg),
        ('BOX', (0, 0), (-1, -1), 1, alert_border),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(handover_table)

    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully generated at: {output_path}")

if __name__ == '__main__':
    target_pdf = os.path.abspath(r"c:\Users\aparaziitha nitta\zoiko-shield-platform\docs\ZOIKOSHIELD_GCP_DEPLOYMENT_SPECIFICATION.pdf")
    create_deployment_pdf(target_pdf)
    
    # Also write a copy in the root directory for easy access
    root_pdf = os.path.abspath(r"c:\Users\aparaziitha nitta\zoiko-shield-platform\ZOIKOSHIELD_GCP_DEPLOYMENT_SPECIFICATION.pdf")
    create_deployment_pdf(root_pdf)
