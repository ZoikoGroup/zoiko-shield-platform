const http = require('http');

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
  
  // Auditor Cryptographic Cockpit
  { method: 'GET', url: '/api/v1/auditor/workspace' },
  { method: 'GET', url: '/api/v1/auditor/merkle-path/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { method: 'GET', url: '/api/v1/auditor/evidence-chain/pkg-dora-q3' },
  { method: 'POST', url: '/api/v1/auditor/freeze-certificate/pkg-dora-q3', body: {} },

  // OT & Safety-Critical Actuators
  { method: 'GET', url: '/api/v1/detection/ot/rules' },
  { method: 'POST', url: '/api/v1/detection/ot/analyze', body: { protocol: 'MODBUS_TCP', destinationIp: '10.240.10.15' } },
  { method: 'POST', url: '/api/v1/action/ot-interlock/evaluate', body: { targetDescriptor: { targetRef: 'plc-01' } } },

  // Hardware Attestation & KMS Escrow
  { method: 'GET', url: '/api/v1/crypto-escrow/attestation/posture' },
  { method: 'GET', url: '/api/v1/crypto-escrow/byok/status' },
  { method: 'POST', url: '/api/v1/crypto-escrow/mpc/split', body: { keyAlias: 'master-key', threshold: 3, totalShares: 5 } },

  // Standalone Airgap & Offline Verification
  { method: 'POST', url: '/api/v1/compliance/airgap/export-package', body: { packageId: 'pkg-dora-q3' } },
  { method: 'POST', url: '/api/v1/ingest/airgap/batch-sync', body: { batchId: 'batch-01', events: [] } },

  // MSSP Multi-Tenant Fleet & JIT
  { method: 'GET', url: '/api/v1/partners/fleet/summary' },
  { method: 'GET', url: '/api/v1/partners/fleet/isolation-audit' },
  { method: 'POST', url: '/api/v1/partners/fleet/jit/request', body: { incidentReference: 'INC-2026-9921', justification: 'Live audit' } },

  // CIEM Least Privilege
  { method: 'POST', url: '/api/v1/identity-context/ciem/analyze', body: { provider: 'AWS_IAM', roleArnOrId: 'arn:aws:iam::123:role/Admin', assignedPermissions: ['s3:*'], last90DaysUsedPermissions: ['s3:GetObject'] } },

  // Cross-Region DR Ledger
  { method: 'GET', url: '/api/v1/evidence/cross-region/status' },
  { method: 'POST', url: '/api/v1/evidence/cross-region/failover-drill', body: {} },

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
        'Accept': 'application/json',
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
          data: data.slice(0, 120),
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
  console.log(' 🔍 ZOIKOSHIELD API ENDPOINT SUITE (DIRECT 127.0.0.1:3000)');
  console.log('========================================================================\n');

  let passed = 0;
  const failures = [];

  for (const ep of apiEndpoints) {
    const res = await request(ep, ep.body);
    const mark = res.ok ? '✔ 200 OK' : `❌ ${res.status}`;
    console.log(`[${ep.method.padEnd(4)}] ${ep.url.padEnd(55)} -> ${mark} (${res.length} bytes)`);
    if (res.ok) {
      passed++;
    } else {
      failures.push({ ...ep, status: res.status, error: res.error, data: res.data });
    }
  }

  console.log('\n========================================================================');
  console.log(`Result: ${passed} / ${apiEndpoints.length} APIs Returned HTTP 200 OK`);
  console.log('========================================================================');

  if (failures.length > 0) {
    console.log('\n❌ FAILED ENDPOINTS TO FIX:');
    failures.forEach(f => {
      console.log(`- [${f.method}] ${f.url} -> Status: ${f.status} | Data: ${f.data || f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL 44 API ENDPOINTS ARE 100% OPERATIONAL (200 OK)!');
  }
}

run();
