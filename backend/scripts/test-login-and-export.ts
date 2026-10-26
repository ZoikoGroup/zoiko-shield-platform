import 'dotenv/config';

async function testLoginAndExport() {
  console.log('=== TEST 1: Unverified Account Login Handling ===');
  const unverifiedRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testadmin282@gmail.com',
      password: 'AnyPassword123!',
    }),
  });
  console.log(`Unverified Login Status: HTTP ${unverifiedRes.status}`);
  const unverifiedBody = await unverifiedRes.json();
  console.log('Unverified Login Body:', JSON.stringify(unverifiedBody, null, 2));

  // Also test through frontend proxy
  const proxyUnverified = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testadmin282@gmail.com',
      password: 'AnyPassword123!',
    }),
  });
  console.log(`Proxy Unverified Login Status: HTTP ${proxyUnverified.status}`);
  const proxyUnverifiedBody = await proxyUnverified.json();
  console.log('Proxy Unverified Login Body:', JSON.stringify(proxyUnverifiedBody, null, 2));

  console.log('\n=== TEST 2: Verified Account Login (Tenant ID Auto-Resolution) ===');
  // First set known password for owner@acme.com if needed or check if known
  // In test-duplicate-registration or seed:dev-tenant, what is owner password?
  // Let's test with admin@zoikoshield.io or inspect password hash
  
  console.log('\n=== TEST 3: Export Endpoints (CSV & JSON) ===');
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const exportTypes = ['team', 'audit', 'evidence', 'risk', 'cases', 'alerts'];

  for (const type of exportTypes) {
    const csvUrl = `http://127.0.0.1:3001/api/v1/exports/data/${type}?format=csv`;
    const resCsv = await fetch(csvUrl, {
      headers: { 'x-tenant-id': tenantId },
    });
    console.log(`Export ${type} (CSV) Status: HTTP ${resCsv.status}, Content-Type: ${resCsv.headers.get('content-type')}, Content-Disposition: ${resCsv.headers.get('content-disposition')}`);
    const text = await resCsv.text();
    console.log(`Sample CSV line: ${text.split('\n')[0]}`);

    // Through frontend proxy
    const proxyCsvUrl = `http://127.0.0.1:3000/api/v1/exports/data/${type}?format=csv`;
    const resProxyCsv = await fetch(proxyCsvUrl, {
      headers: { 'x-tenant-id': tenantId },
    });
    console.log(`Proxy Export ${type} (CSV) Status: HTTP ${resProxyCsv.status}, Content-Type: ${resProxyCsv.headers.get('content-type')}`);
  }
}

testLoginAndExport().catch(console.error);
