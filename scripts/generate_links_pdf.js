const fs = require("fs");
const path = require("path");

const linksData = [
  {
    phase: "Phase 1: Public Entry & Pre-Authentication",
    steps: [
      { step: 1, title: "Main Application Entry Point", url: "https://app.zoikoshield.com/", access: "Public" },
      { step: 2, title: "Commercial Plans & Pricing Ladder", url: "https://app.zoikoshield.com/pricing", access: "Public" },
      { step: 3, title: "Commercial Services & Capabilities", url: "https://app.zoikoshield.com/services", access: "Public" },
      { step: 4, title: "Trust Center & Statutory Compliance", url: "https://app.zoikoshield.com/trust", access: "Public" },
      { step: 5, title: "Certificate & Signature Verification", url: "https://app.zoikoshield.com/verify-certificate", access: "Public" },
      { step: 6, title: "Help & Support Center", url: "https://app.zoikoshield.com/help", access: "Public" },
      { step: 7, title: "Public Security Assistant", url: "https://app.zoikoshield.com/assistant", access: "Public" },
    ],
  },
  {
    phase: "Phase 2: Registration, Invitation & Onboarding",
    steps: [
      { step: 8, title: "User Registration & Workspace Creation", url: "https://app.zoikoshield.com/register", access: "Public" },
      { step: 9, title: "Tenant Invitation Redemption", url: "https://app.zoikoshield.com/accept-invite", access: "Public" },
      { step: 10, title: "New Tenant Onboarding Setup Wizard", url: "https://app.zoikoshield.com/onboarding", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 3: Login & Authentication",
    steps: [
      { step: 11, title: "Secure User Login Page", url: "https://app.zoikoshield.com/login", access: "Public" },
    ],
  },
  {
    phase: "Phase 4: Primary Customer Dashboards",
    steps: [
      { step: 12, title: "Customer Dashboard (Executive Overview)", url: "https://app.zoikoshield.com/customer/dashboard", access: "Authenticated" },
      { step: 13, title: "Customer Security Overview Workspace", url: "https://app.zoikoshield.com/customer/security-overview", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 5: Customer Workspace Sub-Sections (All 12 Submenus)",
    steps: [
      { step: 14, title: "Threats & Incidents Section", url: "https://app.zoikoshield.com/customer/threats-incidents", access: "Authenticated" },
      { step: 15, title: "Exposure Management Section", url: "https://app.zoikoshield.com/customer/exposure-management", access: "Authenticated" },
      { step: 16, title: "Discovered Assets Inventory Section", url: "https://app.zoikoshield.com/customer/assets-inventory", access: "Authenticated" },
      { step: 17, title: "Vulnerabilities Management Section", url: "https://app.zoikoshield.com/customer/vulnerabilities", access: "Authenticated" },
      { step: 18, title: "Detection & Response Controls Section", url: "https://app.zoikoshield.com/customer/detection-response", access: "Authenticated" },
      { step: 19, title: "Identity & Access Security Section", url: "https://app.zoikoshield.com/customer/identity-access", access: "Authenticated" },
      { step: 20, title: "Data Security & Privacy Section", url: "https://app.zoikoshield.com/customer/data-security", access: "Authenticated" },
      { step: 21, title: "Cloud Security Posture (CSPM) Section", url: "https://app.zoikoshield.com/customer/cloud-security", access: "Authenticated" },
      { step: 22, title: "Compliance & Regulatory Risk Section", url: "https://app.zoikoshield.com/customer/compliance-risk", access: "Authenticated" },
      { step: 23, title: "Reports & Analytics Generator Section", url: "https://app.zoikoshield.com/customer/reports-analytics", access: "Authenticated" },
      { step: 24, title: "Workspace Integrations & Connectors", url: "https://app.zoikoshield.com/customer/integrations", access: "Authenticated" },
      { step: 25, title: "Workspace Settings & Policies Section", url: "https://app.zoikoshield.com/customer/settings", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 6: Threat Ingestion, Telemetry & Detection Engineering",
    steps: [
      { step: 26, title: "Ingestion Console & Live Telemetry Streams", url: "https://app.zoikoshield.com/ingestion", access: "Authenticated" },
      { step: 27, title: "Detections & SIEM Correlation Rules", url: "https://app.zoikoshield.com/detections", access: "Authenticated" },
      { step: 28, title: "Threat Hunting Console", url: "https://app.zoikoshield.com/hunting", access: "Authenticated" },
      { step: 29, title: "Telemetry Ingestion Connectors", url: "https://app.zoikoshield.com/connectors", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 7: AI Copilot, Alerts & Incident Investigation",
    steps: [
      { step: 30, title: "AI Security Copilot Console", url: "https://app.zoikoshield.com/copilot", access: "Authenticated" },
      { step: 31, title: "Security Alerts Feed", url: "https://app.zoikoshield.com/alerts", access: "Authenticated" },
      { step: 32, title: "Specific Alert Deep-Dive View", url: "https://app.zoikoshield.com/alerts/alert-2026-auth-01", access: "Authenticated" },
      { step: 33, title: "Case Management Dashboard", url: "https://app.zoikoshield.com/cases", access: "Authenticated" },
      { step: 34, title: "Incident Case Investigation & Attack Path", url: "https://app.zoikoshield.com/cases/case-2026-auth-attack-01", access: "Authenticated" },
      { step: 35, title: "Major Incident Command Center", url: "https://app.zoikoshield.com/cases/incidents/command", access: "Authenticated" },
      { step: 36, title: "AI Governance & Model Audit Console", url: "https://app.zoikoshield.com/ai-governance", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 8: Actions, Playbooks & Incident Response Retainers",
    steps: [
      { step: 37, title: "Purpose-Bound Legal IR Retainer Page", url: "https://app.zoikoshield.com/ir-retainer", access: "Authenticated" },
      { step: 38, title: "SOAR Actions Console", url: "https://app.zoikoshield.com/actions", access: "Authenticated" },
      { step: 39, title: "SOAR Automation Playbooks", url: "https://app.zoikoshield.com/playbooks", access: "Authenticated" },
      { step: 40, title: "Response Proposals Approval Queue", url: "https://app.zoikoshield.com/response-proposals", access: "Authenticated" },
      { step: 41, title: "Retainer Operations & SLA Service Tracking", url: "https://app.zoikoshield.com/operations/retainers", access: "Authenticated" },
      { step: 42, title: "SOC Shift Handover Console", url: "https://app.zoikoshield.com/operations/shift-handover", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 9: Cryptographic Ledger & Audit Proofs",
    steps: [
      { step: 43, title: "Merkle Tree Audit Ledger & Receipt Verification", url: "https://app.zoikoshield.com/ledger", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 10: Risk Management, Controls, Compliance & Policies",
    steps: [
      { step: 44, title: "Enterprise Risk Management Register", url: "https://app.zoikoshield.com/risk", access: "Authenticated" },
      { step: 45, title: "Executive Risk Summary Dashboard", url: "https://app.zoikoshield.com/risk/executive", access: "Authenticated" },
      { step: 46, title: "Continuous Compliance Evaluation", url: "https://app.zoikoshield.com/compliance", access: "Authenticated" },
      { step: 47, title: "Regulatory Controls Catalog", url: "https://app.zoikoshield.com/controls", access: "Authenticated" },
      { step: 48, title: "Specific Regulatory Control View (AC-2)", url: "https://app.zoikoshield.com/controls/ctrl-ac-2", access: "Authenticated" },
      { step: 49, title: "Audit Findings Register", url: "https://app.zoikoshield.com/findings", access: "Authenticated" },
      { step: 50, title: "Specific Finding Remediation View (find-001)", url: "https://app.zoikoshield.com/findings/find-001", access: "Authenticated" },
      { step: 51, title: "Evidence Operations & Audit Packaging", url: "https://app.zoikoshield.com/evidence-operations", access: "Authenticated" },
      { step: 52, title: "Security Policy Exceptions Console", url: "https://app.zoikoshield.com/exceptions", access: "Authenticated" },
      { step: 53, title: "Regulated Sector Packs", url: "https://app.zoikoshield.com/sector-packs", access: "Authenticated" },
      { step: 54, title: "Organization Security Policies", url: "https://app.zoikoshield.com/policies", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 11: Unified Enterprise Assets",
    steps: [
      { step: 55, title: "Enterprise Asset Inventory (CMDB)", url: "https://app.zoikoshield.com/assets", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 12: Platform Administration & Governance Cockpits",
    steps: [
      { step: 56, title: "Platform Admin Dashboard", url: "https://app.zoikoshield.com/admin", access: "Super Admin" },
      { step: 57, title: "Multi-Tenant Provisioning Console", url: "https://app.zoikoshield.com/admin/tenant", access: "Super Admin" },
      { step: 58, title: "G1 Launch Gate Multi-Approver Cockpit", url: "https://app.zoikoshield.com/admin/g1-gate", access: "Super Admin" },
      { step: 59, title: "JIT Break-Glass Elevation Cockpit", url: "https://app.zoikoshield.com/admin/jit", access: "Super Admin" },
      { step: 60, title: "JIT Privileged Access Request Modal", url: "https://app.zoikoshield.com/admin/jit-elevation", access: "Authenticated" },
      { step: 61, title: "Platform Health & Disaster Recovery Drills", url: "https://app.zoikoshield.com/admin/platform-health", access: "Super Admin" },
      { step: 62, title: "Pre-Flight GTM Governance Checklist", url: "https://app.zoikoshield.com/admin/gtm-checklist", access: "Super Admin" },
      { step: 63, title: "Alert & Notification Email Templates", url: "https://app.zoikoshield.com/admin/email-templates", access: "Super Admin" },
      { step: 64, title: "Tenant Archival & Data Export Console", url: "https://app.zoikoshield.com/admin/export", access: "Super Admin" },
      { step: 65, title: "Tenant Workspace Switcher", url: "https://app.zoikoshield.com/tenant-management", access: "Authenticated" },
      { step: 66, title: "Tenant Team & Role Management", url: "https://app.zoikoshield.com/team", access: "Tenant Admin" },
      { step: 67, title: "In-App Notifications Center", url: "https://app.zoikoshield.com/notifications", access: "Authenticated" },
      { step: 68, title: "Developer Portal & API Access", url: "https://app.zoikoshield.com/developer", access: "Authenticated" },
    ],
  },
  {
    phase: "Phase 13: Specialized Portals (Auditor, MSSP Partner & Red Team)",
    steps: [
      { step: 69, title: "Independent Third-Party Auditor Portal", url: "https://app.zoikoshield.com/auditor", access: "Auditor" },
      { step: 70, title: "Internal Audit Engagement Review", url: "https://app.zoikoshield.com/audit", access: "Auditor" },
      { step: 71, title: "Statutory Audit Report Generator", url: "https://app.zoikoshield.com/audit/reports/generate", access: "Auditor" },
      { step: 72, title: "MSSP Multi-Tenant Fleet Portal", url: "https://app.zoikoshield.com/partner/fleet", access: "MSSP Partner" },
      { step: 73, title: "Red Team Adversary Simulation Console", url: "https://app.zoikoshield.com/red-team", access: "Red Team" },
    ],
  },
  {
    phase: "Phase 14: Session Termination & Sign Out",
    steps: [
      { step: 74, title: "Terminate Session & Logout (Return to Login)", url: "https://app.zoikoshield.com/login", access: "Authenticated" },
    ],
  },
];

function buildPdfBuffer() {
  // Page geometry (standard US Letter)
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  // Flatten all items with phase headers
  const items = [];
  for (const p of linksData) {
    items.push({ type: "phase", title: p.phase });
    for (const s of p.steps) {
      items.push({ type: "step", ...s });
    }
  }

  // Paginate items: 12-14 items per page
  const pages = [];
  let currentPage = [];
  let currentY = 730;

  for (const item of items) {
    const requiredH = item.type === "phase" ? 38 : 34;
    if (currentY - requiredH < 50) {
      pages.push(currentPage);
      currentPage = [];
      currentY = 730;
    }
    currentPage.push({ ...item, y: currentY });
    currentY -= requiredH;
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  const totalPages = pages.length;

  // PDF building blocks
  const objects = [];
  function addObj(str) {
    objects.push(str);
    return objects.length; // 1-based index
  }

  // Object references to fill
  const catalogObjNum = 1;
  const pagesObjNum = 2;
  const fontRegularObjNum = 3;
  const fontBoldObjNum = 4;
  const fontMonoObjNum = 5;

  // Reserve first 5 objects
  objects.push(""); // 1: Catalog
  objects.push(""); // 2: Pages
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`); // 3
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`); // 4
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`); // 5

  const pageObjNums = [];

  pages.forEach((pageItems, pageIdx) => {
    const annotations = [];
    let stream = "";

    // Draw page header
    stream += "q\n";
    // Header dark bar
    stream += "0.06 0.09 0.16 rg 0 755 612 37 re f\n";
    stream += "0.85 0.15 0.15 rg 0 753 612 2 re f\n"; // red accent bar

    // Header text
    stream += "BT\n";
    stream += "/F2 11 Tf 1 1 1 rg 40 768 Td (ZOIKO SHIELD  |  DEPLOYED APPLICATION STEP-BY-STEP LINK TESTING) Tj\n";
    stream += "ET\n";

    stream += "BT\n";
    stream += `/F1 9 Tf 0.7 0.75 0.85 rg 480 768 Td (Page ${pageIdx + 1} of ${totalPages}) Tj\n`;
    stream += "ET\n";

    // Subtitle on first page
    if (pageIdx === 0) {
      stream += "BT\n";
      stream += "/F2 13 Tf 0.08 0.12 0.2 rg 40 732 Td (OFFICIAL STEP-BY-STEP DEPLOYED LINK TEST SUITE) Tj\n";
      stream += "/F1 9 Tf 0.35 0.4 0.5 rg 40 718 Td (Click any link below to open directly in your browser. Complete testing sequence: Step 1 to 74.) Tj\n";
      stream += "ET\n";
      stream += "0.8 0.85 0.9 RG 0.5 w 40 710 m 572 710 l S\n";
    }

    // Render items
    pageItems.forEach((item) => {
      const y = item.y;
      if (item.type === "phase") {
        // Phase title banner
        stream += `0.93 0.95 0.98 rg 40 ${y - 18} 532 20 re f\n`;
        stream += `0.15 0.35 0.75 RG 1.5 w 40 ${y - 18} m 40 ${y + 2} l S\n`;
        stream += "BT\n";
        stream += `/F2 10 Tf 0.1 0.25 0.6 rg 48 ${y - 12} Td (${escapePdf(item.title)}) Tj\n`;
        stream += "ET\n";
      } else {
        // Step item
        const boxY = y - 26;
        const boxH = 28;

        // Subtle row background
        stream += `0.98 0.99 1.0 rg 40 ${boxY} 532 ${boxH} re f\n`;
        stream += `0.88 0.91 0.95 RG 0.5 w 40 ${boxY} 532 ${boxH} re S\n`;

        // Step number badge
        stream += `0.1 0.15 0.25 rg 44 ${boxY + 5} 44 18 re f\n`;
        stream += "BT\n";
        stream += `/F2 8.5 Tf 1 1 1 rg 48 ${boxY + 10} Td (Step ${item.step}) Tj\n`;
        stream += "ET\n";

        // Step title
        stream += "BT\n";
        stream += `/F2 9.5 Tf 0.12 0.16 0.24 rg 96 ${boxY + 15} Td (${escapePdf(item.title)}) Tj\n`;
        stream += "ET\n";

        // Access badge
        const badgeColor = item.access === "Public" ? "0.1 0.6 0.3" : item.access.includes("Super") ? "0.8 0.2 0.2" : "0.2 0.45 0.8";
        stream += "BT\n";
        stream += `/F1 7.5 Tf ${badgeColor} rg 515 ${boxY + 15} Td ([${item.access}]) Tj\n`;
        stream += "ET\n";

        // Clickable URL text
        stream += "BT\n";
        stream += `/F1 8.5 Tf 0.05 0.4 0.85 rg 96 ${boxY + 4} Td (${escapePdf(item.url)}) Tj\n`;
        stream += "ET\n";

        // Underline for link
        stream += `0.05 0.4 0.85 RG 0.5 w 96 ${boxY + 3} m 420 ${boxY + 3} l S\n`;

        // Open Link arrow icon text
        stream += "BT\n";
        stream += `/F2 8 Tf 0.05 0.4 0.85 rg 430 ${boxY + 4} Td ([OPEN LINK ->]) Tj\n`;
        stream += "ET\n";

        // Annotation link rectangle [llx, lly, urx, ury] covering title and URL
        const annotObjNum = addObj(
          `<< /Type /Annot /Subtype /Link /Rect [92 ${boxY} 560 ${boxY + boxH}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(item.url)}) >> >>`
        );
        annotations.push(`${annotObjNum} 0 R`);
      }
    });

    // Page footer
    stream += "BT\n";
    stream += "/F1 8 Tf 0.5 0.55 0.65 rg 40 25 Td (ZoikoShield Enterprise Cloud Sovereign Platform — Confidential QA Testing Artifact) Tj\n";
    stream += "ET\n";
    stream += "Q\n";

    // Create stream object
    const streamBuffer = Buffer.from(stream, "utf-8");
    const contentsObjNum = addObj(
      `<< /Length ${streamBuffer.length} >>\nstream\n${stream}\nendstream`
    );

    // Create page object
    const annotsStr = annotations.length > 0 ? `/Annots [${annotations.join(" ")}]` : "";
    const pageObjNum = addObj(
      `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularObjNum} 0 R /F2 ${fontBoldObjNum} 0 R /F3 ${fontMonoObjNum} 0 R >> >> /Contents ${contentsObjNum} 0 R ${annotsStr} >>`
    );
    pageObjNums.push(pageObjNum);
  });

  // Now fill Catalog and Pages objects
  objects[catalogObjNum - 1] = `<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`;
  objects[pagesObjNum - 1] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjNums.length} >>`;

  // Build final PDF byte buffer
  let pdf = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf-8");
}

function escapePdf(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Generate the PDF
const pdfBuffer = buildPdfBuffer();
const outputPath = path.resolve(__dirname, "..", "DEPLOYED_APPLICATION_LINKS_STEP_BY_STEP_TESTING.pdf");
fs.writeFileSync(outputPath, pdfBuffer);
console.log(`Successfully generated ${outputPath} (${pdfBuffer.length} bytes)`);

// Also generate standalone HTML for direct browser viewing
let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ZoikoShield — Deployed Application Step-by-Step Links</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b0f17; color: #e2e8f0; padding: 32px 20px; line-height: 1.5; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #111827 0%, #1e293b 100%); border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 28px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
    .header h1 span { background: #ef4444; color: white; font-size: 11px; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; }
    .header p { font-size: 13px; color: #94a3b8; margin-bottom: 12px; }
    .meta-bar { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; padding-top: 12px; border-top: 1px solid #334155; }
    .meta-item { background: #0f172a; border: 1px solid #1e293b; padding: 4px 10px; border-radius: 6px; color: #cbd5e1; }
    .meta-item strong { color: #38bdf8; }
    .phase-card { margin-bottom: 24px; }
    .phase-title { font-size: 14px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 14px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; border-radius: 4px; margin-bottom: 10px; }
    .step-list { display: flex; flex-direction: column; gap: 8px; }
    .step-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: #131c2e; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 16px; transition: all 0.2s ease; text-decoration: none; }
    .step-row:hover { background: #1e293b; border-color: #38bdf8; transform: translateX(3px); }
    .step-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .step-badge { background: #0f172a; border: 1px solid #334155; color: #f1f5f9; font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 6px; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .step-info { min-width: 0; }
    .step-name { font-size: 13px; font-weight: 600; color: #f8fafc; }
    .step-url { font-size: 12px; color: #38bdf8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .step-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .access-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .access-public { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .access-auth { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .access-admin { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .open-btn { background: #0284c7; color: white; font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ZOIKO SHIELD <span>DEPLOYED LINKS ONLY</span></h1>
      <p>Complete sequential step-wise testing document for the deployed application. Click any step to open directly in the browser.</p>
      <div class="meta-bar">
        <div class="meta-item">Base URL: <strong>https://app.zoikoshield.com</strong></div>
        <div class="meta-item">Total Steps: <strong>74 Sequential Test Steps</strong></div>
        <div class="meta-item">Credentials: <strong>aditya@zoiko.com / Aditya@20045678</strong></div>
        <div class="meta-item">Format: <strong>Active Clickable Hyperlinks</strong></div>
      </div>
    </div>
`;

for (const p of linksData) {
  html += `    <div class="phase-card">
      <div class="phase-title">${p.phase}</div>
      <div class="step-list">
`;
  for (const s of p.steps) {
    const accessClass = s.access === "Public" ? "access-public" : s.access.includes("Admin") ? "access-admin" : "access-auth";
    html += `        <a class="step-row" href="${s.url}" target="_blank" rel="noopener noreferrer">
          <div class="step-left">
            <span class="step-badge">Step ${s.step}</span>
            <div class="step-info">
              <div class="step-name">${s.title}</div>
              <div class="step-url">${s.url}</div>
            </div>
          </div>
          <div class="step-right">
            <span class="access-tag ${accessClass}">${s.access}</span>
            <span class="open-btn">Open &rarr;</span>
          </div>
        </a>
`;
  }
  html += `      </div>
    </div>
`;
}

html += `  </div>
</body>
</html>`;

const htmlOutputPath = path.resolve(__dirname, "..", "DEPLOYED_APPLICATION_LINKS_ONLY.html");
fs.writeFileSync(htmlOutputPath, html, "utf-8");
console.log(`Successfully generated ${htmlOutputPath}`);

