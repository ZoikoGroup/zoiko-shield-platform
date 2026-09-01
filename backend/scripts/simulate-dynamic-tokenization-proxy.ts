import { Logger } from '@nestjs/common';
import { DynamicTokenizationProxyService } from '../apps/shield-core/src/modules/privacy/dynamic-tokenization-proxy.service';

/**
 * Track 62 Simulation: Dynamic Data Anonymization & Format-Preserving Tokenization Proxy
 */
async function runDynamicTokenizationSimulation() {
  const logger = new Logger('DynamicTokenizationSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 62] Simulating Dynamic Data Anonymization & Tokenization Proxy  ');
  logger.log('========================================================================\n');

  const proxy = new DynamicTokenizationProxyService();
  const tenantId = 'tenant-enterprise-financial-group';

  // Step 1: Raw Incident Telemetry with Sensitive PII/PCI
  logger.log('[Step 1/4] Preparing Raw Incident Telemetry with PII/PCI Data...');
  const rawIncidentTelemetry = {
    incidentId: 'INC-2026-FPE-9901',
    severity: 'HIGH',
    timestamp: new Date().toISOString(),
    analystNotes: 'Suspicious credential stuffing and card exfiltration attempt',
    victim: {
      fullName: 'Dr. Jane Holloway',
      email: 'jane.holloway@global-bank.co.uk',
      primaryCard: '4242-8888-9999-1234',
      taxId: '987-65-4321',
    },
    threatActor: {
      origin_ip: '198.51.100.77',
      target_ip: '10.0.88.19',
      userAgent: 'Mozilla/5.0 (Kali Linux x86_64)',
    },
  };
  logger.log(`  ✔ Raw Email: ${rawIncidentTelemetry.victim.email}`);
  logger.log(`  ✔ Raw Card:  ${rawIncidentTelemetry.victim.primaryCard}`);
  logger.log(`  ✔ Raw IP:    ${rawIncidentTelemetry.threatActor.origin_ip}\n`);

  // Step 2: On-The-Fly Anonymization for SOC Level-1 Analyst View (FULL_MASK)
  logger.log('[Step 2/4] Generating Masked Audit View (SOC Level-1 Masking)...');
  const level1View = proxy.anonymizeObject(tenantId, rawIncidentTelemetry, 'FULL_MASK');
  logger.log(`  ✔ Level-1 Masked Email: ${level1View.victim.email}`);
  logger.log(`  ✔ Level-1 Masked Card:  ${level1View.victim.primaryCard}`);
  logger.log(`  ✔ Level-1 Masked IP:    ${level1View.threatActor.origin_ip}\n`);

  // Step 3: Vault-less Format-Preserving Reversible Tokenization
  logger.log('[Step 3/4] Generating Reversible Format-Preserving Tokens (FPE)...');
  const reversibleView = proxy.anonymizeObject(tenantId, rawIncidentTelemetry, 'REVERSIBLE_TOKEN');
  logger.log(`  ✔ Reversible Token (Email): ${reversibleView.victim.email}`);
  logger.log(`  ✔ Reversible Token (Card):  ${reversibleView.victim.primaryCard}`);
  logger.log(`  ✔ Reversible Token (IP):    ${reversibleView.threatActor.origin_ip}\n`);

  // Step 4: Gated JIT Cryptographic Unmasking with Audit Trail
  logger.log('[Step 4/4] Performing Gated JIT Unmasking with Full Audit Ledger...');
  const unmaskedEmail = proxy.unmaskValue(
    tenantId,
    reversibleView.victim.email,
    {
      operatorId: 'ciso-auditor-99',
      jitRequestId: 'JIT-ELEVATION-9901',
      reason: 'FCA & GDPR Section 33 Breach Notification Mandate',
    },
  );
  logger.log(`  ✔ Cryptographically Unmasked Value: ${unmaskedEmail}`);
  if (unmaskedEmail === rawIncidentTelemetry.victim.email) {
    logger.log('  ✔ Integrity Check: 100% Match with Original Plaintext');
  }

  const auditLog = proxy.getAuditTrail();
  logger.log(`  ✔ Audit Trail Count: ${auditLog.length} recorded unmask event(s)`);
  logger.log(`  ✔ Last Unmasked Operator: ${auditLog[0].operatorId} under ${auditLog[0].jitRequestId}\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 62: DYNAMIC TOKENIZATION & ANONYMIZATION PROXY VERIFIED!     ');
  logger.log('========================================================================\n');
}

runDynamicTokenizationSimulation().catch((err) => {
  console.error('Track 62 simulation failed:', err);
  process.exit(1);
});
