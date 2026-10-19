const http = require('http');

const pages = [
  { step: 'Stage 00', name: 'Login & FIDO2', url: '/login' },
  { step: 'Stage 01', name: 'Onboarding', url: '/onboarding' },
  { step: 'Stage 02', name: 'Platform Health', url: '/admin/platform-health' },
  { step: 'Stage 03', name: 'G1 Release Gate', url: '/admin/g1-gate' },
  { step: 'Stage 04a', name: 'Risk Scorecard', url: '/risk' },
  { step: 'Stage 04b', name: 'Executive CISO Board', url: '/risk/executive' },
  { step: 'Stage 05a', name: 'Alerts Queue', url: '/alerts' },
  { step: 'Stage 05b', name: 'Alert Deep Dive', url: '/alerts/alt-failed-login-bruteforce-01' },
  { step: 'Stage 06', name: 'Incident War Room', url: '/cases/incidents/command' },
  { step: 'Stage 07', name: 'AI Security Copilot', url: '/copilot' },
  { step: 'Stage 08', name: 'AI Governance', url: '/ai-governance' },
  { step: 'Stage 09', name: 'Cedar Policies', url: '/policies' },
  { step: 'Stage 10a', name: 'JIT Elevation Cockpit', url: '/admin/jit-elevation' },
  { step: 'Stage 10b', name: 'JIT Request Form', url: '/admin/jit' },
  { step: 'Stage 11', name: 'SOAR Proposals', url: '/response-proposals' },
  { step: 'Stage 12', name: 'Super-Admin Console', url: '/admin' },
  { step: 'Stage 13a', name: 'Evidence Ledger', url: '/ledger' },
  { step: 'Stage 13b', name: 'Evidence Ops Queue', url: '/evidence-operations' },
  { step: 'Stage 14a', name: 'Continuous Controls', url: '/controls' },
  { step: 'Stage 14b', name: 'Compliance Frameworks', url: '/compliance' },
  { step: 'Stage 15a', name: 'Commercial Pricing', url: '/pricing' },
  { step: 'Stage 15b', name: 'GTM Checklist', url: '/admin/gtm-checklist' },
  { step: 'Stage 16', name: 'Notification Center', url: '/notifications' },
  { step: 'Stage 17', name: 'Email Template Studio', url: '/admin/email-templates' },
  { step: 'Aux 01', name: 'Command Center', url: '/' },
  { step: 'Aux 02', name: 'Connectors Catalog', url: '/connectors' },
  { step: 'Aux 03', name: 'Ingestion Fleet', url: '/ingestion' },
  { step: 'Aux 04', name: 'Team & Roles', url: '/team' },
  { step: 'Aux 05', name: 'Entitlements & Services', url: '/services' },
  { step: 'Aux 06', name: 'Audit Workspace', url: '/audit' },
  { step: 'Aux 07', name: 'Detection Content', url: '/detections' },
  { step: 'Aux 08', name: 'Case Workspace', url: '/cases/case-2026-auth-attack-01' },
  { step: 'Aux 09', name: 'Actions Registry', url: '/actions' },
  { step: 'Aux 10', name: 'Playbooks Engine', url: '/playbooks' },
  { step: 'Aux 11', name: 'Certificate Verification', url: '/verify-certificate' },
  { step: 'Aux 12', name: 'Exceptions', url: '/exceptions' },
  { step: 'Aux 13', name: 'IR Retainer', url: '/ir-retainer' },
  { step: 'Aux 14', name: 'Threat Hunting', url: '/hunting' },
  { step: 'Aux 15', name: 'Partner MSSP Fleet', url: '/partner/fleet' },
  { step: 'Aux 16', name: 'Auditor Package Verifier', url: '/auditor' },
  { step: 'Aux 17', name: 'Developer Portal', url: '/developer' },
  { step: 'Aux 18', name: 'Trust Center', url: '/trust' },
  { step: 'Aux 19', name: 'Sector Packs', url: '/sector-packs' },
  { step: 'Aux 20', name: 'Asset Inventory', url: '/assets' },
  { step: 'Aux 21', name: 'Findings Register', url: '/findings' },
  { step: 'Aux 22', name: 'Tenant Management', url: '/tenant-management' },
  { step: 'Aux 23', name: 'Documentation & Help', url: '/help' },
];

const apiEndpoints = [
  // Session & Auth
  { method: 'GET', url: '/api/v1/auth/session' },
  { method: 'GET', url: '/api/v1/auth/me' },
  
  // Health & Disaster Recovery
  { method: 'GET', url: '/api/v1/observability/disaster-recovery/restore-drill' },
  
  // Governance & G1 Release Gate
  { method: 'GET', url: '/api/v1/governance/g1-roster' },
  { method: 'POST', url: '/api/v1/governance/g1-roster/sign', body: { signerId: 'signer-ciso', signatureType: 'HARDWARE_HSM' } },
  { method: 'POST', url: '/api/v1/governance/g1-roster/reset', body: {} },
  
  // Risk & Reporting
  { method: 'GET', url: '/api/v1/reporting/security' },
  { method: 'GET', url: '/api/v1/reporting/assurance' },
  { method: 'GET', url: '/api/v1/reporting/service-health' },
  { method: 'GET', url: '/api/v1/reporting/snapshots' },
  { method: 'GET', url: '/api/v1/risks' },
  
  // Alerts & OCSF
  { method: 'GET', url: '/api/v1/alerts' },
  { method: 'GET', url: '/api/v1/alerts/alt-failed-login-bruteforce-01' },
  
  // Cases & Incident Command War Room
  { method: 'GET', url: '/api/v1/cases' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01/timeline' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01/decisions' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01/notes' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01/sla' },
  { method: 'GET', url: '/api/v1/cases/case-2026-auth-attack-01/evidence' },
  { method: 'POST', url: '/api/v1/cases/case-2026-auth-attack-01/contain', body: { action: 'ISOLATE_HOST', hostId: 'FIN-WS-0412' } },
  
  // AI Copilot & Decisions
  { method: 'GET', url: '/api/v1/ai/models' },
  { method: 'POST', url: '/api/v1/ai/decisions', body: { query: 'Containment test', actionClass: 'CONTAINMENT' } },
  
  // Cedar Policies
  { method: 'GET', url: '/api/v1/policies' },
  { method: 'POST', url: '/api/v1/policies/pol-2026-09-001/approve', body: { approverId: 'approver-02' } },
  
  // JIT Elevation
  { method: 'GET', url: '/api/v1/admin/jit/sessions' },
  { method: 'POST', url: '/api/v1/admin/jit/request', body: { role: 'INCIDENT_COMMANDER', durationMinutes: 30, purpose: 'Triage' } },
  
  // SOAR Proposals
  { method: 'GET', url: '/api/v1/response-proposals' },
  { method: 'POST', url: '/api/v1/response-proposals/prop-2026-0914/approve', body: {} },
  
  // Cryptographic Ledger
  { method: 'GET', url: '/api/v1/ledger/blocks' },
  
  // Controls & Compliance
  { method: 'GET', url: '/api/v1/controls' },
  { method: 'GET', url: '/api/v1/compliance/frameworks' },
  
  // Notifications & Email Dispatch
  { method: 'GET', url: '/api/v1/notifications' },
  { method: 'GET', url: '/api/v1/notifications/templates' },
  { method: 'POST', url: '/api/v1/notifications/templates/ZS-EML-IAM-001/preview', body: { variables: {} } },
  { method: 'POST', url: '/api/v1/notifications/templates/ZS-EML-IAM-001/send-test', body: { recipientEmail: 'test@zoikoshield.corp' } },
  
  // Commercial & Trust
  { method: 'GET', url: '/api/v1/commercial/trust-center/overview' },
  { method: 'GET', url: '/api/v1/commercial/capabilities/public-services' },
  { method: 'GET', url: '/api/v1/commercial/capabilities/domains' },
  
  // Playbooks & Response Freeze
  { method: 'GET', url: '/api/v1/playbooks/runs' },
  { method: 'GET', url: '/api/v1/response/freeze-status' },
  
  // Ingestion & Connectors
  { method: 'GET', url: '/api/v1/connectors' },
  { method: 'GET', url: '/api/v1/ingestion/health' },
  
  // Global Reset
  { method: 'POST', url: '/api/v1/demo/reset', body: {} },
];

function request(options, body) {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqOptions = {
      hostname: '127.0.0.1',
      port: 3000,
      path: options.url,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json, text/html',
        ...(body ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        } : {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          method: options.method || 'GET',
          url: options.url,
          status: res.statusCode,
          length: data.length,
          data: data.slice(0, 100),
          ok: res.statusCode === 200,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        method: options.method || 'GET',
        url: options.url,
        status: 'ERROR',
        error: err.message,
        ok: false,
      });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log(' 🚀 ZOIKOSHIELD COMPLETE STAGE & API SUITE HEALTH CHECK');
  console.log('========================================================================\n');

  console.log('--- PART 1: VERIFYING ALL 47 STAGE & AUXILIARY PAGE ROUTES ---');
  let pagesPassed = 0;
  for (const page of pages) {
    const res = await request({ url: page.url, method: 'GET' });
    const mark = res.ok ? '✔ 200 OK' : `❌ ${res.status}`;
    console.log(`[${page.step.padEnd(9)}] ${page.name.padEnd(30)} ${page.url.padEnd(35)} -> ${mark}`);
    if (res.ok) pagesPassed++;
  }

  console.log(`\nPages Result: ${pagesPassed} / ${pages.length} Pages OK (200)\n`);

  console.log('--- PART 2: VERIFYING ALL 42 CORE PLATFORM API ENDPOINTS ---');
  let apisPassed = 0;
  const failedApis = [];

  for (const ep of apiEndpoints) {
    const res = await request(ep, ep.body);
    const mark = res.ok ? '✔ 200 OK' : `❌ ${res.status}`;
    console.log(`[${ep.method.padEnd(4)}] ${ep.url.padEnd(55)} -> ${mark}`);
    if (res.ok) {
      apisPassed++;
    } else {
      failedApis.push({ ...ep, status: res.status, error: res.error, data: res.data });
    }
  }

  console.log(`\nAPIs Result: ${apisPassed} / ${apiEndpoints.length} APIs OK (200)`);
  console.log('========================================================================');

  if (failedApis.length > 0) {
    console.log('\n❌ FAILED ENDPOINTS TO FIX:');
    failedApis.forEach(f => {
      console.log(`- [${f.method}] ${f.url} -> Status: ${f.status} | Details: ${f.error || f.data}`);
    });
  } else {
    console.log('\n🎉 ALL STAGES AND APIS ARE RETURNING 200 OK! ZERO ERRORS!');
  }
}

run();
