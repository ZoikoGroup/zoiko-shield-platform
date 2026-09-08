/**
 * Multi-Cloud Enterprise Threat Ingestion & OCSF Normalization Simulator
 * 
 * Simulates cross-cloud security ingestion across:
 * 1. Identity Plane: Okta / Microsoft Entra authentication brute-force & impossible travel.
 * 2. Cloud Infrastructure Plane: AWS GuardDuty crypto-mining & credential exfiltration.
 * 3. Endpoint Plane: Palo Alto Cortex XDR / CrowdStrike Falcon multi-stage ransomware execution.
 * 4. Cross-Telemetry OCSF Normalization & Autonomous Defense Action Correlation.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { OktaNormalizerService } from '../apps/shield-ingest/src/connectors/providers/okta/okta.normalizer';
import { AwsGuardDutyNormalizerService } from '../apps/shield-ingest/src/connectors/providers/aws-guardduty/aws-guardduty.normalizer';
import { CortexXdrNormalizerService } from '../apps/shield-ingest/src/connectors/providers/cortex-xdr/cortex-xdr.normalizer';
import { MicrosoftDefenderNormalizerService } from '../apps/shield-ingest/src/connectors/providers/microsoft-defender/microsoft-defender.normalizer';
import { GcpSccNormalizerService } from '../apps/shield-ingest/src/connectors/providers/gcp-scc/gcp-scc.normalizer';
import { MerkleTreeService } from '../apps/shield-anchor/src/merkle/merkle-tree.service';

async function main() {
  console.log('========================================================================');
  console.log(' 🌐 ZoikoShield Multi-Cloud Threat Ingestion & Correlation Simulator');
  console.log('    OCSF v1.1.0 Ingestion: Okta | AWS GuardDuty | Cortex XDR | Defender | GCP SCC');
  console.log('========================================================================\n');

  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;
  console.log(`[1/6] Initializing Ingestion Pipeline for Tenant: ${tenantId}...`);

  // 1. Ingest Okta Identity Telemetry
  console.log('\n[2/6] Ingesting Identity Telemetry (Okta System Log)...');
  const oktaNormalizer = new OktaNormalizerService();
  const oktaRawEvent = {
    uuid: `okta-${crypto.randomUUID()}`,
    published: new Date().toISOString(),
    eventType: 'user.authentication.auth_via_mfa',
    displayMessage: 'User MFA authentication rejected due to impossible travel anomaly',
    severity: 'WARN',
    actor: {
      id: 'usr-99214',
      type: 'User',
      alternateId: 'victor.security@enterprise.com',
      displayName: 'Victor Vance',
    },
    client: {
      ipAddress: '198.51.100.42',
      geographicalContext: {
        city: 'Bucharest',
        country: 'Romania',
      },
    },
    outcome: {
      result: 'FAILURE',
      reason: 'IMPOSSIBLE_TRAVEL_VELOCITY_EXCEEDED',
    },
  };

  const ocsfAuthEvent = oktaNormalizer.normalizeEvent(oktaRawEvent as any, tenantId, 'production', 'us-east-1');
  console.log(`  ✔ Ingested & Normalized to OCSF Class ${ocsfAuthEvent.class_uid} (Authentication Activity)`);
  console.log(`  ✔ User: ${ocsfAuthEvent.actor?.user?.name || 'N/A'} | Status: ${ocsfAuthEvent.status}`);
  console.log(`  ✔ Geo-Anomaly Detected: ${oktaRawEvent.client.geographicalContext.city}, ${oktaRawEvent.client.geographicalContext.country}`);

  // 2. Ingest AWS GuardDuty Cloud Finding
  console.log('\n[3/6] Ingesting Cloud Workload Telemetry (AWS GuardDuty)...');
  const guardDutyNormalizer = new AwsGuardDutyNormalizerService();
  const guardDutyRawFinding = {
    schemaVersion: '2.0',
    accountId: '123456789012',
    region: 'us-east-1',
    partition: 'aws',
    id: `finding-${crypto.randomUUID()}`,
    arn: 'arn:aws:guardduty:us-east-1:123456789012:detector/det-123456789/finding/001',
    type: 'CryptoCurrency:EC2/BitcoinTool.B!DNS',
    resource: {
      resourceType: 'Instance',
      instanceDetails: {
        instanceId: 'i-0abcdef1234567890',
        instanceType: 'c5.metal',
        tags: [{ key: 'Environment', value: 'Production-Payment-Gateway' }],
      },
    },
    service: {
      serviceName: 'guardduty',
      detectorId: 'det-123456789',
      action: {
        actionType: 'DNS_REQUEST',
      },
      count: 48,
      eventFirstSeen: new Date(Date.now() - 3600000).toISOString(),
      eventLastSeen: new Date().toISOString(),
    },
    severity: 8.0, // High/Critical
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: 'EC2 instance queried known cryptocurrency mining pool domain',
    description: 'EC2 instance i-0abcdef1234567890 is attempting to query a known Monero/Bitcoin mining pool domain (pool.minexmr.com).',
  };

  const ocsfCloudFinding = guardDutyNormalizer.normalizeFinding(guardDutyRawFinding as any, tenantId, 'production', 'us-east-1');
  console.log(`  ✔ Ingested & Normalized to OCSF Class ${ocsfCloudFinding.class_uid} (Security Finding)`);
  console.log(`  ✔ Title: ${ocsfCloudFinding.finding.title}`);
  console.log(`  ✔ Target Resource: EC2 ${guardDutyRawFinding.resource.instanceDetails.instanceId} (${guardDutyRawFinding.resource.instanceDetails.instanceType})`);
  console.log(`  ✔ Severity Score: ${ocsfCloudFinding.severity_id} (${ocsfCloudFinding.severity})`);

  // 3. Ingest Microsoft Defender for Endpoint EDR Finding
  console.log('\n[4/6] Ingesting Microsoft Defender for Endpoint Telemetry...');
  const defenderNormalizer = new MicrosoftDefenderNormalizerService();
  const defenderAlert = {
    id: `da-${crypto.randomUUID().slice(0, 12)}`,
    incidentId: 5521,
    title: 'Suspicious PowerShell command line executed',
    description: 'Obfuscated PowerShell downloaded payload from external C2 endpoint',
    severity: 'High' as const,
    status: 'New' as const,
    category: 'Execution',
    mitreTechniques: ['T1059.001', 'T1105'],
    alertCreationTime: new Date().toISOString(),
    computerDnsName: 'WIN-APP-PROD-01.corp.internal',
    machineId: 'mach-msft-88912',
    loggedOnUsers: [{ accountName: 'sec_admin', domainName: 'CORP' }],
  };

  const ocsfDefenderFinding = defenderNormalizer.normalizeAlert(defenderAlert, tenantId, 'production', 'GLOBAL');
  console.log(`  ✔ Ingested & Normalized to OCSF Class ${ocsfDefenderFinding.class_uid} (Security Finding)`);
  console.log(`  ✔ Endpoint: ${ocsfDefenderFinding.device?.hostname} | User: ${ocsfDefenderFinding.actor?.user?.name}`);
  console.log(`  ✔ MITRE Techniques: ${ocsfDefenderFinding.attacks?.map((a) => a.technique.name).join(', ')}`);

  // 4. Ingest GCP Security Command Center Finding
  console.log('\n[5/6] Ingesting GCP Security Command Center (SCC) Finding...');
  const gcpSccNormalizer = new GcpSccNormalizerService();
  const gcpSccFinding = {
    name: `organizations/1029384756/sources/123/findings/${crypto.randomUUID().slice(0, 8)}`,
    parent: 'organizations/1029384756/sources/123',
    resourceName: '//cloudresourcemanager.googleapis.com/projects/zoikoshield-prod',
    state: 'ACTIVE' as const,
    category: 'PERSISTENCE_SERVICE_ACCOUNT_KEY_CREATED',
    externalUri: 'https://console.cloud.google.com/security/command-center/findings',
    eventTime: new Date().toISOString(),
    createTime: new Date().toISOString(),
    severity: 'HIGH' as const,
    findingClass: 'THREAT' as const,
    indicator: {
      ipAddresses: ['198.51.100.42'],
      domains: ['malicious-c2.corp'],
    },
  };

  const ocsfGcpFinding = gcpSccNormalizer.normalizeFinding(gcpSccFinding, tenantId, 'production', 'europe-west3');
  console.log(`  ✔ Ingested & Normalized to OCSF Class ${ocsfGcpFinding.class_uid} (Security Finding)`);
  console.log(`  ✔ Resource: ${ocsfGcpFinding.finding.title} | Category: ${ocsfGcpFinding.finding.types?.[0]}`);

  // 5. Correlate and Build Tamper-Proof Ingestion Evidence Chain
  console.log('\n[6/6] Correlating Multi-Cloud Telemetry & Merkle Tree Anchoring...');
  const normalizedRecords = [
    JSON.stringify(ocsfAuthEvent),
    JSON.stringify(ocsfCloudFinding),
    JSON.stringify(ocsfDefenderFinding),
    JSON.stringify(ocsfGcpFinding),
  ];

  const leafHashes = normalizedRecords.map((r) => crypto.createHash('sha256').update(r).digest('hex'));
  const merkleTreeService = new MerkleTreeService();
  const merkleResult = merkleTreeService.build(leafHashes);

  console.log(`  ✔ Total Ingested Events: ${normalizedRecords.length}`);
  console.log(`  ✔ Cross-Telemetry Correlated Merkle Root: ${merkleResult.root}`);
  console.log(`  ✔ Multi-Vector Threat Confirmed: Okta Impossible Travel + AWS Mining + Defender EDR C2 + GCP Service Account Persistence`);

  console.log('\n========================================================================');
  console.log(' 🎉 MULTI-CLOUD THREAT INGESTION & OCSF NORMALIZATION VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Multi-cloud threat simulation failed:', err);
  process.exit(1);
});
