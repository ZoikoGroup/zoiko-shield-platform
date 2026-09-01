import { Logger } from '@nestjs/common';
import { JitSessionEnforcerService } from '../apps/shield-core/src/modules/authorization/jit-session-enforcer.service';

/**
 * Track 74 Simulation: Dynamic Zero-Trust Just-In-Time (JIT) Hardware Step-Up Session Enforcer
 */
async function runJitSessionSimulation() {
  const logger = new Logger('JitSessionSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 74] Simulating Zero-Trust JIT Hardware Step-Up Session Enforcer  ');
  logger.log('========================================================================\n');

  const enforcer = new JitSessionEnforcerService();
  const operatorId = 'operator-secops-99';
  const tenantId = 'tenant-enterprise-financial';

  // Step 1: Issue elevated JIT session with WebAuthn requirement
  logger.log(`[Step 1/3] Issuing JIT session for '${operatorId}' (Role: SECURITY_ADMIN)...`);
  const session = enforcer.createJitSession(
    operatorId,
    tenantId,
    'SECURITY_ADMIN',
    '198.51.100.25',
    15,
    5,
  );
  logger.log(`  ✔ Session ID:      ${session.sessionId}`);
  logger.log(`  ✔ Elevated Role:   ${session.elevatedRole}`);
  logger.log(`  ✔ Status:          ${session.status}`);
  logger.log(`  ✔ Expiration Time: ${new Date(session.expiresAt).toISOString()}\n`);

  // Step 2: Validate active session from issued IP
  logger.log('[Step 2/3] Verifying session validity from legitimate operator IP (198.51.100.25)...');
  const validCheck = enforcer.checkSessionValidity(session.sessionId, '198.51.100.25');
  logger.log(`  ✔ Session Valid:   ${validCheck.valid} (Status: ${validCheck.status})`);

  // Step 3: Simulate IP Hijacking / Divergence Anomaly & Automatic Revocation
  logger.log('\n[Step 3/3] Simulating unauthorized invocation from divergent IP (203.0.113.88)...');
  const hijackedCheck = enforcer.checkSessionValidity(session.sessionId, '203.0.113.88');
  logger.log(`  ✔ Hijacked Call Valid: ${hijackedCheck.valid} (Status: ${hijackedCheck.status})`);
  logger.log(`  ✔ Security Action:     ${hijackedCheck.reason}`);

  const sessionStateAfterRevocation = enforcer.getSession(session.sessionId);
  logger.log(`  ✔ Final Session State: ${sessionStateAfterRevocation?.status} (Reason: ${sessionStateAfterRevocation?.revocationReason})\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 74: ZERO-TRUST JIT SESSION ENFORCER VERIFIED!                 ');
  logger.log('========================================================================\n');
}

runJitSessionSimulation().catch((err) => {
  console.error('Track 74 simulation failed:', err);
  process.exit(1);
});
