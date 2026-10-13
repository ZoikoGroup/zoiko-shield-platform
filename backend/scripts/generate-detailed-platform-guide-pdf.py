#!/usr/bin/env python3
"""
ZoikoShield - Complete Frontend + Backend + Email Guide (v3) PDF generator.

Run from the workspace root:
    python backend/scripts/generate-detailed-platform-guide-pdf.py

Output:
    docs/ZoikoShield_Complete_Frontend_Backend_Guide_v3.pdf
    docs/release-evidence/ZoikoShield_Complete_Frontend_Backend_Guide_v3.pdf

Every statement in this guide was taken from reading the real source code
(frontend/src/app, frontend/src/lib, backend/apps/*). Where the code and older
documents disagree, the code is treated as the source of truth and the
difference is called out in Part H.
"""
import os
import re
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, KeepTogether,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_NAME = "ZoikoShield_Complete_Frontend_Backend_Guide_v3.pdf"
OUT_DOCS = os.path.join(ROOT, "docs", OUT_NAME)
OUT_EVID = os.path.join(ROOT, "docs", "release-evidence", OUT_NAME)

NAVY = colors.HexColor("#090d16")
BLUE = colors.HexColor("#0284c7")
CYAN = colors.HexColor("#0891b2")
SLATE = colors.HexColor("#334155")
LIGHT = colors.HexColor("#f1f5f9")
LINE = colors.HexColor("#cbd5e1")
WARN_BG = colors.HexColor("#fef3c7")
WARN_FG = colors.HexColor("#92400e")
WHY_BG = colors.HexColor("#e0f2fe")
GAP_BG = colors.HexColor("#fee2e2")
GAP_FG = colors.HexColor("#991b1b")
OK_BG = colors.HexColor("#dcfce7")

# ---------------------------------------------------------------- styles
def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.6, leading=13.6,
                textColor=colors.HexColor("#0f172a"), alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

ST_BODY = S("body", spaceAfter=4)
ST_SMALL = S("small", fontSize=8.4, leading=11.4)
ST_CELL = S("cell", fontSize=8.4, leading=11)
ST_CELLB = S("cellb", fontSize=8.4, leading=11, fontName="Helvetica-Bold", textColor=colors.white)
ST_H1 = S("h1", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=BLUE, spaceAfter=8)
ST_H2 = S("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=8, spaceAfter=4)
ST_H3 = S("h3", fontName="Helvetica-Bold", fontSize=10.6, leading=14, textColor=CYAN, spaceBefore=6, spaceAfter=2)
ST_BUL = S("bul", leftIndent=14, bulletIndent=3, spaceAfter=2.5)
ST_NUM = S("num", leftIndent=18, bulletIndent=2, spaceAfter=3)
ST_PART = S("part", fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=BLUE, spaceAfter=10)
ST_CARD_T = S("cardt", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.white)
ST_CARD_M = S("cardm", fontSize=8.6, leading=11.5, textColor=colors.HexColor("#bae6fd"))

def t(s):
    """Escape for reportlab Paragraph, then apply **bold** and `code`."""
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.6" color="#0b5c7a">\1</font>', s)
    return s

def P(s, st=ST_BODY):
    return Paragraph(t(s), st)

def bullets(items, st=ST_BUL):
    return [Paragraph(t(i), st, bulletText="\u2022") for i in items]

def numbered(items):
    return [Paragraph(t(i), ST_NUM, bulletText="%d." % (n + 1)) for n, i in enumerate(items)]

def box(title, items, bg, fg):
    rows = [[Paragraph("<b>%s</b>" % t(title), S("bt", fontSize=9.4, textColor=fg))]]
    for i in items:
        rows.append([Paragraph(t(i), S("bi", fontSize=8.8, leading=12, leftIndent=8, bulletIndent=0,
                                       textColor=colors.HexColor("#1e293b")), bulletText="\u2022")])
    tb = Table(rows, colWidths=[174 * mm])
    tb.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return tb

def table(header, rows, widths, zebra=True):
    data = [[Paragraph(t(h), ST_CELLB) for h in header]]
    for r in rows:
        data.append([Paragraph(t(c), ST_CELL) for c in r])
    tb = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), SLATE),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if zebra:
        for i in range(1, len(data)):
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    tb.setStyle(TableStyle(style))
    return tb

def banner(title, meta):
    inner = [[Paragraph(t(title), ST_CARD_T)], [Paragraph(t(meta), ST_CARD_M)]]
    tb = Table(inner, colWidths=[174 * mm])
    tb.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
        ("LINEBELOW", (0, -1), (-1, -1), 3, BLUE),
    ]))
    return tb

# ---------------------------------------------------------------- canvas
class NumberedCanvas(rl_canvas.Canvas):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._draw_chrome(total)
            super().showPage()
        super().save()

    def _draw_chrome(self, total):
        pn = self._pageNumber
        if pn == 1:
            return
        w, h = A4
        self.setFillColor(NAVY)
        self.rect(0, h - 11 * mm, w, 11 * mm, stroke=0, fill=1)
        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 8.5)
        self.drawString(18 * mm, h - 7 * mm, "ZoikoShield Platform  |  Complete Frontend, Backend & Email Guide  v3")
        self.setFillColor(colors.HexColor("#7dd3fc"))
        self.setFont("Helvetica", 8)
        self.drawRightString(w - 18 * mm, h - 7 * mm, "Verified against source code")
        self.setStrokeColor(LINE)
        self.line(18 * mm, 12 * mm, w - 18 * mm, 12 * mm)
        self.setFillColor(SLATE)
        self.setFont("Helvetica", 8)
        self.drawString(18 * mm, 8 * mm, "Confidential - ZoikoShield engineering and onboarding material")
        self.drawRightString(w - 18 * mm, 8 * mm, "Page %d of %d" % (pn, total))

def cover(c, doc):
    w, h = A4
    c.setFillColor(NAVY)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setFillColor(BLUE)
    c.rect(0, h - 70 * mm, w, 3, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(22 * mm, h - 100 * mm, "ZoikoShield")
    c.setFont("Helvetica-Bold", 20)
    c.drawString(22 * mm, h - 114 * mm, "Complete Frontend, Backend & Email Guide")
    c.setFillColor(colors.HexColor("#7dd3fc"))
    c.setFont("Helvetica", 12)
    c.drawString(22 * mm, h - 126 * mm, "Version 3 - page by page, step by step, with the reason for every choice")
    c.setFillColor(colors.HexColor("#cbd5e1"))
    c.setFont("Helvetica", 10.5)
    lines = [
        "Part A  Architecture, ports and why the platform is split this way",
        "Part B  Frontend foundation: shell, data layer, UI states, design",
        "Part C  Every frontend page: flow, logic, backend call and WHY",
        "Part D  The email system in full (templates, gates, every email path)",
        "Part E  Backend services explained step by step",
        "Part F  End-to-end ERB-01 flow, UI -> API -> service",
        "Part G  Setup and troubleshooting runbook (incl. 'Invalid credentials')",
        "Part H  Verified findings and remaining work",
    ]
    y = h - 150 * mm
    for ln in lines:
        c.drawString(22 * mm, y, ln)
        y -= 7.5 * mm
    c.setFillColor(colors.HexColor("#94a3b8"))
    c.setFont("Helvetica", 9)
    c.drawString(22 * mm, 22 * mm, "Source of truth: the repository code (frontend/src, backend/apps). Generated by backend/scripts/generate-detailed-platform-guide-pdf.py")

# ---------------------------------------------------------------- page card
def card(title, route, file, see, steps, front, back, why, gaps=None):
    f = []
    f.append(PageBreak())
    f.append(banner(title, "Route: %s     |     Source: %s" % (route, file)))
    f.append(Spacer(1, 3 * mm))
    f.append(P("What the user sees", ST_H3))
    f += bullets(see)
    f.append(P("Step-by-step flow (what you do, what happens)", ST_H3))
    f += numbered(steps)
    f.append(P("Frontend logic (how the page is built)", ST_H3))
    f += bullets(front)
    f.append(P("Backend call and what the backend does", ST_H3))
    f += bullets(back)
    f.append(Spacer(1, 2 * mm))
    f.append(box("WHY we built it this way", why, WHY_BG, BLUE))
    if gaps:
        f.append(Spacer(1, 2 * mm))
        f.append(box("Verified gaps on this page (see Part H)", gaps, GAP_BG, GAP_FG))
    return f

def section(letter, title, intro):
    f = [PageBreak(), Spacer(1, 30 * mm), P("Part %s" % letter, ST_PART), P(title, ST_H1), Spacer(1, 4 * mm)]
    f.append(P(intro))
    return f

# ================================================================= CONTENT
def build_story():
    st = []
    st.append(Spacer(1, 1))  # cover page body is drawn by canvas
    st.append(PageBreak())

    # ------------------------------------------------------------ contents
    st.append(P("How to read this guide", ST_H1))
    st.append(P("This guide was written so that a new engineer, a product owner, an auditor or a customer success person "
                "can each understand the platform without asking anyone. Every page of the product is described the same way: "
                "**what the user sees**, **the steps**, **how the frontend works**, **which backend service answers**, and "
                "**why** it was built that way. Where the real code has a gap or a mismatch, it is stated plainly in a red box "
                "instead of being hidden."))
    st.append(P("What ZoikoShield is, in one paragraph", ST_H2))
    st.append(P("ZoikoShield is a multi-tenant cloud security platform. Customer systems (GitHub, Azure Monitor, cloud logs, webhooks) send "
                "security events in. The platform **normalizes** them, runs **detections**, raises **alerts**, lets analysts open **cases**, "
                "lets an **AI copilot** summarise and suggest, lets approved people run **SOAR response actions**, and finally proves everything "
                "with a **tamper-evident Merkle evidence ledger** that an auditor can verify offline. Every step is tenant-isolated, "
                "role-checked, and audited."))
    st.append(P("Contents", ST_H2))
    toc = [
        ["A", "Architecture, ports, why a proxy, why separate services", "3-5"],
        ["B", "Frontend foundation: shell, data layer, 7 UI states, design system", "6-9"],
        ["C", "Page-by-page frontend guide (25 page cards)", "10-37"],
        ["D", "Email system: templates, gates, every email path, status", "38-44"],
        ["E", "Backend services step by step", "45-53"],
        ["F", "End-to-end ERB-01 flow", "54-55"],
        ["G", "Setup and troubleshooting runbook", "56-57"],
        ["H", "Verified findings and remaining work", "58-60"],
    ]
    st.append(table(["Part", "Topic", "Approx. pages"], toc, [14, 130, 30]))
    st.append(Spacer(1, 3 * mm))
    st.append(box("Verification basis", [
        "Every page and service in this guide was read from the repository source (frontend/src/app, frontend/src/lib, frontend/src/components, backend/apps/*).",
        "The page -> API wiring map in Part C was built from the real calls in the page files and lib/api-client.ts.",
        "Older documents under docs/ disagree with the code in a few places (ports, password hashing, demo fallback). The code wins; see Part H.",
        "Page numbers in the contents are approximate because section lengths can change when the generator is re-run.",
    ], OK_BG, colors.HexColor("#166534")))

    # ------------------------------------------------------------ PART A
    st += section("A", "Architecture, ports and why it is split this way",
                  "Before looking at pages, understand the shape of the system. The browser never talks to the security services directly. "
                  "It talks to one Next.js app, which forwards to the right backend service.")
    st.append(P("A1. The services and their ports", ST_H2))
    st.append(table(["Service", "Port", "Responsibility", "Why separate"], [
        ["frontend (Next.js)", "3000", "UI, plus a server-side proxy at /api/v1/[...slug]", "One origin for the browser; secrets stay on the server"],
        ["shield-core", "3001", "Identity, tenants, RBAC, auth, onboarding, cases, notifications, audit, governance", "Everything that must be consistent and transactional"],
        ["shield-ingest", "3002", "Connectors, webhooks, normalization, events", "Highest traffic; must scale and fail alone"],
        ["shield-ai", "3003", "Copilot, grounding gate, model-armor safety gateway, AI governance", "AI is risky; isolating it limits blast radius"],
        ["shield-action", "3004", "SOAR actions, freeze, rollback, dual-custody quorum", "Actions change customer systems; strict control"],
        ["shield-anchor", "3005", "Merkle tree, anchoring, receipts, proofs", "Evidence integrity must be independent of the app"],
        ["verifier-cli", "offline", "Re-verifies Merkle proofs without the platform", "Auditors must not have to trust our servers"],
        ["PostgreSQL / Redis / Redpanda", "5432 / 6379 / 9092", "Data / cache and rate limits / Kafka events", "Durable state, speed, async decoupling"],
    ], [34, 20, 70, 50]))
    st.append(Spacer(1, 3 * mm))
    st.append(P("Older documents list ports 3000-3004. The code (`shield-anchor` on 3005 and `shield-core` reading `PORT`) is authoritative.", ST_SMALL))
    st.append(P("A2. How one click travels through the system", ST_H2))
    st += numbered([
        "The user clicks a button in a page component (React, in the browser).",
        "The page calls a method on `lib/api-client.ts` (`ZoikoShieldApiClient`) or `lib/backend.ts` (`backend.get/post/patch`).",
        "That sends `fetch('/api/v1/...')` to the **same origin** (Next.js on port 3000) and attaches `x-tenant-id`.",
        "The Next.js route `frontend/src/app/api/v1/[...slug]/route.ts` decides which backend service owns that path and forwards the request with the Authorization header and cookies.",
        "The backend service authenticates, authorizes (RBAC, tenant check, Cedar-style policy), does the work, writes an audit record and returns JSON.",
        "The proxy returns the real response (or a real error) to the browser; the page shows data or one of the 7 mandatory UI states.",
    ])
    st.append(P("A3. Why a proxy instead of calling services directly", ST_H2))
    st.append(box("WHY", [
        "**One origin = no CORS pain and cookies work.** The session cookie is set for the Next.js origin; browsers never need to know five backend hosts.",
        "**Secrets stay on the server.** Webhook calls under `ingestion/webhooks/*` are signed server-side with HMAC `${timestamp}.${nonce}.${body}` using `WEBHOOK_HMAC_SECRET`; the key is never shipped to the browser.",
        "**One place to route.** `ingestion/*` and `events*` go to ingest, `ai/*` and `copilot*` to AI, `actions/*` and `response/*` to action, `anchor/*` and `ledger/*` to anchor, everything else to core.",
        "**Honest errors.** The proxy no longer fabricates data when a service is down: it returns `502 Bad Gateway` (15 s timeout, `BACKEND_PROXY_TIMEOUT_MS`) so the UI shows a real degraded state.",
        "**Streaming works.** Server-sent events are passed straight through for live pages.",
    ], WHY_BG, BLUE))
    st.append(P("A4. Proxy routing table", ST_H2))
    st.append(table(["Path prefix", "Goes to", "Env variable"], [
        ["ingestion/*, events*", "shield-ingest :3002", "SHIELD_INGEST_URL"],
        ["ai/*, copilot*", "shield-ai :3003", "SHIELD_AI_URL"],
        ["actions/*, response/*", "shield-action (or core)", "SHIELD_ACTION_URL"],
        ["anchor/*, ledger/*", "shield-anchor (or core)", "SHIELD_ANCHOR_URL"],
        ["everything else (auth, tenants, cases, alerts, notifications...)", "shield-core :3001", "SHIELD_CORE_URL"],
    ], [80, 50, 44]))
    st.append(P("A5. Principles used everywhere", ST_H2))
    st += bullets([
        "**Tenant isolation first:** every request carries a tenant; resources from another tenant are rejected, not hidden.",
        "**Least privilege:** actions need explicit permissions such as `tenant:member:invite`; risky actions need two people.",
        "**Fail closed:** unknown template, bad signature, missing field, secret in an email - all are refused, never best-effort sent.",
        "**Everything is audited and provable:** audit rows feed the Merkle ledger so evidence cannot be silently edited.",
        "**Honest UI:** loading, stale, partial, degraded, unauthorized, unavailable and recovery are separate visible states.",
    ])

    # ------------------------------------------------------------ PART B
    st += section("B", "Frontend foundation",
                  "Pages are thin. The shell, the data layer and the shared UI states do most of the work. Understanding these four "
                  "pieces makes every page card in Part C easy to read.")
    st.append(P("B1. The application shell (what is on every page)", ST_H2))
    st += bullets([
        "**TrustBar (top):** tenant organisation name, environment badge (for example PRODUCTION-US-EAST), region (for example eu-west-1), 'Evidence: Signed Merkle checkpoints', 'Microservices: 5/5 OK', and the signed-in user's name and role (for example ANALYST OPS / SECURITY_ANALYST).",
        "**Sidebar (left):** grouped navigation with small status badges, plus a footer showing 'Merkle Epoch #1043' and 'PQC Seal ML-DSA-65'.",
        "**DemoGuideBar (bottom):** the ERB-01 runbook stepper, stages 1-10, with Prev / Next Stage. It walks a demo audience through the product in order.",
        "**Content area:** the active page.",
    ])
    st.append(box("WHY", [
        "The TrustBar answers 'which customer, which environment, which region, who am I?' on every screen. In security tooling, acting in the wrong tenant is the worst mistake, so it is always visible.",
        "Sidebar groups mirror the real job of a SOC team: investigate, buy/configure, connect and comply, administer, govern the platform.",
        "The DemoGuideBar lets sales, QA and auditors replay one fixed story (ERB-01) the same way every time.",
    ], WHY_BG, BLUE))
    st.append(P("Note: 'Microservices: 5/5 OK', 'Merkle Epoch #1043' and 'PQC Seal ML-DSA-65' are currently static labels. Real health is on the Platform Service Health page.", ST_SMALL))
    st.append(P("B2. Sidebar groups and every entry", ST_H2))
    st.append(table(["Group", "Entries (route)"], [
        ["SEC-OPS & INVESTIGATION", "Command Center (/), AI Security Copilot (/copilot, 6 MODES), Ingestion Console (/ingestion), Detection & Alerts (/alerts), Case Workspace (/cases), AI Safety & Incidents (/ai-governance), Threat Hunting Copilot (/hunting, ReAct), Playbook Runs W18 (/playbooks), Response Proposals W34, Simulation Replay (/red-team), SOAR Actions & Freeze (/actions, R0-R4), IR Retainer (/ir-retainer, 24x7)"],
        ["COMMERCIAL & CATALOGUE", "Services Catalogue (/services), Plans & Band Pricing (/pricing), Sector Solution Packs (/sector-packs)"],
        ["CONNECTIVITY & COMPLIANCE", "Connectors Wizard (/connectors), Policy Lifecycle W12 (/policies, 4-EYES), Merkle Evidence Ledger (/ledger, ZS-MERKLE), Controls & Compliance (/controls), Evidence Operations W24, Risk & Exceptions W27/28 (/risk), Notification Center W04 (/notifications), Audit & Verifier (/audit, SEALED)"],
        ["TENANT ADMINISTRATION", "Team & Invitations (/team), Organization Onboarding (/onboarding), MSSP Fleet & 2-Party JIT (/partner/fleet), Switch Account / Login (/login)"],
        ["PLATFORM ADMIN & GOVERNANCE", "Platform Service Health (section 31/32), G1 Launch Gate Protocol (0/8 GATE), JIT Elevation Quorum (section 13, FOUR-EYES), GTM Pre-Flight Checklist (12/12 PASS), Operations & Entitlements (/admin, OPERATOR)"],
        ["G2 EXPERIENCE CONTRACTS", "Incident Command W19, SOC Shift Handover W20, Asset Inventory W29, Findings W30, Executive Risk W31, Audit Reports W32, Admin Export W36, Developer W37, Trust W38"],
    ], [42, 132]))
    st.append(P("B3. The data layer (how pages get data)", ST_H2))
    st += bullets([
        "**`lib/api-client.ts`** (`ZoikoShieldApiClient`, about 5,600 lines): one typed method per backend operation. All pages use it, so URLs and payload shapes live in one file.",
        "**`safeFetch(fn, fallbackFn)`:** runs the real call. A demo fallback is used **only if** `NEXT_PUBLIC_DEMO_FALLBACK === 'true'`. By default it is off, so a failure surfaces as a real error. (Older documents that claim 100% demo fallback are outdated.)",
        "**`lib/backend.ts`:** a smaller helper, `backend.get/post/patch`, throws `BackendError`, and `asList()` unwraps `items | results | records | data` arrays.",
        "**`lib/demo-state.ts`, `contract-state.ts`:** remember the active tenant id, user session and BFF contract state in the browser.",
        "**`lib/webauthn.ts`:** wraps the browser passkey (FIDO2) APIs.",
        "**`lib/use-event-stream.ts`:** subscribes to server-sent events for live updates.",
        "**`lib/types.ts`:** shared TypeScript types that mirror backend DTOs.",
    ])
    st.append(box("WHY", [
        "A single client means one place to add the tenant header, error handling and retries. A page cannot forget the tenant.",
        "Fallback is opt-in because silent fake data is dangerous in a security product: an analyst could believe an alert list is real when the backend is down.",
        "Typed methods give compile-time protection when a DTO changes (although see Part H: a few DTO shapes still drift).",
    ], WHY_BG, BLUE))
    st.append(P("B4. The seven mandatory UI states", ST_H2))
    st.append(P("Defined in `components/states/mandatory-ui-states.tsx`; each is announced with `aria-live` so screen readers hear changes."))
    st.append(table(["State", "Meaning", "Typical trigger"], [
        ["LOADING", "Request in progress", "Page just opened"],
        ["PARTIAL", "Some data loaded, some missing", "One of several service calls failed"],
        ["STALE", "Data shown is older than its freshness window", "Live feed lagging"],
        ["DEGRADED", "System running on a safe fallback", "AI kill switch active; deterministic rule engine used"],
        ["UNAUTHORIZED", "Caller lacks permission or step-up", "HTTP 401 / 403"],
        ["UNAVAILABLE", "Service not reachable", "Proxy 502 / timeout"],
        ["RECOVERY", "Service came back; refreshing", "After retry succeeds"],
    ], [28, 80, 66]))
    st.append(P("B5. UI kit and design language", ST_H2))
    st += bullets([
        "`components/ui`: Card, Badge, Button, Modal, Tabs. Pages compose these instead of inventing styles, so the product looks consistent.",
        "Dark theme with cyan/blue accents, status colours (green pass, amber warn, red fail, purple governance) and short badges such as 4-EYES, SEALED, R0-R4.",
        "Badges are used to put **control information next to the name** (for example '4-EYES' on Policy Lifecycle) so users learn the rule before they click.",
    ])
    st.append(box("WHY", [
        "A dark, dense layout is the convention for SOC tools used for long shifts; contrast badges let an analyst scan state in a second.",
        "Shared components mean accessibility fixes (focus, aria) are made once and apply everywhere.",
    ], WHY_BG, BLUE))

    # ------------------------------------------------------------ PART C
    st += section("C", "Page-by-page frontend guide",
                  "25 page cards follow. Each describes the screen, the steps, the logic, the backend call and the reason. "
                  "Order follows a real customer journey: sign in, onboard, see the command center, connect data, detect, investigate, "
                  "respond, prove, administer.")

    st += card("C1. Login / Switch Account", "/login", "frontend/src/app/login/page.tsx",
        ["Fields: **Analyst Identity Email**, **Password Fallback Credential**, **Tenant ID** (with the hint 'npm run seed:dev-tenant prints one').",
         "Preset buttons (sarah.chen@acme.com, owner@acme.com, admin@zoikoshield.io) for quick demo sign-in.",
         "Primary button 'Authenticate & Issue JWT Bearer Token' and passkey (FIDO2/WebAuthn) options.",
         "On failure: a red banner with the message and, above it, a red policy line."],
        ["Open /login. Email defaults to `analyst@zoikoshield-demo.com`; tenant id comes from saved demo state.",
         "Type email, password and tenant id (a UUID such as `00000000-0000-4000-8000-000000000001`).",
         "Click Authenticate. The page calls `POST /api/v1/auth/login` with `x-tenant-id`.",
         "Success: the backend sets JWT and refresh cookies; the page stores the session (name, role, tenant) and sends you to the Command Center.",
         "Failure: the page shows the error and the UnauthorizedState. Passkey path: `/auth/passkeys/authentication/options` then `/auth/passkeys/authentication`."],
        ["Any 401/403, or any message containing 'Cedar' or 'FIDO2', renders UnauthorizedState with a **hard-coded label**: 'CEDAR_POLICY_DENY: Authentication step-up required'.",
         "That red policy line is **not a real Cedar decision**. It is a generic label chosen by the page. In your screenshot the real cause is the line below it: backend `Invalid credentials`.",
         "Tenant id is a required field because the backend binds a session to exactly one tenant."],
        ["`AuthService.login` looks up the principal, checks status, loads the local credential and compares the password with **bcrypt**.",
         "Lockout after `LOCKOUT_THRESHOLD` failed attempts. Unverified email returns 403 'Email not verified'. Throttle 10 requests per minute.",
         "`sessionContext.resolveBinding` confirms the user belongs to the tenant, then JWT + refresh tokens are issued in cookies and identity events are written.",
         "Unknown email, inactive user, no local credential and wrong password all return the **same** `Invalid credentials` (anti-enumeration).",
         "Passkey login produces a PASSKEY assurance level for step-up decisions."],
        ["Anti-enumeration: an attacker must not learn which emails exist, so all failures look identical.",
         "Passwords are a fallback; passkeys give phishing-resistant assurance, which policies can require for sensitive actions.",
         "Cookies (HttpOnly) rather than tokens in JavaScript protect sessions from script theft.",
         "Tenant binding at login prevents a valid user from silently acting in the wrong customer."],
        ["Your 'Invalid credentials' means that email/password/tenant combination does not exist in the database. Fix: see Part G (seed commands).",
         "Hard-coded 'CEDAR_POLICY_DENY' label is misleading and should show the backend message only.",
         "Older docs say Argon2id; the code uses bcrypt."])

    st += card("C2. Organization Onboarding", "/onboarding", "frontend/src/app/onboarding/page.tsx",
        ["A guided form to create a new customer tenant: organisation name, slug, legal entity, environment name, home region, data class, order id.",
         "A 'Seed New Commercial Order' helper button that fills an order id."],
        ["Fill organisation name and slug (URL-safe short name).",
         "Choose the home region (data residency) and environment.",
         "Submit. The page calls `POST /api/v1/onboarding`.",
         "On success the backend creates the tenant, the owner principal and an owner activation invitation, and the owner receives an activation email (ZS-EML-ORG-002).",
         "The owner opens the link, sets credentials and signs in."],
        ["Sends `{organizationName, slug, legalEntityName, environmentName, homeRegion}`. `orderId` and `dataClass` are collected but **not sent**.",
         "'Seed New Commercial Order' only generates a random string; it does not call a billing system.",
         "Uses the shared Button/Card components and shows loading and error states."],
        ["`OnboardingService` creates tenant, legal entity, owner principal and invitation in one flow and emits audit events.",
         "`MailService.sendOwnerInvitation` renders template `ZS-EML-ORG-002`; link is `${APP_BASE_URL}/accept-invite?token=...`.",
         "Backend DTO `OnboardTenantDto` (whitelist on) requires `orderId, tenantName, tenantSlug, homeRegion, legalEntity{...}, ownerEmail, accessDisclosureVersion`."],
        ["Tenant creation is the legal and commercial start of a customer: region fixes where data lives; legal entity drives contracts and privacy.",
         "Ownership starts with an invitation (not a password we invent) so the owner proves control of the email address.",
         "Order id ties provisioning to a purchase so that tenants cannot appear without a commercial record."],
        ["**Contract mismatch:** the frontend payload does not match `OnboardTenantDto` (field names, missing ownerEmail/orderId/legalEntity). Real onboarding will return 400 until aligned.",
         "The activation link points to `/accept-invite`, but **no such frontend page exists** yet."])

    st += card("C3. Command Center (home)", "/", "frontend/src/app/page.tsx",
        ["Top banner 'BFF EXPERIENCE CONTRACT (LAB 14): HEALTHY_SYNCED' with freshness and correlation id.",
         "Hero 'ZoikoShield SecOps & Cryptographic Command Center' with buttons 'AI Safety Cockpit' and 'Simulate Telemetry'.",
         "Amber 'AI Safety Guardrail Degraded' notice when a model is under containment.",
         "Four metric cards: Unresolved Alerts, AI Safety & Drift, Active Connectors, Compliance Posture.",
         "ERB-01 Demonstration Runbook: 8 cards covering steps 1-12 across the services."],
        ["Land on the page after login.",
         "Read the banner: is the experience contract healthy and how fresh is the data?",
         "Look at the four cards to decide where to go first (alerts, AI incidents, connectors, compliance).",
         "Click a runbook card, or use the bottom stepper (stages 1-10) to follow the story.",
         "Use 'Simulate Telemetry' to push demo events through the pipeline."],
        ["Calls several client methods in parallel (alerts, cases, connectors via `getConnectors`, control tests).",
         "Conditionally renders Loading, Stale, Partial or Degraded states from the shared state components.",
         "Compliance posture is computed from control test results; connector count and ingest health come from the live connector list."],
        ["Reads: alerts, cases, connectors (shield-ingest), control tests, AI governance status. Each goes through the proxy to the owning service.",
         "Degraded notice reflects the AI kill switch / `SafeDegradationService` (deterministic rule engine takes over)."],
        ["A home page must answer 'is anything on fire and is the platform itself healthy?' in five seconds.",
         "Showing degradation explicitly (instead of hiding it) is a trust feature: analysts know when AI help is reduced.",
         "The runbook doubles as built-in onboarding and a demo script."],
        ["Static TrustBar labels (5/5 OK) may disagree with real health; use Platform Service Health for truth."])

    st += card("C4. Team & Invitations", "/team", "frontend/src/app/team/page.tsx",
        ["Member list for the tenant with roles and status.",
         "An invite form (email + role) and a pending invitation list.",
         "Passkey management: list registered passkeys, register new, revoke.",
         "A demo button 'Switch to Invitee & Accept' to simulate the invitee side."],
        ["Open Team. The page loads members from `/tenants/:id/members` and invitations from `/tenants/:id/invitations`.",
         "Enter an email and choose a role, click Invite.",
         "The backend creates a pending invitation and returns a one-time token.",
         "The invitee signs in as that email and accepts via `/invitations/:token/accept`.",
         "A new TenantMembership appears in the list."],
        ["Uses `backend` helper and API client methods; refreshes lists after each action.",
         "Passkey section uses `lib/webauthn.ts` (`/auth/passkeys/registration/options`, `/registration`, list and revoke).",
         "Errors are currently only written to the console."],
        ["Requires permission `tenant:member:invite`. Platform-level roles cannot be granted by invitation.",
         "Token = 32 random bytes in hex; only its **SHA-256 hash** is stored. Default expiry applies.",
         "Accept requires an authenticated principal whose email equals the invited email, status PENDING and not expired; membership source is INVITATION.",
         "**No email is sent** for tenant member invitations: the token is shown in the UI."],
        ["Invitations are the only safe way to add people: the account owner (not an admin typing a password) proves identity.",
         "Storing a hash means a database leak cannot be replayed to join a tenant.",
         "Email-match on accept stops a leaked link being used by a different person."],
        ["Frontend `inviteAnalyst` sends `{invitedEmail, assignedRole}` but backend `CreateInvitationDto` needs `{invitedEmail, roleId}`; `assignedRole` is stripped by the whitelist, so real invites likely fail with 400 and the page does not tell the user.",
         "Backend returns `{invitationId, expiresAt, token}`, while the page expects an Invitation object. Accept returns a membership, but `acceptInvitation` reads `inv.invitedEmail`, which would break.",
         "'Switch to Invitee' signs in with the demo password `demo-password`."])

    st += card("C5. Connectors Wizard", "/connectors", "frontend/src/app/connectors/page.tsx (+ components/connectors/ConnectorConfigModal.tsx)",
        ["A catalogue of connector types (for example GitHub, Azure Monitor, cloud logs, generic webhook) with a count badge in the sidebar.",
         "A configuration modal per connector with credentials, scopes and options.",
         "Status per connector: configured, active, testing, error, last sync."],
        ["Pick a connector card and click Configure.",
         "Fill the modal fields (the form depends on the connector type) and Save.",
         "Click **Test** to verify credentials and reachability.",
         "Click **Activate**; the backend starts ingesting (webhook endpoint or poller).",
         "Click **Sync** to pull now; watch status and last-sync time update."],
        ["Calls `/connectors` (list/create/update) plus actions `activate`, `test`, `sync`.",
         "`ConnectorConfigModal` renders typed fields and validates before sending; secrets are write-only fields.",
         "Active connector count feeds the Command Center card."],
        ["Connector catalogue and workers live in shield-ingest (for example `azure-monitor-poller.service.ts`).",
         "Secrets are stored encrypted; the UI never receives them back.",
         "Webhook connectors get a signed endpoint `/ingestion/webhooks/:connectorId` (see Ingestion)."],
        ["Data is the fuel of detection; a wizard reduces misconfiguration, the leading cause of silent blind spots.",
         "Test-before-activate catches bad credentials before analysts rely on a feed.",
         "Write-only secrets mean screen sharing or support tickets cannot leak keys."])

    st += card("C6. Ingestion Console", "/ingestion", "frontend/src/app/ingestion/page.tsx",
        ["Live view of incoming events, per-connector throughput and health, and a way to send test telemetry.",
         "A badge in the sidebar with the number of active streams."],
        ["Open the console; the page loads `/events` and connector health.",
         "Optionally subscribe to the live stream (server-sent events).",
         "Click 'Simulate Telemetry' (from Command Center) or send a test webhook.",
         "Watch normalized events appear with source, severity and timestamp."],
        ["`use-event-stream.ts` opens an SSE connection through the proxy and appends events.",
         "Webhook tests go to `/ingestion/webhooks/:connectorId`; the **proxy adds the HMAC signature** server-side.",
         "Stale and Degraded states appear if the stream stops."],
        ["`WebhookSignatureGuard` requires the raw body, verifies HMAC-SHA256 over `timestamp.nonce.body`, enforces a +/-300 second window and `timingSafeEqual`.",
         "A replay nonce is stored as a SHA-256 hash; a repeat returns 401 'already processed'. GitHub uses `X-Hub-Signature-256` plus `X-GitHub-Delivery` (24 h replay key).",
         "Per-connector secrets come from `WEBHOOK_HMAC_SECRETS`; the global `WEBHOOK_HMAC_SECRET` works only outside production. The tenant is bound from the connector.",
         "Events are then normalized (protected baseline) into a common schema and published to Kafka."],
        ["Signatures + timestamp + nonce stop forged, delayed and replayed events, which would otherwise poison detections.",
         "Server-side signing keeps the shared secret out of browsers.",
         "A live console lets operators see a broken feed within seconds, not days."])

    st += card("C7. Detection & Alerts", "/alerts and /detections", "frontend/src/app/alerts/page.tsx, frontend/src/app/detections/page.tsx",
        ["Alerts list with severity (P1 critical, etc.), source, time and status; filters.",
         "Detections page: rule definitions, recent matches and version history with a Publish action.",
         "Button 'Create Case' on an alert."],
        ["Open Alerts; pick an alert to see context.",
         "Click **Create Case** (`POST /alerts/:id/create-case`); you land in the Case Workspace.",
         "On Detections: browse `/detections/definitions`, `/detections/matches`, and publish a new version via `/detections/versions/:id/publish`.",
         "Published versions apply to new events."],
        ["List components with filters and badges; actions disable while pending; errors use shared states.",
         "Publish confirmation prevents accidental rule changes."],
        ["Detection rules run on normalized events; a match creates an alert (threshold rules can generate a P1).",
         "Alert-to-case creation copies evidence references and writes an audit record.",
         "Rule versions are immutable once published, so each alert points to the exact rule that fired."],
        ["Separating definitions, matches and alerts lets teams tune noisy rules without losing history.",
         "Versioned publish = you can always explain why an alert fired months later (audit requirement).",
         "One-click case creation shortens time-to-triage."])

    st += card("C8. Case Workspace", "/cases (and /cases/incidents/command)", "frontend/src/app/cases/*",
        ["Case list and detail: timeline, linked alerts, evidence, assignee, status and an AI summary panel.",
         "Incident Command (W19) view for major incidents, and SOC Shift Handover (W20)."],
        ["Open a case from the sidebar or from an alert.",
         "Review the timeline and evidence.",
         "Click **AI summary** (`/cases/:id/ai/summary`) to get a grounded summary.",
         "Propose or request a response action (goes through approval; see Playbooks and SOAR).",
         "Update status, add notes; hand over at shift end."],
        ["Reads `/cases` and `/cases/:id`; AI summary call is explicit (user triggered).",
         "Shows grounding citations so a human can check the AI claim."],
        ["Cases live in shield-core (transactional with audit). The summary request goes to shield-ai, where `GroundingGateGuard` requires the answer to be backed by case evidence.",
         "Model Armor screens inputs and outputs for prompt injection and data leakage."],
        ["Cases are the unit of accountability: who looked, what they decided, and why.",
         "AI summary is optional and cited because analysts, not the model, own the decision.",
         "Handover pages exist because shift changes are where incidents are dropped."])

    st += card("C9. AI Security Copilot", "/copilot", "frontend/src/app/copilot/page.tsx",
        ["A chat-style assistant with six modes (shown as '6 MODES' in the sidebar).",
         "Answers include citations and a decision card (approve / reject) for proposed actions."],
        ["Choose a mode and type a question about alerts, cases or posture.",
         "The page posts to `/copilot/query`; the answer streams or arrives with citations.",
         "If the AI proposes an action, you see an envelope with Approve / Reject.",
         "Your choice calls `/ai/decisions/:envelopeId/:decision`."],
        ["Chat state is local; each message keeps its citations and guard verdict.",
         "Degraded state is shown when the AI kill switch is active."],
        ["shield-ai: Model Armor safety gateway on input/output, `GroundingGateGuard` to block ungrounded claims, tenant-scoped retrieval only.",
         "The AI **cannot directly trigger live SOAR**; it can only create proposals that humans must approve."],
        ["LLMs can hallucinate and be manipulated. Grounding + safety gateway + human approval give useful speed without handing the model the keys.",
         "Modes narrow the task, which reduces risky free-form output."])

    st += card("C10. Threat Hunting Copilot", "/hunting", "frontend/src/app/hunting/page.tsx",
        ["A ReAct-style investigation view: the assistant reasons in steps (thought, action, observation) and builds an attack path for a case."],
        ["Select a case.",
         "Start the hunt; steps appear one by one.",
         "Inspect the attack path graph (`/ai/cases/:id/attack-path`).",
         "Save findings to the case."],
        ["Renders each reasoning step so the analyst can follow and challenge it.",
         "Read-only queries; no actions are executed here."],
        ["shield-ai builds the path using only tenant data and returns structured steps with sources.",
         "Same guard chain as Copilot."],
        ["Showing the reasoning (not just the answer) builds trust and lets junior analysts learn.",
         "Read-only by design: hunting should never change the customer environment."])

    st += card("C11. AI Safety & Governance", "/ai-governance", "frontend/src/app/ai-governance/page.tsx",
        ["List of AI incidents (blocked outputs, injection attempts), drift indicators, and the kill-switch / fallback controls.",
         "Sidebar badge shows number of active incidents."],
        ["Open the page; incidents load from `/ai/incidents` and drift from `/ai/drift`.",
         "Open an incident to see what was blocked and why.",
         "An authorised person triggers a fallback with `/ai/incidents/:id/fallback`.",
         "The Command Center then shows the Degraded banner and the system uses deterministic rules."],
        ["Severity-sorted incident list, drift charts, explicit confirmation for fallback.",
         "Uses the Degraded state to reflect the current safety posture."],
        ["`SafeDegradationService` switches from model output to a strict rule engine when the kill switch is active.",
         "Events such as `ai.output_blocked` also feed notifications."],
        ["AI governance is a legal and trust requirement; a visible kill switch shows customers they stay in control.",
         "Falling back to deterministic rules keeps protection running when the model is untrusted."])

    st += card("C12. Playbook Runs and Response Proposals", "/playbooks, /response-proposals", "frontend/src/app/playbooks/page.tsx, frontend/src/app/response-proposals/page.tsx",
        ["Playbook runs (W18): list of automated response sequences with step status and freeze status.",
         "Response proposals (W34): AI or analyst suggested actions with simulate, approve or reject buttons."],
        ["Open Playbooks; runs load from `/playbooks/runs`; freeze state from `/response/freeze-status`.",
         "On Proposals pick one; click **Simulate** (`/response-proposals/:id/simulate`) to see predicted impact.",
         "Approve or reject (`/response-proposals/:id/:action`).",
         "Approved actions move to the action service for execution."],
        ["Shows simulation output before enabling Approve, nudging safe behaviour.",
         "Case links come from `/cases`."],
        ["shield-core stores proposals and approvals; shield-action executes. Approver cannot be the proposer for sensitive classes.",
         "Everything is audited."],
        ["Simulation first avoids 'blast radius' mistakes such as disabling a production account.",
         "Proposal -> approval -> execution separates thinking from doing."])

    st += card("C13. SOAR Actions and Freeze", "/actions", "frontend/src/app/actions/page.tsx",
        ["Action catalogue graded R0-R4 by risk, freeze / unfreeze controls and a rollback button.",
         "Dual-custody approvals for high-risk actions."],
        ["Choose an action; high-risk (R2-R4) shows that two signers are required.",
         "Initiator signs with a passkey (FIDO2) and the request becomes PENDING_SECOND_SIGNATURE.",
         "A second authorised person approves within the TTL (default 15 minutes).",
         "Status becomes QUORUM_REACHED and the action runs; otherwise REJECTED or EXPIRED.",
         "Rollback uses a single-use token and a compensating plan (`/actions/rollback`)."],
        ["Calls `/response/freeze`, `/response/unfreeze`, `/actions/rollback`.",
         "Uses WebAuthn for signing; badges R0-R4 explain risk before clicking."],
        ["`DualCustodyQuorumService` (ADR-04) enforces the quorum, signature and expiry.",
         "Executors integrate Cloud Armor, GCP IAM and Google Workspace.",
         "Rollback tokens are single use so a stolen token cannot be replayed."],
        ["Two-person control is the standard for destructive operations (no single insider or compromised account can act alone).",
         "Risk tiers keep low-risk work fast and high-risk work safe."],
        ["Quorum records are held in an **in-memory Map** (lost on restart) and the signing key has a **hard-coded default fallback**; both must be replaced before production."])

    st += card("C14. Simulation Replay and IR Retainer", "/red-team, /ir-retainer", "frontend/src/app/red-team/page.tsx, frontend/src/app/ir-retainer/page.tsx",
        ["Simulation Replay: replay recorded attack scenarios to test detections and playbooks safely.",
         "IR Retainer: the customer's incident response retainer, hours, SLA and contact (24x7)."],
        ["Pick a scenario and run the replay; observe alerts, cases and proposals appear.",
         "Open IR Retainer to see the contract (`/ir/retainers`), SLA and request escalation."],
        ["Replay uses synthetic events; results are labelled so they never mix with real incidents.",
         "Retainer is a read/request view."],
        ["Replay feeds the normal pipeline using a simulation flag; retainer data comes from shield-core."],
        ["Teams must test response before a real incident; simulations are the safe rehearsal.",
         "A retainer view tells customers exactly what help they are entitled to."])

    st += card("C15. Commercial: Services, Pricing, Sector Packs", "/services, /pricing, /sector-packs", "frontend/src/app/services, pricing, sector-packs",
        ["Services Catalogue: public capabilities with a count badge.",
         "Plans & Band Pricing: tiers and bands.",
         "Sector Solution Packs: pre-built bundles for industries such as finance."],
        ["Browse services (`/commercial/capabilities/public-services`).",
         "Compare plans (`/commercial/plans`).",
         "Pick a sector pack to see which connectors, detections, controls and reports it enables."],
        ["Read-only pages with cards and comparison tables."],
        ["shield-core commercial module serves plans and capabilities; entitlements later gate features per tenant."],
        ["The product and the commercial model must agree; plans drive entitlements so customers only see what they bought.",
         "Sector packs speed time-to-value for regulated industries."])

    st += card("C16. Policy Lifecycle", "/policies", "frontend/src/app/policies/page.tsx",
        ["Policy list with states (draft, review, approved, active, retired) and the badge '4-EYES'."],
        ["Author a draft policy.",
         "Submit for review.",
         "A **different** person approves (four-eyes).",
         "Activate; the platform enforces the new version and records it."],
        ["State machine UI: only valid next buttons are enabled.",
         "Shows version and approver."],
        ["Policy versions are immutable; approval requires a second principal; changes are audited and anchored in the ledger."],
        ["Policies (Cedar-style authorization and security policy) change who can do what; they need the same control as code review.",
         "Immutable versions allow auditors to prove which policy applied at any time."])

    st += card("C17. Merkle Evidence Ledger", "/ledger", "frontend/src/app/ledger/page.tsx",
        ["Epoch list, receipts, leaf proofs and a 'verify proof' tool; badge ZS-MERKLE."],
        ["Choose an epoch; the page loads `/anchor/receipts/:epoch`.",
         "Request a proof for a leaf (`/anchor/proofs/:epoch/:leaf`).",
         "Verify (`/anchor/proofs/verify`).",
         "An operator may seal a batch (`/anchor/batches/seal`)."],
        ["Displays hashes in monospace with copy; shows verification result clearly (valid / tampered)."],
        ["`MerkleTreeService` (shield-anchor): profile `ZS-MERKLE-V1`; leaf = SHA256(0x00 || bytes); branch = SHA256(0x01 || left || right); odd node is duplicated; proof = list of {siblingHash, position}; `verifyInclusion` recomputes the root.",
         "Domain-separation bytes (0x00/0x01) prevent second-preimage attacks."],
        ["A ledger turns 'trust us' into 'verify it yourself': any change to a record changes the root.",
         "Batching into epochs keeps cost low while still giving per-record proofs."])

    st += card("C18. Audit & Verifier, Auditor Workspace, Verify Certificate", "/audit, /auditor, /verify-certificate", "frontend/src/app/audit, auditor, verify-certificate",
        ["Audit & Verifier: audit packages (badge SEALED), generate and download.",
         "Auditor workspace: read-only evidence chain for an external auditor.",
         "Verify Certificate: paste or upload a certificate to check it."],
        ["Generate an audit package (`/audit-packages`); it is frozen and sealed.",
         "Auditor opens `/auditor/workspace` and follows `/auditor/evidence-chain/...`.",
         "Run the offline `verifier-cli` on the downloaded package: exit code 0 = valid, non-zero = tampering.",
         "Verify Certificate confirms a sealed report is genuine."],
        ["Auditor pages are read-only and minimal; no action buttons."],
        ["Freezing a package emits `audit_package.frozen`, which triggers notification emails (see Part D).",
         "`verifier-cli` duplicates the Merkle logic so it works without our servers."],
        ["Auditors cannot be asked to trust the vendor; an offline verifier and read-only workspace give independent assurance."])

    st += card("C19. Controls, Compliance and Evidence Operations", "/controls, /compliance, /evidence-operations", "frontend/src/app/controls, compliance, evidence-operations",
        ["Controls list with pass/fail and frameworks such as SOC2 and ISO27001.",
         "Evidence Operations (W24): list of evidence items with verify action."],
        ["Open Controls; results from `/control-evaluations`.",
         "Click Evaluate on a test (`/control-tests/:id/evaluate`).",
         "In Evidence Operations choose an item and **Verify** (`/evidence/:id/verify`).",
         "Compliance posture on the Command Center updates."],
        ["Posture percentage is computed from test results; failed controls link to remediation."],
        ["Control evaluations read evidence collected by connectors and the ledger; verification checks hashes."],
        ["Compliance must be continuous and evidence-based rather than a yearly spreadsheet.",
         "Linking controls to verifiable evidence removes disputes during audits."])

    st += card("C20. Risk & Exceptions", "/risk, /exceptions", "frontend/src/app/risk, exceptions",
        ["Risk register (W27/28) and exception requests with expiry."],
        ["Record a risk, score it.",
         "Request an exception to a control with a reason and an end date.",
         "Approver reviews; the exception auto-expires."],
        ["Forms with required reason and expiry; expiring items highlighted."],
        ["`exception.expired` is a Kafka event that triggers notification emails."],
        ["Exceptions are normal but dangerous when forgotten; mandatory expiry prevents permanent risk acceptance."])

    st += card("C21. Notification Center", "/notifications", "frontend/src/app/notifications/page.tsx",
        ["A list of notifications with a status badge per delivery (for example DELIVERED, FAILED, DEAD_LETTERED).",
         "A warning banner when any delivery FAILED or DEAD_LETTERED.",
         "An Acknowledge button, and a link to the Email Template Studio."],
        ["Open the page; it calls `GET /api/v1/notifications` (filtered by your tenant and your principal id).",
         "Read items; failed ones are highlighted.",
         "Click **Acknowledge** (`POST /notifications/:id/acknowledge`); types SEEN / ACKNOWLEDGED / ACCEPTED / DECLINED exist in the backend.",
         "Open Template Studio to see how emails look."],
        ["If the backend errors or returns an empty list, the page shows **4 hard-coded SAMPLE_NOTIFICATIONS** and acknowledge only changes local state.",
         "Status badges map delivery states to colours."],
        ["`NotificationController` lists deliveries for `recipient_principal_id = user.id`.",
         "`NotificationDispatchService` chooses policy -> preference -> idempotent delivery row -> template -> channel (InApp, Email, Slack, Teams). Mandatory policies cannot be muted by preferences.",
         "Duplicate sends are suppressed with a unique key (Prisma P2002)."],
        ["Security alerts are useless if they are ignored; delivery status and acknowledgement make 'who was told, and did they see it?' provable.",
         "Preferences exist so users control noise, but mandatory categories (legal, security) cannot be turned off."],
        ["Sample fallback can make an empty real list look populated; it should be clearly labelled demo or removed.",
         "Kafka consumers use literal recipient ids such as 'tenant-admin', so real users may never see event-driven notifications (Part D)."])

    st += card("C22. Email Template Studio", "/admin/email-templates", "frontend/src/app/admin/email-templates/page.tsx",
        ["Left: **16 domain chips** + search + list of up to **226 templates** (ids like ZS-EML-IAM-005).",
         "Centre: preview with a **Desktop (600 px)** / **Mobile (380 px)** toggle and **Dark / Light** toggle, plus tabs HTML preview, Plain Text, Variables.",
         "Variables form: recipientFirstName, organizationName, referenceId, statusLabel, occurredAtLocal, timezone, actionUrl.",
         "Audit hash display, a recipient field with **Send Test**, a **Test Secret Gate** button and **Reset Variables**."],
        ["Pick a domain, then a template.",
         "Edit variables; the preview re-renders via `POST /notifications/templates/:id/preview`.",
         "Switch Desktop/Mobile and Dark/Light to check rendering; read the Plain Text tab (accessibility, spam filters).",
         "Check the audit hash (SHA-256 of the render).",
         "Enter a test recipient and click Send Test (`/templates/:id/send-test`).",
         "Click Test Secret Gate to prove an email containing a bearer token is blocked."],
        ["1,080-line client page. If the template list from the server has fewer than 226 entries it **falls back to a locally generated list**.",
         "`generateClientPreview` renders locally if the server preview fails and runs its own regex secret check (bearer eyJ..., AKIA..., PRIVATE KEY, sk-...).",
         "The iframe preview uses sandboxed HTML so template code cannot touch the app."],
        ["Backend renders with `ProductionEmailTemplateEngine.render()`: fail-closed validation, escaped HTML, secret gate, render hash.",
         "Send-test renders, sends through the **mock** email channel, and writes a delivery audit row."],
        ["Emails are a legal and security surface (password resets, breach notices). A studio lets product, legal and security review every message before it ships.",
         "Dark/light and mobile previews catch broken layouts, which are common in email clients.",
         "The secret gate demo proves that credentials cannot leak by email, a typical audit question."],
        ["**Send-test failure is swallowed:** the UI still says 'Dispatched successfully' with a mock delivery id; misleading.",
         "Backend send-test uses the mock channel, so no real email leaves the system."])

    st += card("C23. Platform Admin & Governance pages", "/admin, /operations and governance routes", "frontend/src/app/admin, operations",
        ["**Platform Service Health (section 31/32):** readiness for each service.",
         "**G1 Launch Gate Protocol (0/8 GATE):** eight launch conditions with signed roster.",
         "**JIT Elevation Quorum (section 13, FOUR-EYES):** time-boxed privilege elevation.",
         "**GTM Pre-Flight Checklist (12/12 PASS):** go-to-market checks.",
         "**Operations & Entitlements (OPERATOR):** operator tools and feature entitlements."],
        ["Health: page loads `/observability/readiness` and shows green/red per service.",
         "G1 gate: each approver signs (`/governance/g1-roster/sign`) until 8/8.",
         "JIT: a user requests elevation (`/jit/elevate`), a second approver approves (`/jit/sessions/:id/approve`) and the requester completes step-up (`/jit/sessions/:id/step-up`).",
         "Checklist: tick items to 12/12.",
         "Operations: view and change entitlements."],
        ["Strongly stateful pages: buttons appear only when the next step is valid.",
         "Badge counters are derived from the same state shown on the page."],
        ["shield-core governance and JIT modules enforce four-eyes and expiry and write audit events; observability reports readiness."],
        ["A security platform must be operated securely too: no standing admin rights (JIT), no single-person launch decision (G1), and visible service health.",
         "The four-eyes rule is the same pattern used for policies and SOAR, so teams learn one mental model."])

    st += card("C24. MSSP Fleet & 2-Party JIT", "/partner/fleet", "frontend/src/app/partner/fleet/page.tsx",
        ["A fleet of customer tenants managed by a partner (MSSP) with a 2-PARTY badge.",
         "Request access to a customer and see approval state."],
        ["The MSSP analyst requests JIT access (`/partners/fleet/jit/request`).",
         "The **customer** approves (`/partners/fleet/jit/approve-customer`).",
         "Access is time-boxed and recorded on both sides."],
        ["Shows pending, approved, expired lines with countdowns."],
        ["The partner module requires both the partner approver and the customer to approve; tokens expire; actions are attributed to the partner principal."],
        ["MSSPs need access to many customers but customers must stay in control; two-party approval satisfies both."])

    st += card("C25. G2 Experience Contracts", "/cases/incidents/command, shift-handover, /assets, /findings, risk executive, reports, export, /developer, /trust", "frontend/src/app/assets, findings, developer, trust, cases ...",
        ["**Incident Command W19**, **SOC Shift Handover W20**, **Asset Inventory W29**, **Findings W30**, **Executive Risk W31**, **Audit Reports W32**, **Admin Export W36**, **Developer W37**, **Trust W38**."],
        ["Each page is a role-focused view: executives get risk summaries, engineers get API keys and docs, customers see the trust centre.",
         "Reports can be generated and exported as sealed packages."],
        ["'Experience contracts' means each page promises a defined data shape to the backend-for-frontend (BFF) and displays contract health (HEALTHY_SYNCED) on the Command Center."],
        ["Served by shield-core BFF endpoints that aggregate cases, assets, findings and risk."],
        ["Different audiences need different views; defining contracts per view lets frontend and backend evolve independently with visible drift detection."])

    # ------------------------------------------------------------ PART D
    st += section("D", "The email system in full",
                  "Email is where the platform talks to humans outside the browser: activation links, password resets, security notices, "
                  "audit freezes. Because email can leak data or be abused, the platform treats it as a controlled, audited subsystem.")
    st.append(P("D1. Layers (from template to inbox)", ST_H2))
    st.append(table(["Layer", "File / class", "What it does", "Why"], [
        ["Template engine", "`ProductionEmailTemplateEngine`", "226 templates, render, validate, secret gate, render hash", "One approved source of wording"],
        ["Enum registry", "`template-enums.registry.ts`", "Allowed status/action/role labels", "Stops raw internal codes and injection"],
        ["Transactional service", "`TransactionalEmailService`", "Tenant isolation gate, https CTA gate, builds receipt with digest", "Cross-tenant leaks are P0"],
        ["Dispatch service", "`NotificationDispatchService`", "Policy -> preference -> idempotent row -> template -> channel", "Controls who is told and avoids duplicates"],
        ["Channels", "InApp, Email, Slack, Teams", "Deliver the rendered message", "Different people read different places"],
        ["Email channel", "`EmailChannelService`", "**MOCK**: logs a warning and returns delivered:true", "Placeholder until a real provider is wired"],
        ["Identity mailer", "`identity-adapter/mail.service.ts` `MailService`", "`sendOtp`, `sendOwnerInvitation` using the engine; nodemailer Gmail if EMAIL_USER and EMAIL_APP_PASSWORD set", "Auth emails need a dedicated path"],
        ["Event consumer", "`DomainEventNotificationConsumer`", "Kafka events -> notifications", "Automatic notices when things happen"],
    ], [26, 46, 60, 42]))
    st.append(P("D2. Template catalogue (226 templates in 16 domains)", ST_H2))
    st.append(P("Ids follow `ZS-EML-<DOMAIN>-NNN` and each has a gate class: P0, P1, P2 or C (critical / compliance)."))
    st.append(table(["Domain", "Count", "Typical content"], [
        ["IAM", "23", "Account, passkey, password recovery (IAM-005 reset), sign-in alerts"],
        ["ORG", "13", "Organisation, owner activation (ORG-002), membership"],
        ["CONN", "15", "Connector connected, auth failed, sync issues"],
        ["SEC", "19", "Security alerts and detections"],
        ["ACT", "13", "Response action requested, approved, executed"],
        ["ASSURE", "21", "Assurance and compliance notices"],
        ["EVID", "14", "Evidence, audit packages frozen"],
        ["AI", "12", "AI output blocked, governance"],
        ["DEV", "11", "Developer and API key notices"],
        ["BILL", "18", "Invoices, quota thresholds"],
        ["SUP", "10", "Support"],
        ["PRIV", "11", "Privacy requests"],
        ["OFF", "8", "Offboarding"],
        ["STAT", "10", "Status and maintenance"],
        ["OPS", "20", "Internal operations (internal footer)"],
        ["GOV", "8", "Governance"],
        ["**Total**", "**226**", ""],
    ], [30, 20, 124]))
    st.append(P("D3. The gates every email passes (fail closed)", ST_H2))
    st.append(table(["Gate", "Check", "Result if it fails"], [
        ["Required fields", "templateId, recipientFirstName, referenceId present", "BadRequest; nothing rendered"],
        ["Known template", "templateId exists in the catalogue", "BadRequest 'unknown template'"],
        ["Allow-listed enums", "status, action type, role labels come from the registry", "Rejected"],
        ["Secret gate", "Body must not contain `bearer `, `private_key`, `BEGIN PRIVATE KEY`, `password=`, `api_key`, `client_secret`", "Rejected before sending"],
        ["Tenant isolation (Gate 3)", "tenantId present; recipient contains '@'; resourceTenantId == tenantId", "P0 log + BadRequest"],
        ["CTA URL", "Must be https (http only for localhost)", "Rejected"],
        ["HTML safety", "All variables HTML-escaped", "Prevents injection"],
        ["Render hash", "SHA-256 of {templateId, version v2.0, policyVersion iam-policy-1.0.0, plainTextBody, ctaUrl}", "Stored as audit proof of exact content"],
    ], [34, 90, 50]))
    st.append(P("Internal templates (ZS-EML-OPS-*) use an internal footer; the call-to-action URL has a fallback chain when no actionUrl is supplied.", ST_SMALL))
    st.append(box("WHY", [
        "**Fail closed:** a wrong email to a wrong person is a data breach; refusing is safer than guessing.",
        "**Secret gate:** the most common email leak is pasting a token into text; the engine blocks the patterns automatically.",
        "**Render hash:** proves later exactly what was sent, which supports disputes and audits.",
        "**Plain text body:** required for accessibility and for mail filters that distrust HTML-only mail.",
    ], WHY_BG, BLUE))

    st.append(P("D4. Every email path and its real status", ST_H2))
    st.append(table(["Email", "Triggered by", "Code path", "Status"], [
        ["Owner activation (ORG-002)", "Onboarding", "`OnboardingService` -> `MailService.sendOwnerInvitation` -> engine", "Rendered OK; **returns after engine path, real SMTP skipped**; link `/accept-invite` page missing"],
        ["Password recovery OTP (IAM-005)", "Forgot password", "`/auth/password-recovery/request` -> `MailService.sendOtp` -> engine", "OTP embedded in `password_reset_url`; **early return skips nodemailer and console fallback**"],
        ["Tenant member invitation", "Team invite", "`CreateInvitation`", "**No email sent**; token shown in UI"],
        ["Template Studio send-test", "Admin", "`POST templates/:id/send-test` -> EmailChannelService (mock)", "Writes delivery audit; **no real delivery**; UI shows success even on failure"],
        ["Event notifications (audit frozen, exception expired, critical alert, dual custody request, quota, JIT request, incident declared, connector auth failed, AI blocked, maintenance, invoice, privacy request)", "Kafka domain events", "`DomainEventNotificationConsumer` -> dispatch service", "Works end to end except **literal recipient ids** ('tenant-admin', 'soc-lead')"],
        ["Generic transactional dispatch", "Any caller", "`TransactionalEmailService.dispatchTransactionalEmail`", "Returns `DELIVERED` with a SHA-256 digest but **performs no transport**; no other callers yet"],
    ], [38, 28, 56, 52]))
    st.append(P("D5. Password recovery flow (step by step)", ST_H2))
    st += numbered([
        "User enters email on the forgot-password screen; `POST /auth/password-recovery/request` (throttle 3 per minute).",
        "Response is always generic ('if the account exists...'), so attackers cannot test emails.",
        "Only principals with a LocalCredential get an OTP challenge (valid 10 minutes); the mail uses template ZS-EML-IAM-005.",
        "User enters the code at `/verify`; the backend sets a short-lived recovery grant cookie.",
        "User sets a new password at `/reset`: bcrypt hash stored, **all sessions revoked**.",
        "User signs in again with the new password.",
    ])
    st.append(P("D6. How to test email safely today", ST_H2))
    st += numbered([
        "Open /admin/email-templates and pick ZS-EML-IAM-005.",
        "Fill variables and read the HTML and Plain Text tabs; note the audit hash.",
        "Click Test Secret Gate and confirm it is blocked.",
        "Send Test with your address; check backend logs for the mock channel warning (this proves the render and audit path, not real delivery).",
        "To send real mail now, set `EMAIL_USER` and `EMAIL_APP_PASSWORD` (Gmail app password) in backend .env; the `MailService` nodemailer path is only reached if the engine path is bypassed - see Part H fix list.",
    ])
    st.append(box("Remaining email work (the 'email part remaining')", [
        "Wire a real provider (SES, SendGrid, SMTP) behind `EmailChannelService` and make `TransactionalEmailService` actually send.",
        "Fix `MailService.sendOtp` / `sendOwnerInvitation` so a successful render is followed by real delivery, not an early return.",
        "Add the `/accept-invite` frontend page and send tenant member invitation emails.",
        "Resolve real recipient principal ids in `DomainEventNotificationConsumer`.",
        "Make Template Studio show the real send-test result (failure must not read as success).",
        "Remove or clearly label SAMPLE_NOTIFICATIONS in the Notification Center.",
    ], GAP_BG, GAP_FG))

    # ------------------------------------------------------------ PART E
    st += section("E", "Backend services step by step",
                  "Each service is a NestJS application. All use `ValidationPipe({ whitelist: true, transform: true })`, which strips unknown fields "
                  "and converts types. shield-core also uses cookie-parser and CORS configuration.")
    st.append(P("E1. Authentication and session lifecycle (shield-core)", ST_H2))
    st += numbered([
        "Request hits `AuthController` with a throttle of 10 per minute.",
        "`AuthService.login` finds the principal, rejects inactive users, loads the LocalCredential and compares with bcrypt.",
        "Failures increment a counter; reaching `LOCKOUT_THRESHOLD` locks the account.",
        "If email is not verified: 403 'Email not verified'.",
        "`sessionContext.resolveBinding` verifies tenant membership.",
        "Access JWT and refresh token are set as cookies; identity events are recorded.",
        "Subsequent requests: guards decode the JWT, attach the principal and tenant, then RBAC permission guards run.",
    ])
    st.append(box("WHY", [
        "bcrypt is a slow, salted hash that resists offline cracking.",
        "Lockout and throttling limit brute force; identical errors prevent account enumeration.",
        "Refresh tokens allow short-lived access tokens, shrinking the damage of a stolen token.",
    ], WHY_BG, BLUE))
    st.append(P("E2. Tenancy, RBAC and invitations", ST_H2))
    st += bullets([
        "Every table carries a tenant id; services filter on it and reject cross-tenant ids.",
        "Roles map to permissions such as `tenant:member:invite`; platform roles are separate from tenant roles and cannot be invited.",
        "Invitation: create (token 32 bytes, SHA-256 stored) -> accept (authenticated principal, email match, PENDING, not expired) -> TenantMembership with source INVITATION.",
    ])
    st.append(P("E3. Ingestion pipeline (shield-ingest)", ST_H2))
    st += numbered([
        "Webhook request arrives (through the proxy which signs it).",
        "`WebhookSignatureGuard` checks raw body, signature, timestamp window and replay nonce.",
        "The connector id binds the request to a tenant.",
        "Normalization converts the payload into the common event schema (protected baseline; not to be modified lightly).",
        "Event is stored and published to Kafka; detections consume it.",
        "Pollers (for example Azure Monitor) pull data on a schedule and follow the same path.",
    ])
    st.append(P("E4. Detection, alerts and cases", ST_H2))
    st += bullets([
        "Detection definitions are versioned; a match produces an alert with a reference to the exact version.",
        "Alert -> case copies references and writes an audit row in the same transaction.",
        "Domain events (for example `alert.critical`) feed notifications.",
    ])
    st.append(P("E5. AI services (shield-ai)", ST_H2))
    st += bullets([
        "`ModelArmorSafetyGatewayService` screens prompts and outputs.",
        "`GroundingGateGuard` requires answers to cite tenant evidence.",
        "AI can create proposals but cannot directly run live SOAR actions.",
        "`SafeDegradationService` swaps to a deterministic rule engine when the kill switch is on.",
    ])
    st.append(P("E6. SOAR and dual custody (shield-action)", ST_H2))
    st += bullets([
        "Risk classes R0-R4; R2, R3 and R4 need two people.",
        "Initiator must provide a FIDO2 signature; quorum TTL default 15 minutes.",
        "Statuses: PENDING_SECOND_SIGNATURE, QUORUM_REACHED, REJECTED, EXPIRED.",
        "Rollback uses a single-use token and a compensating plan.",
        "Executors: Cloud Armor, GCP IAM, Google Workspace.",
    ])
    st.append(P("E7. Evidence: Merkle ledger, KMS and verifier", ST_H2))
    st += bullets([
        "Audit records are hashed as leaves, combined into a tree (`ZS-MERKLE-V1`), and the root is anchored per epoch.",
        "Proofs let anyone verify one record belongs to a sealed epoch without seeing the others.",
        "Envelope encryption and crypto-shredding protect data at rest and support deletion rights.",
        "`verifier-cli` repeats the verification offline: exit 0 valid, non-zero tamper.",
    ])
    st.append(P("E8. Notification pipeline and Kafka", ST_H2))
    st += numbered([
        "A service publishes a domain event using the outbox pattern (written with its database change).",
        "`DomainEventNotificationConsumer` receives it (inbox dedupe prevents double processing).",
        "`NotificationDispatchService` resolves policy and preferences and creates one delivery row per channel (idempotent).",
        "The template engine renders; the channel delivers (InApp real; Email mock today).",
        "The user acknowledges in the Notification Center; the acknowledgement is audited.",
    ])
    st.append(box("WHY", [
        "Outbox/inbox means no event is lost if Kafka is briefly down and none is processed twice.",
        "Idempotent delivery rows make retries safe.",
    ], WHY_BG, BLUE))

    # ------------------------------------------------------------ PART F
    st += section("F", "End-to-end ERB-01 flow",
                  "ERB-01 is the fixed demonstration story (stages 1-10 in the bottom bar). The table below maps each stage to the UI, the API and the owning service.")
    st.append(table(["Stage", "What happens", "UI page", "API / service"], [
        ["1", "Sign in as analyst", "/login", "POST /auth/login - shield-core"],
        ["2", "Tenant and connector ready", "/connectors", "/connectors - shield-ingest"],
        ["3", "Telemetry arrives (signed webhook)", "/ingestion", "/ingestion/webhooks/:id - shield-ingest"],
        ["4", "Events normalized", "/ingestion", "normalization - shield-ingest"],
        ["5", "Detection rule executes", "/detections", "detections - shield-core / ingest"],
        ["6", "P1 alert generated", "/alerts", "/alerts"],
        ["7", "Case created", "/cases", "/alerts/:id/create-case"],
        ["8", "AI summary and hunting", "/copilot, /hunting", "shield-ai with grounding gate"],
        ["9", "Response proposal, dual approval, action", "/response-proposals, /actions", "shield-action quorum"],
        ["10", "Evidence sealed and verified", "/ledger, /audit", "shield-anchor, verifier-cli"],
    ], [14, 60, 44, 56]))
    st.append(P("Email touchpoints in this story: owner activation (before stage 1), critical alert notice (stage 6), dual-custody approval request (stage 9), audit package frozen (stage 10).", ST_SMALL))

    # ------------------------------------------------------------ PART G
    st += section("G", "Setup and troubleshooting runbook", "Practical steps to run the platform locally and fix the commonest errors.")
    st.append(P("G1. Start everything", ST_H2))
    st += numbered([
        "Start PostgreSQL, Redis and Redpanda (docker compose).",
        "In `backend/`: install, run migrations, start services (core 3001, ingest 3002, ai 3003, action 3004, anchor 3005).",
        "In `frontend/`: `npm run dev` (port 3000).",
        "Open http://localhost:3000.",
    ])
    st.append(P("G2. Fix 'Invalid credentials' on the login screen", ST_H2))
    st.append(P("Your screenshot shows email `analyst@zoikoshield-demo.com`, tenant `00000000-0000-4000-8000-000000000001`, banner 'CEDAR_POLICY_DENY' and 'Invalid credentials'. The banner is a fixed label; the real error is Invalid credentials: that user does not exist in your database or the password is wrong."))
    st += numbered([
        "In `backend/` run: `npm run seed:platform-admin -- <email> <password>`.",
        "Then: `npm run seed:dev-tenant -- --owner you@example.com --password 'YourPassword123!'` (refuses to run when NODE_ENV=production; default password `DevTenantOwner123!`).",
        "The command prints the **tenant id** and owner credentials.",
        "On /login enter that email, that password and that tenant id exactly.",
        "Preset buttons (sarah.chen@acme.com etc., password `Shield@SecOps2026!`) work only if those users are seeded.",
    ])
    st.append(P("G3. Common errors", ST_H2))
    st.append(table(["Symptom", "Cause", "Fix"], [
        ["Invalid credentials", "User or tenant not seeded, wrong password", "Run seed commands; use printed tenant id"],
        ["403 Email not verified", "Account not verified", "Verify or seed with verified flag"],
        ["Account locked", "Too many failures (LOCKOUT_THRESHOLD)", "Wait or reset in the database"],
        ["502 Bad Gateway", "A backend service is down or slow (15 s timeout)", "Start the service; check SHIELD_*_URL"],
        ["Empty lists, sample data", "Backend error or empty and page shows samples", "Check network tab and backend logs"],
        ["Webhook 401", "Bad signature, stale timestamp, replayed nonce", "Use proxy signing; fresh nonce; clock within 300 s"],
        ["400 on invite or onboarding", "Payload does not match DTO", "See Part H contract table"],
    ], [42, 70, 62]))
    st.append(P("G4. Key environment variables", ST_H2))
    st.append(table(["Variable", "Purpose"], [
        ["SHIELD_CORE_URL / INGEST / AI / ACTION / ANCHOR", "Where the proxy forwards"],
        ["BACKEND_PROXY_TIMEOUT_MS", "Proxy timeout (default 15000)"],
        ["WEBHOOK_HMAC_SECRET / WEBHOOK_HMAC_SECRETS", "Webhook signing (global dev / per connector)"],
        ["NEXT_PUBLIC_DEMO_FALLBACK", "Opt-in demo data when 'true'"],
        ["APP_BASE_URL", "Base for email links (default http://localhost:3000)"],
        ["EMAIL_USER / EMAIL_APP_PASSWORD", "Gmail transport for MailService"],
        ["LOCKOUT_THRESHOLD", "Failed logins before lockout"],
    ], [80, 94]))

    # ------------------------------------------------------------ PART H
    st += section("H", "Verified findings and remaining work",
                  "These are real differences between what the UI and backend expect, found by reading the code. None were silently changed in this task; they are listed so they can be fixed deliberately.")
    st.append(P("H1. Frontend / backend contract table", ST_H2))
    st.append(table(["Area", "Frontend sends / expects", "Backend expects / returns", "Status"], [
        ["Login", "email, password, x-tenant-id", "same", "OK"],
        ["Passkeys", "options and verify endpoints", "same", "OK"],
        ["Notifications list/ack", "GET /notifications, POST acknowledge", "same", "OK"],
        ["Onboarding", "organizationName, slug, legalEntityName, environmentName, homeRegion", "orderId, tenantName, tenantSlug, homeRegion, legalEntity{}, ownerEmail, accessDisclosureVersion", "**Mismatch**"],
        ["Invite member", "invitedEmail, assignedRole", "invitedEmail, roleId", "**Mismatch (400)**"],
        ["Invite response", "Invitation object", "{invitationId, expiresAt, token}", "**Mismatch**"],
        ["Accept invitation", "reads inv.invitedEmail", "returns TenantMembership", "**Mismatch**"],
        ["Owner activation page", "/accept-invite expected by email link", "endpoints /auth/owner-invitations/:token(/start)", "**Page missing**"],
    ], [28, 52, 62, 32]))
    st.append(P("H2. Email gaps", ST_H2))
    st += bullets([
        "Email transport is a mock; `TransactionalEmailService` claims DELIVERED without sending.",
        "`MailService` OTP and owner invitation return early after the engine path (real send and console fallback skipped).",
        "Template Studio send-test failure displays as success; the template list needs 226 entries from the server or uses a local list.",
        "Kafka notification consumer uses literal recipient ids.",
        "Tenant member invitations send no email.",
    ])
    st.append(P("H3. Security and hardening gaps", ST_H2))
    st += bullets([
        "Dual-custody quorums are in an in-memory Map; need durable storage.",
        "Quorum secret key has a hard-coded default fallback; require a configured key.",
        "Static TrustBar values (5/5 OK, epoch, PQC seal) should be wired to real data.",
        "Login shows a fixed 'CEDAR_POLICY_DENY' label for any 401/403.",
        "Notification Center sample data should be labelled or removed.",
    ])
    st.append(P("H4. Documentation vs code", ST_H2))
    st.append(table(["Topic", "Older document says", "Code says"], [
        ["Password hashing", "Argon2id", "bcrypt"],
        ["Ports", "3000-3004", "Also shield-anchor 3005"],
        ["Demo fallback", "Always 100% fallback", "Only when NEXT_PUBLIC_DEMO_FALLBACK=true"],
        ["Proxy on error", "Returns demo data", "Returns real 502 / error"],
    ], [40, 64, 70]))
    st.append(P("H5. Recommended fix order", ST_H2))
    st += numbered([
        "Align invite payload (`roleId`) and onboarding payload with the DTOs; surface errors in the UI.",
        "Add the `/accept-invite` page.",
        "Wire real email delivery and fix the early-return in `MailService`; make send-test truthful.",
        "Resolve real recipient ids in the notification consumer.",
        "Persist dual-custody quorums and remove the default secret.",
        "Replace static TrustBar values and login policy label with real data.",
    ])
    st.append(Spacer(1, 4 * mm))
    st.append(P("End of guide. Re-run `python backend/scripts/generate-detailed-platform-guide-pdf.py` after code changes to refresh it.", ST_SMALL))
    return st

# ================================================================= BUILD
def main():
    os.makedirs(os.path.dirname(OUT_DOCS), exist_ok=True)
    os.makedirs(os.path.dirname(OUT_EVID), exist_ok=True)
    doc = BaseDocTemplate(
        OUT_DOCS, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title="ZoikoShield Complete Frontend, Backend & Email Guide v3",
        author="ZoikoShield Engineering",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=lambda c, d: cover(c, d) if d.page == 1 else None)])
    doc.build(build_story(), canvasmaker=NumberedCanvas)
    shutil.copyfile(OUT_DOCS, OUT_EVID)
    print("Wrote", OUT_DOCS)
    print("Copied", OUT_EVID)

if __name__ == "__main__":
    main()
