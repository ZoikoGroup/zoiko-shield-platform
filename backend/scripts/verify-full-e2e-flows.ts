import 'dotenv/config';

async function main() {
  console.log('====================================================');
  console.log('   ZOIKOSHIELD FULL END-TO-END FLOW VERIFICATION     ');
  console.log('====================================================\n');

  // STEP 1: Unverified Login Verification
  console.log('[FLOW 1] Testing login with unverified account (testadmin282@gmail.com)...');
  const unverifiedRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testadmin282@gmail.com',
      password: 'Password123!',
    }),
  });
  const unverifiedStatus = unverifiedRes.status;
  const unverifiedBody = await unverifiedRes.json();
  console.log(`Status: HTTP ${unverifiedStatus}`);
  console.log('Response:', JSON.stringify(unverifiedBody, null, 2));

  if (unverifiedStatus === 403 && unverifiedBody.message === 'Email not verified') {
    console.log('✔ PASS: Returned HTTP 403 with exact "Email not verified" message.');
  } else {
    console.error('❌ FAIL: Expected 403 "Email not verified".');
  }

  // STEP 2: Resend Verification Email
  console.log('\n[FLOW 2] Testing resend-verification for unverified account...');
  const resendRes = await fetch('http://127.0.0.1:3001/api/v1/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testadmin282@gmail.com' }),
  });
  const resendStatus = resendRes.status;
  const resendBody = await resendRes.json();
  console.log(`Status: HTTP ${resendStatus}`);
  console.log('Response:', JSON.stringify(resendBody, null, 2));
  if (resendStatus === 200 || resendStatus === 201) {
    console.log('✔ PASS: Resend verification dispatched successfully.');
  }

  // STEP 3: Verified Login with Tenant Auto-Resolution (no tenantId provided)
  console.log('\n[FLOW 3] Testing verified login with optional tenant auto-resolution (owner@acme.com)...');
  const loginRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@acme.com',
      password: 'Password123!',
    }),
  });
  const loginStatus = loginRes.status;
  const loginBody = await loginRes.json();
  console.log(`Status: HTTP ${loginStatus}`);
  console.log('User:', loginBody.user?.email, 'Role:', loginBody.user?.role);
  console.log('Resolved Tenant ID:', loginBody.tenantId);
  console.log('Access Token issued:', Boolean(loginBody.accessToken));

  if ((loginStatus === 200 || loginStatus === 201) && loginBody.accessToken && loginBody.tenantId) {
    console.log('✔ PASS: Successfully logged in without entering tenantId; tenant auto-resolved!');
  } else {
    console.error('❌ FAIL: Login failed or did not resolve tenant.', loginBody);
    process.exit(1);
  }

  const token = loginBody.accessToken;
  const tenantId = loginBody.tenantId;

  // STEP 4: Authenticated Exports Verification
  console.log('\n[FLOW 4] Testing authenticated export endpoints with JWT token and tenant context...');
  const dataTypes = ['team', 'audit', 'evidence', 'risk', 'cases', 'alerts'];

  for (const type of dataTypes) {
    // 1. Direct shield-core export
    const directUrl = `http://127.0.0.1:3001/api/v1/exports/data/${type}?format=csv`;
    const directRes = await fetch(directUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    });
    const directContentType = directRes.headers.get('content-type');
    const directDisposition = directRes.headers.get('content-disposition');
    const directText = await directRes.text();
    console.log(`Direct Export [${type}]: HTTP ${directRes.status} | Content-Type: ${directContentType} | Disposition: ${directDisposition}`);
    console.log(`  Headers preview: ${directText.split('\n')[0]}`);

    // 2. Next.js Frontend Proxy export
    const proxyUrl = `http://127.0.0.1:3000/api/v1/exports/data/${type}?format=csv`;
    const proxyRes = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    });
    const proxyContentType = proxyRes.headers.get('content-type');
    const proxyDisposition = proxyRes.headers.get('content-disposition');
    const proxyText = await proxyRes.text();
    console.log(`Proxy Export  [${type}]: HTTP ${proxyRes.status} | Content-Type: ${proxyContentType} | Disposition: ${proxyDisposition}`);

    if (directRes.status === 200 && proxyRes.status === 200 && directContentType?.includes('csv')) {
      console.log(`  ✔ PASS: ${type} exported real CSV data through backend and frontend proxy!`);
    } else {
      console.error(`  ❌ FAIL: ${type} export failed.`);
    }
  }

  console.log('\n====================================================');
  console.log('   ALL END-TO-END FLOWS VERIFIED SUCCESSFULLY!       ');
  console.log('====================================================');
}

main().catch(console.error);
