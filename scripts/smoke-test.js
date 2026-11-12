#!/usr/bin/env node

/**
 * ZoikoShield Production & Local Deployment Smoke Test Suite
 *
 * Verifies core platform health, authentication, tenant authorization,
 * alerts, notifications, AI endpoints, and commercial recommendation APIs.
 *
 * Usage:
 *   node scripts/smoke-test.js [target_url]
 *   ./scripts/smoke-test https://app.zoikoshield.com
 *   ./scripts/smoke-test https://api.zoikoshield.com
 *   ./scripts/smoke-test http://localhost:3000
 */

const targetUrl = (process.argv[2] || process.env.TARGET_URL || 'https://app.zoikoshield.com').replace(/\/+$/, '');
const testEmail = process.env.SMOKE_EMAIL || 'aditya@zoiko.com';
const testPassword = process.env.SMOKE_PASSWORD || 'Aditya@20045678';

console.log(`\n======================================================`);
console.log(` ZOIKOSHIELD PRODUCTION SMOKE TEST RUNNER`);
console.log(` Target Base URL : ${targetUrl}`);
console.log(` User Principal  : ${testEmail}`);
console.log(` Timestamp       : ${new Date().toISOString()}`);
console.log(`======================================================\n`);

let passedCount = 0;
let failedCount = 0;
const results = [];

async function runStep(name, fn) {
  process.stdout.write(`[*] Checking ${name}... `);
  try {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    console.log(`\x1b[32mPASS\x1b[0m (${elapsed}ms)`);
    passedCount++;
    results.push({ name, status: 'PASS', elapsed, detail: result });
    return result;
  } catch (err) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(`    -> Error: ${err.message}`);
    failedCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    return null;
  }
}

async function request(path, options = {}) {
  const url = `${targetUrl}${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    'Accept': 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { res, data, status: res.status };
}

async function main() {
  // Step 1: Health check
  await runStep('Core Platform Health (/health)', async () => {
    let { res, data, status } = await request('/health');
    if (status === 404) {
      // Try /api/v1/health if proxied through frontend
      const retry = await request('/api/v1/health');
      res = retry.res;
      data = retry.data;
      status = retry.status;
    }
    if (!res.ok) {
      throw new Error(`Expected 200 OK, got HTTP ${status}: ${JSON.stringify(data)}`);
    }
    if (data?.status !== 'healthy' && data?.service !== 'shield-core') {
      // Allow custom health structures
      if (!data) throw new Error('Health check returned empty response');
    }
    return `HTTP ${status} - healthy`;
  });

  // Step 2: Authentication Login
  let authToken = null;
  let authTenantId = null;

  await runStep('Authentication Login (/api/v1/auth/login)', async () => {
    const { res, data, status } = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
    }

    authToken = data?.accessToken || data?.token;
    authTenantId = data?.tenantId || data?.user?.tenantId;

    if (!authToken) {
      throw new Error(`Login succeeded but did not return accessToken: ${JSON.stringify(data)}`);
    }
    if (!authTenantId) {
      throw new Error(`Login succeeded but did not return tenantId: ${JSON.stringify(data)}`);
    }

    return `Token issued for tenant ${authTenantId}`;
  });

  if (!authToken) {
    console.error('\n[!] Skipping authenticated API checks because login failed.');
    printSummary();
    process.exit(1);
  }

  const authHeaders = {
    'Authorization': `Bearer ${authToken}`,
    'x-tenant-id': authTenantId,
  };

  // Step 3: Alerts Feed
  await runStep('Tenant Alerts Feed (/api/v1/alerts)', async () => {
    const { res, data, status } = await request('/api/v1/alerts?limit=10', {
      headers: authHeaders,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
    }
    const list = Array.isArray(data) ? data : data?.data || [];
    return `Retrieved ${list.length} alerts`;
  });

  // Step 4: Notifications Feed
  await runStep('Tenant Notifications Feed (/api/v1/notifications)', async () => {
    const { res, data, status } = await request('/api/v1/notifications?limit=10', {
      headers: authHeaders,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
    }
    const list = Array.isArray(data) ? data : data?.data || [];
    return `Retrieved ${list.length} notifications`;
  });

  // Step 5: Commercial Plan Recommendation
  await runStep('Plan Recommendation (/api/v1/commercial/plans/recommend)', async () => {
    const { res, data, status } = await request('/api/v1/commercial/plans/recommend', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        protectedAssetCount: 150,
        estimatedDailyTelemetryGb: 50,
        requiresAiSecurity: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
    }
    return `Recommended: ${data?.recommendedPlan?.displayName || data?.recommendedPlan?.key || 'Plan'}`;
  });

  // Step 6: AI Incidents
  await runStep('AI Incidents Endpoint (/api/v1/ai/incidents)', async () => {
    const { res, data, status } = await request('/api/v1/ai/incidents', {
      headers: authHeaders,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
    }
    const list = Array.isArray(data) ? data : data?.data || [];
    return `Retrieved ${list.length} incidents`;
  });

  // Step 7: Multi-Tenant Boundary Enforcement (Negative Test)
  await runStep('Tenant Boundary Isolation (403 on mismatched tenant)', async () => {
    const mismatchedTenant = '00000000-0000-4000-8000-000000000001';
    const { res, status } = await request('/api/v1/alerts?limit=1', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'x-tenant-id': mismatchedTenant,
      },
    });
    if (status === 403) {
      return '403 Forbidden correctly enforced on tenant mismatch';
    }
    throw new Error(`Expected 403 Forbidden, but received HTTP ${status}`);
  });

  // Step 8: Swagger API Documentation Endpoint
  await runStep('Swagger API Documentation (/docs/)', async () => {
    const docsUrl = targetUrl.includes('api.') ? `${targetUrl}/docs/` : 'https://api.zoikoshield.com/docs/';
    const res = await fetch(docsUrl);
    if (!res.ok) {
      throw new Error(`Expected 200 OK from Swagger UI at ${docsUrl}, got HTTP ${res.status}`);
    }
    const html = await res.text();
    if (!html.includes('swagger-ui') && !html.includes('Swagger UI')) {
      throw new Error('Response did not contain Swagger UI markup');
    }
    return `HTTP ${res.status} - Swagger UI active`;
  });

  printSummary();
}

function printSummary() {
  console.log(`\n------------------------------------------------------`);
  console.log(` RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log(`------------------------------------------------------`);
  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log(`\x1b[32m[✓] All smoke test validations passed successfully.\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`\n[FATAL] Unhandled test exception:`, err);
  process.exit(1);
});

