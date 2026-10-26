import 'dotenv/config';

async function testRegistration() {
  const registerUrl = 'http://127.0.0.1:3001/api/v1/auth/register';
  console.log(`Testing duplicate registration against ${registerUrl}...`);

  const payload = {
    email: 'owner@acme.com',
    password: 'SecurePassword123!',
    fullName: 'Acme Test Duplicate',
    organizationName: 'Acme Corporation',
  };

  const res = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const status = res.status;
  const body = await res.json();

  console.log(`Response Status: HTTP ${status}`);
  console.log('Response Body:', JSON.stringify(body, null, 2));

  if (status === 409 && body.message?.includes('already exists')) {
    console.log('✔ SUCCESS: Duplicate registration returned HTTP 409 with user-friendly conflict message.');
  } else {
    console.error('❌ FAILURE: Did not receive expected 409 Conflict.');
    process.exit(1);
  }

  // Also test case-insensitive email normalization
  console.log('\nTesting case-insensitive duplicate check (OWNER@ACME.COM)...');
  const resCase = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, email: 'OWNER@ACME.COM' }),
  });
  console.log(`Case Normalized Status: HTTP ${resCase.status}`);
  const bodyCase = await resCase.json();
  console.log('Case Normalized Body:', JSON.stringify(bodyCase, null, 2));

  if (resCase.status === 409 && bodyCase.message?.includes('already exists')) {
    console.log('✔ SUCCESS: Case-insensitive email normalization correctly detected duplicate.');
  } else {
    console.error('❌ FAILURE: Case-insensitive duplicate check failed.');
    process.exit(1);
  }

  // Now test frontend proxy endpoint (http://127.0.0.1:3000/api/v1/auth/register)
  console.log('\nTesting duplicate registration through frontend proxy (port 3000)...');
  try {
    const resProxy = await fetch('http://127.0.0.1:3000/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`Frontend Proxy Status: HTTP ${resProxy.status}`);
    const bodyProxy = await resProxy.json();
    console.log('Frontend Proxy Body:', JSON.stringify(bodyProxy, null, 2));

    if (resProxy.status === 409 && bodyProxy.message?.includes('already exists')) {
      console.log('✔ SUCCESS: Frontend proxy properly forwarded HTTP 409 Conflict without falling back to demo response!');
    } else {
      console.error('❌ FAILURE: Frontend proxy did not forward 409 Conflict correctly.');
    }
  } catch (e) {
    console.log('Frontend proxy test note:', e.message);
  }
}

testRegistration().catch(console.error);
