const http = require('http');

const routes = [
  // 16 Demo Walkthrough Core Steps
  { step: 'Step 1', name: 'Platform Health Cockpit', url: '/admin/platform-health' },
  { step: 'Step 2', name: 'G1 Launch Gate 8-Signer Ratification', url: '/admin/g1-gate' },
  { step: 'Step 3a', name: 'Executive Risk Scorecard', url: '/risk' },
  { step: 'Step 3b', name: 'Executive CISO Board View (W31)', url: '/risk/executive' },
  { step: 'Step 4', name: 'Real-Time Alert Queue (OCSF/MITRE)', url: '/alerts' },
  { step: 'Step 5', name: 'Incident Command War Room (W19)', url: '/cases/incidents/command' },
  { step: 'Step 6', name: 'AI Security Copilot (§16.1 Envelope)', url: '/copilot' },
  { step: 'Step 7', name: 'AI Governance & Model Armor', url: '/ai-governance' },
  { step: 'Step 8', name: 'Cedar Policies & 4-Eyes Engine (W12)', url: '/policies' },
  { step: 'Step 9a', name: 'JIT Elevation Cockpit', url: '/admin/jit-elevation' },
  { step: 'Step 9b', name: 'JIT Request & Elevation Form (W03)', url: '/admin/jit' },
  { step: 'Step 10', name: 'Autonomous SOAR Proposals & Sandboxing', url: '/response-proposals' },
  { step: 'Step 11', name: 'Tenant Administration & Emergency Freeze Kill-Switch', url: '/admin' },
  { step: 'Step 12a', name: 'Cryptographic Evidence Ledger (W23)', url: '/ledger' },
  { step: 'Step 12b', name: 'Evidence Operations Queue (W24)', url: '/evidence-operations' },
  { step: 'Step 13a', name: 'Continuous Control Matrix (W21)', url: '/controls' },
  { step: 'Step 13b', name: 'Compliance Frameworks (SOC2, ISO, HIPAA)', url: '/compliance' },
  { step: 'Step 14a', name: 'Commercial Pricing & Anti-Perverse Guarantee', url: '/pricing' },
  { step: 'Step 14b', name: 'GTM Launch Pre-Flight Checklist', url: '/admin/gtm-checklist' },
  { step: 'Step 15', name: 'Notification Center & DLQ Tracking (W04)', url: '/notifications' },
  { step: 'Step 16', name: 'Production Email Template Studio (226 Templates)', url: '/admin/email-templates' },

  // Key Supporting Experience Contract Surfaces
  { step: 'Aux 01', name: 'Main Operational Command Center (W05)', url: '/' },
  { step: 'Aux 02', name: 'Sign-in & Hardware MFA (W02)', url: '/login' },
  { step: 'Aux 03', name: 'Tenant Onboarding Wizard (W06)', url: '/onboarding' },
  { step: 'Aux 04', name: 'Connector Catalog & Setup (W07)', url: '/connectors' },
  { step: 'Aux 05', name: 'Connector Health & Ingestion (W08)', url: '/ingestion' },
  { step: 'Aux 06', name: 'Users & Roles Administration (W09)', url: '/team' },
  { step: 'Aux 07', name: 'Commercial Entitlements & Services (W10)', url: '/services' },
  { step: 'Aux 08', name: 'Audit & Package Builder (W11 / W25)', url: '/audit' },
  { step: 'Aux 09', name: 'Single Alert Investigation View (W14)', url: '/alerts/alt-failed-login-bruteforce-01' },
  { step: 'Aux 10', name: 'Detection Content Management (W15)', url: '/detections' },
  { step: 'Aux 11', name: 'Case Workspace & Timeline (W16)', url: '/cases/case-2026-auth-attack-01' },
  { step: 'Aux 12', name: 'Response Action Proposals (W17)', url: '/actions' },
  { step: 'Aux 13', name: 'Playbook Execution Engine (W18)', url: '/playbooks' },
  { step: 'Aux 14', name: 'Auditor Workspace & Certificate Verification (W26)', url: '/verify-certificate' },
  { step: 'Aux 15', name: 'Risk Register & Governance (W27)', url: '/risk' },
  { step: 'Aux 16', name: 'Exception Management Workflow (W28)', url: '/exceptions' },
  { step: 'Aux 17', name: 'Incident Response Retainer & SLA', url: '/ir-retainer' },
  { step: 'Aux 18', name: 'Threat Hunting Workspace', url: '/hunting' },
  { step: 'Aux 19', name: 'Partner / MSSP Fleet Cockpit', url: '/partner/fleet' },
  { step: 'Aux 20', name: 'Auditor Sealed Package Verification', url: '/auditor' },
  { step: 'Aux 21', name: 'Developer API Credentials', url: '/developer' },
  { step: 'Aux 22', name: 'Trust Center & Security Disclosures', url: '/trust' },
  { step: 'Aux 23', name: 'Regulated Sector Packs', url: '/sector-packs' },
  { step: 'Aux 24', name: 'Asset Inventory (W29)', url: '/assets' },
  { step: 'Aux 25', name: 'Findings Register (W30)', url: '/findings' },
];

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get('http://localhost:3000' + url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode;
        const hasError = data.includes('Application error') || data.includes('Unhandled Runtime Error');
        resolve({ url, status, hasError, length: data.length });
      });
    }).on('error', (err) => {
      resolve({ url, status: 'ERROR', error: err.message });
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('   ZoikoShield Wednesday Full Demo Route & Contract Verification');
  console.log('================================================================\n');

  let passed = 0;
  for (const item of routes) {
    const res = await checkUrl(item.url);
    const pass = res.status === 200 && !res.hasError;
    const mark = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`[${item.step}] ${item.name.padEnd(46)} ${item.url.padEnd(38)} -> ${mark} (HTTP ${res.status}, ${res.length} bytes)`);
    if (pass) passed++;
  }

  console.log('\n================================================================');
  console.log(`Summary: ${passed} / ${routes.length} Demo Routes Verified OK`);
  console.log('================================================================');
}

run();
