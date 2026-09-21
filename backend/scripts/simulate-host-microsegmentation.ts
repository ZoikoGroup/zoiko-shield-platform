/**
 * Distributed Host Microsegmentation & Adaptive Network Policy Simulator
 * Specification: Backend Build Guide §LAB 13 (Host Network Microsegmentation)
 */

import { HostNetworkEnforcerService } from '../apps/shield-action/src/microsegmentation/host-network-enforcer.service';

async function main() {
  console.log('\n================================================================');
  console.log(' 🛡️  ZoikoShield Distributed Host Microsegmentation Simulator');
  console.log('    Specification: §13 (Zero-Trust Network Microsegmentation)');
  console.log('================================================================\n');

  const enforcerService = new HostNetworkEnforcerService();
  const tenantId = '00000000-0000-4000-8000-000000000001';

  // 1. Apply Fine-Grained Least-Privilege Network Rule
  console.log('[Step 1] Applying Host Microsegmentation Policy...');
  const ruleReceipt = enforcerService.applyMicrosegmentationRule({
    tenantId,
    sourcePodSelector: 'app=order-worker',
    destinationCidrOrPod: 'app=payment-vault',
    destinationPort: 8443,
    protocol: 'TCP',
    action: 'ALLOW',
    priority: 10,
  });

  console.log(`  ✔ Policy Receipt: ${ruleReceipt.receiptId}`);
  console.log(`  ✔ Hook Type: ${ruleReceipt.hookType}`);
  console.log(`  ✔ Policy Index: 0x${ruleReceipt.policyIndex.toString(16)}`);
  console.log(`  ✔ Attestation Digest: ${ruleReceipt.attestationDigest}\n`);

  // 2. Emergency Host Network Quarantine on Compromised Pod
  console.log('[Step 2] Executing Emergency Host Network Isolation...');
  const quarantineReceipt = enforcerService.quarantinePodNetwork(
    tenantId,
    'app=compromised-worker-pod',
  );

  console.log(`  ✔ Quarantine Receipt: ${quarantineReceipt.receiptId}`);
  console.log(`  ✔ Action Enforced: ${quarantineReceipt.enforcedAction}`);
  console.log(`  ✔ Target Pod: ${quarantineReceipt.targetPodSelector}`);
  console.log(`  ✔ Attestation Digest: ${quarantineReceipt.attestationDigest}\n`);

  // 3. Inspect Active Policy Table
  console.log('[Step 3] Active Host Network Policies:');
  const activeRules = enforcerService.getActiveRules(tenantId);
  console.table(
    activeRules.map((r) => ({
      ruleId: r.ruleId,
      source: r.sourcePodSelector,
      destination: r.destinationCidrOrPod,
      port: r.destinationPort,
      action: r.action,
      priority: r.priority,
    })),
  );

  console.log('\n================================================================');
  console.log(' 🎉 HOST MICROSEGMENTATION SIMULATION COMPLETED!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('❌ Host microsegmentation simulation failed:', err);
  process.exit(1);
});
