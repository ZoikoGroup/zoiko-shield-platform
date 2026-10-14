// End-to-end interactive flow verification for ZoikoShield Platform demo presentations
const BASE = "http://localhost:3000";

async function test(name, fn) {
  try {
    process.stdout.write(`Testing ${name}... `);
    await fn();
    console.log("✓ PASS");
    return true;
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log("\n========================================================");
  console.log("   ZoikoShield End-to-End Interactive Flow Verification");
  console.log("========================================================\n");

  let passes = 0;
  let total = 0;

  // Flow 1: JIT Elevation & WebAuthn
  total++;
  if (await test("1.1 Step-Up Options Challenge", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/passkeys/step-up/options`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.challenge || typeof json.challenge !== "string") throw new Error("Missing challenge");
  })) passes++;

  total++;
  if (await test("1.2 JIT Elevation Request", async () => {
    const res = await fetch(`${BASE}/api/v1/authz/jit/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetTenantId: "tenant-acme-prod-01", statedPurpose: "Emergency triage", requestedDurationMinutes: 60 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.requestId) throw new Error("Missing requestId");
  })) passes++;

  total++;
  if (await test("1.3 JIT Step-Up Assertion Verification", async () => {
    const res = await fetch(`${BASE}/api/v1/authz/jit/jit-test-01/stepup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: "cred-01", clientDataJsonBase64: "dGVzdA==", authenticatorDataBase64: "dGVzdA==", signatureBase64: "dGVzdA==" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.verified !== true) throw new Error("Expected verified: true");
  })) passes++;

  total++;
  if (await test("1.4 JIT Session Revocation", async () => {
    const res = await fetch(`${BASE}/api/v1/authz/jit/jit-test-01/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revocationReason: "Operator completed triage" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.revoked !== true) throw new Error("Expected revoked: true");
  })) passes++;

  // Flow 2: Audit Packages & Offline Verifier
  total++;
  if (await test("2.1 List Audit Packages", async () => {
    const res = await fetch(`${BASE}/api/v1/audit-packages`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("Expected array of packages");
  })) passes++;

  total++;
  if (await test("2.2 Generate Sealed Audit Package", async () => {
    const res = await fetch(`${BASE}/api/v1/audit-packages`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.packageHash && !json.id) throw new Error("Expected package structure");
  })) passes++;

  // Flow 3: SOAR Response Proposals & Emergency Freeze
  total++;
  if (await test("3.1 Emergency SOAR Freeze", async () => {
    const res = await fetch(`${BASE}/api/v1/response/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "ALL_ACTIVE_PLAYBOOKS", reason: "Demonstration containment" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.frozen !== true) throw new Error("Expected frozen: true");
  })) passes++;

  total++;
  if (await test("3.2 Release SOAR Freeze", async () => {
    const res = await fetch(`${BASE}/api/v1/response/unfreeze`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.frozen !== false) throw new Error("Expected frozen: false");
  })) passes++;

  // Flow 4: G1 Gate & DR Restore Drill
  total++;
  if (await test("4.1 G1 Launch Gate Roster", async () => {
    const res = await fetch(`${BASE}/api/v1/launch-gate/roster`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.approvers || !Array.isArray(json.approvers)) throw new Error("Expected approvers roster");
  })) passes++;

  total++;
  if (await test("4.2 Non-Destructive DR Restore Drill", async () => {
    const res = await fetch(`${BASE}/api/v1/observability/disaster-recovery/restore-drill`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.receiptId) throw new Error("Expected drill receiptId");
  })) passes++;

  // Flow 5: AI Safety & Governance
  total++;
  if (await test("5.1 AI Security Incidents List", async () => {
    const res = await fetch(`${BASE}/api/v1/ai/incidents?tenantId=tenant-acme-prod-01`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  })) passes++;

  total++;
  if (await test("5.2 AI Model Armor Status", async () => {
    const res = await fetch(`${BASE}/api/v1/ai/model-armor/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  })) passes++;

  console.log("\n========================================================");
  console.log(`   Interactive Flow Test Summary: ${passes} / ${total} Passed`);
  console.log("========================================================\n");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
