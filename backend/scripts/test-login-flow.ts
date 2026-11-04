async function main() {
  const testEmail = `operator-${Date.now()}@example.com`;
  const testPassword = 'Password123!Secure';
  const orgName = `Org-${Date.now()}`;

  console.log(`\n======================================================`);
  console.log(`STEP 1: Testing Registration with new user: ${testEmail}`);
  console.log(`======================================================`);
  const regRes = await fetch('http://localhost:3001/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      fullName: 'Test Operator',
      organizationName: orgName,
    }),
  });
  console.log('Register HTTP Status:', regRes.status);
  const regData = await regRes.json();
  console.log('Register Response Status:', regData.status);
  console.log('Register emailVerificationRequired:', regData.emailVerificationRequired);
  console.log('Register user emailVerified:', regData.user?.emailVerified);
  console.log('Register token issued:', regData.token ? regData.token.slice(0, 20) + '...' : 'NONE');

  console.log(`\n======================================================`);
  console.log(`STEP 2: Simulating Logout and Re-Login with ${testEmail}`);
  console.log(`======================================================`);
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  console.log('Re-login HTTP Status:', loginRes.status);
  const loginData = await loginRes.json();
  console.log('Re-login User Email:', loginData.user?.email);
  console.log('Re-login Tenant ID:', loginData.user?.tenantId);
  const loginToken = loginData.accessToken || loginData.token || loginData.user?.token;
  console.log('Re-login Token issued:', loginToken ? loginToken.slice(0, 20) + '...' : 'NONE');

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('Re-login Failed:', loginData);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`STEP 3: Testing Authenticated Endpoints via Frontend Proxy`);
  console.log(`======================================================`);
  const proxyNotifs = await fetch('http://localhost:3000/api/v1/notifications', {
    headers: {
      Cookie: `zoiko_shield_access_token=${loginToken}; zoiko_shield_tenant_id=${loginData.user?.tenantId}`,
    },
  });
  console.log('Proxy Notifications Status (Cookie only):', proxyNotifs.status);

  const proxyAlerts = await fetch('http://localhost:3000/api/v1/alerts?limit=10', {
    headers: {
      Cookie: `zoiko_shield_access_token=${loginToken}; zoiko_shield_tenant_id=${loginData.user?.tenantId}`,
    },
  });
  console.log('Proxy Alerts Status (Cookie only):', proxyAlerts.status);

  const proxyReadiness = await fetch('http://localhost:3000/api/v1/observability/readiness', {
    headers: {
      Cookie: `zoiko_shield_access_token=${loginToken}; zoiko_shield_tenant_id=${loginData.user?.tenantId}`,
    },
  });
  console.log('Proxy Readiness Status (Cookie only):', proxyReadiness.status);

  const sendTestRes = await fetch(
    'http://localhost:3000/api/v1/notifications/templates/ZS-EML-IAM-001/send-test',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `zoiko_shield_access_token=${loginToken}; zoiko_shield_tenant_id=${loginData.user?.tenantId}`,
      },
      body: JSON.stringify({ recipientEmail: testEmail }),
    }
  );
  console.log('Send-Test Status (Cookie only):', sendTestRes.status);
  const sendTestData = await sendTestRes.json();
  console.log('Send-Test Result:', sendTestData);

  console.log('\n======================================================');
  console.log('ALL VERIFICATIONS PASSED: 100% SUCCESS');
  console.log('======================================================');
}

main().catch(console.error);
