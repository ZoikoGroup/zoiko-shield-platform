/**
 * Graph-Based Lateral Movement & Attack Path Discovery Engine Simulator
 * 
 * Simulates:
 * 1. Building multi-cloud asset & IAM identity relationship topology graph.
 * 2. Simulating initial compromise of an edge developer account.
 * 3. Discovering shortest attack path to critical production crown-jewel assets.
 * 4. Identifying critical choke point nodes and emitting remediation advice.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { AttackPathDiscoveryService } from '../apps/shield-ai/src/graph/attack-path-discovery.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Graph-Based Attack Path Discovery Engine Simulator');
  console.log('    Specification: ZS-AI-SEC-001 §7 & ZS-SOC-FEED-001 §8');
  console.log('========================================================================\n');

  const graphService = new AttackPathDiscoveryService();

  console.log('[1/3] Ingesting Multi-Cloud Asset & Identity Relationship Graph...');
  graphService.addNode({ id: 'user-contractor-jdoe', name: 'Contractor Dev Account (John Doe)', type: 'IDENTITY_USER' });
  graphService.addNode({ id: 'vm-staging-bastion', name: 'Staging Bastion Host (AWS us-east-1)', type: 'COMPUTE_INSTANCE' });
  graphService.addNode({ id: 'role-eks-cluster-deployer', name: 'EKS Cluster Deployer Role', type: 'IAM_ROLE' });
  graphService.addNode({ id: 'k8s-payment-pod', name: 'Payment Processing Service Pod', type: 'COMPUTE_INSTANCE' });
  graphService.addNode({ id: 'role-pci-vault-accessor', name: 'PCI HSM Key Vault Accessor Role', type: 'IAM_ROLE' });
  graphService.addNode({ id: 'db-pci-cardholder-vault', name: 'PCI-DSS Cardholder Production Vault', type: 'DATABASE', isCrownJewel: true });

  graphService.addEdge({ sourceId: 'user-contractor-jdoe', targetId: 'vm-staging-bastion', relationship: 'CAN_EXECUTE', weight: 1 });
  graphService.addEdge({ sourceId: 'vm-staging-bastion', targetId: 'role-eks-cluster-deployer', relationship: 'ASSUMES_ROLE', weight: 1 });
  graphService.addEdge({ sourceId: 'role-eks-cluster-deployer', targetId: 'k8s-payment-pod', relationship: 'CAN_EXECUTE', weight: 1 });
  graphService.addEdge({ sourceId: 'k8s-payment-pod', targetId: 'role-pci-vault-accessor', relationship: 'ASSUMES_ROLE', weight: 1 });
  graphService.addEdge({ sourceId: 'role-pci-vault-accessor', targetId: 'db-pci-cardholder-vault', relationship: 'KEY_DECRYPT_PERMISSION', weight: 1 });

  console.log('  ✔ Loaded 6 nodes across Identity, Compute, IAM Roles, and Production Vaults.');
  console.log('  ✔ Loaded 5 lateral privilege transition edges.');

  console.log('\n[2/3] Simulating Compromised Identity: user-contractor-jdoe...');
  console.log('  ➔ Executing Graph Traversal to Target: db-pci-cardholder-vault [CROWN JEWEL]');

  const discoveredPath = graphService.findShortestAttackPath('user-contractor-jdoe', 'db-pci-cardholder-vault');

  if (discoveredPath) {
    console.log(`\n[3/3] Critical Lateral Attack Path Discovered! (Path ID: ${discoveredPath.pathId})`);
    console.log(`  ✔ Total Hops: ${discoveredPath.pathHops.length}`);
    console.log(`  ✔ Calculated Blast-Radius Risk Score: ${discoveredPath.totalRiskScore}/100 (CRITICAL)`);
    console.log(`  ✔ Traversal Chain:`);
    for (let i = 0; i < discoveredPath.pathHops.length; i++) {
      const hop = discoveredPath.pathHops[i];
      console.log(`     Hop #${i + 1}: [${hop.from}] ──(${hop.relationship})──> [${hop.to}]`);
    }

    console.log(`\n  🎯 Critical Attack Choke Point Node: ${discoveredPath.criticalChokePointNodeId}`);
    console.log(`  💡 Remediation: ${discoveredPath.remediationRecommendation}`);
    console.log(`  🔒 Analysis Attestation Digest: ${discoveredPath.analysisDigest}`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 ATTACK PATH DISCOVERY ENGINE SIMULATION COMPLETED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Attack path simulation failed:', err);
  process.exit(1);
});
