/**
 * Enterprise Transactional Email & Multi-Channel Notification Simulator
 * 
 * Simulates:
 * 1. 75% and 90% Telemetry Meter Exhaustion Email Alerts.
 * 2. Cross-Region Roaming Ingest Notification.
 * 3. Security Incident Update and Compliance Jurisdiction Updates.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { TransactionalEmailService } from '../apps/shield-core/src/modules/notification/transactional-email.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Enterprise Notification & Email Engine Simulator');
  console.log('    Specification: ZS-T0-BE-ARCH-001 §12 (Transactional Communications)');
  console.log('========================================================================\n');

  const emailService = new TransactionalEmailService();
  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  const tenantName = 'Apex FinTech Global LLC';

  console.log(`[1/4] Disagreeing Telemetry Threshold Notification (75% Warning)...`);
  const r1 = await emailService.dispatchTransactionalEmail({
    tenantId,
    templateKey: 'USG/UsageThreshold75Percent',
    recipients: [{ email: 'finops@apexfintech.com', name: 'FinOps Team' }],
    variables: {
      tenantId,
      tenantName,
      consumedGb: 750,
      limitGb: 1000,
      resetDate: 'October 31, 2026',
    },
  });
  console.log(`  ✔ Receipt ID: ${r1.receiptId}`);
  console.log(`  ✔ Subject: ${r1.subject}`);
  console.log(`  ✔ Content Digest: ${r1.contentDigest.slice(0, 24)}... (Status: ${r1.deliveryStatus})`);

  console.log(`\n[2/4] Disagreeing Critical Usage Threshold Notification (90% Alert)...`);
  const r2 = await emailService.dispatchTransactionalEmail({
    tenantId,
    templateKey: 'USG/UsageThreshold90Percent',
    recipients: [{ email: 'ciso@apexfintech.com', name: 'Chief Security Officer' }],
    variables: {
      tenantId,
      tenantName,
      consumedGb: 920,
      limitGb: 1000,
    },
  });
  console.log(`  ✔ Receipt ID: ${r2.receiptId}`);
  console.log(`  ✔ Subject: ${r2.subject}`);

  console.log(`\n[3/4] Cross-Region Roaming Ingest Notification...`);
  const r3 = await emailService.dispatchTransactionalEmail({
    tenantId,
    templateKey: 'USG/RoamingUsageStarted',
    recipients: [{ email: 'secops@apexfintech.com', name: 'SecOps On-Call' }],
    variables: {
      region: 'ap-southeast-1',
      connectorKey: 'aws-cloudtrail-singapore-collector',
    },
  });
  console.log(`  ✔ Receipt ID: ${r3.receiptId}`);
  console.log(`  ✔ Subject: ${r3.subject}`);

  console.log(`\n[4/4] SOC Incident Update & Containment Notification...`);
  const r4 = await emailService.dispatchTransactionalEmail({
    tenantId,
    templateKey: 'SUP/IncidentUpdate',
    recipients: [
      { email: 'incident-lead@apexfintech.com', name: 'Incident Commander' },
      { email: 'compliance@apexfintech.com', name: 'Compliance Officer' },
    ],
    variables: {
      incidentTitle: 'Automated Quarantine of Compromised Workload VM',
      incidentSeverity: 'CRITICAL',
      incidentStatus: 'CONTAINED',
      remediationAction: 'ISOLATE_ENDPOINT',
    },
  });
  console.log(`  ✔ Receipt ID: ${r4.receiptId}`);
  console.log(`  ✔ Recipients Count: ${r4.recipientsCount}`);
  console.log(`  ✔ Subject: ${r4.subject}`);

  console.log('\n========================================================================');
  console.log(' 🎉 ENTERPRISE NOTIFICATION & EMAIL SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Notification simulation failed:', err);
  process.exit(1);
});
