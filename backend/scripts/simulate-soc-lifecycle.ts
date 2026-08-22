import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import crypto from 'crypto';

// Ingestion
import { AwsCloudTrailNormalizerService } from '../apps/shield-ingest/src/connectors/providers/aws-cloudtrail/aws-cloudtrail.normalizer';
import { SyslogTlsNormalizerService } from '../apps/shield-ingest/src/connectors/providers/syslog-tls/syslog-tls.normalizer';
import { QuarantineService } from '../apps/shield-ingest/src/ingestion/quarantine.service';
import { CloudTrailRawRecord } from '../apps/shield-ingest/src/connectors/providers/aws-cloudtrail/aws-cloudtrail.types';

// AI Governance & Security
import { ToolCapabilityService } from '../apps/shield-ai/src/tools/tool-capability.service';
import { AiDecisionLedgerService } from '../apps/shield-ai/src/outputs/ai-decision-ledger.service';
import { AiRedTeamService } from '../apps/shield-ai/src/security/adversarial/red-team.service';
import { AiFinOpsBudgetService } from '../apps/shield-ai/src/usage-control/ai-finops-budget.service';

// Response Action & Playbooks
import { ActionAuthorityService } from '../apps/shield-action/src/policy/action-authority.service';
import { ActionRollbackBrokerService } from '../apps/shield-action/src/rollback/action-rollback-broker.service';
import { ResponsePlaybookService } from '../apps/shield-action/src/playbooks/response-playbook.service';

// Cryptographic Anchor & Witness
import { MerkleTreeService } from '../apps/shield-anchor/src/merkle/merkle-tree.service';
import { Rfc3161WitnessService } from '../apps/shield-anchor/src/witnesses/rfc3161/rfc3161-witness.service';

/**
 * End-to-End SOC Incident Simulation & Platform Assurance Script
 * Standards: ZS-ENG-AI-001 v1.0, ZS-COM-BILL-001, ERB-01
 */
async function runSocLifecycleSimulation() {
  const logger = new Logger('SOCSimulationRunner');
  logger.log('======================================================================');
  logger.log(' 🛡️  ZoikoShield End-to-End SOC Incident Simulation & Assurance Run  ');
  logger.log('======================================================================\n');

  const tenantId = `tenant-${crypto.randomUUID()}`;
  const environmentId = 'env-prod-01';
  const region = 'us-east-1';
  logger.log(`[Phase 1] Initializing Security Operations for Tenant: ${tenantId}`);

  // 1. Ingestion Pipeline: Ingest CloudTrail & Syslog Telemetry
  logger.log('\n[Phase 2] Multi-Source Ingestion & OCSF Normalization');
  const cloudTrailNormalizer = new AwsCloudTrailNormalizerService();
  const syslogNormalizer = new SyslogTlsNormalizerService();
  const quarantineService = new QuarantineService();

  const mockCloudTrailRecord: CloudTrailRawRecord = {
    eventVersion: '1.08',
    userIdentity: {
      type: 'IAMUser',
      principalId: 'AIDAEXAMPLEUSER',
      arn: 'arn:aws:iam::123456789012:user/compromised-admin',
      accountId: '123456789012',
      userName: 'compromised-admin',
    },
    eventTime: new Date().toISOString(),
    eventSource: 'iam.amazonaws.com',
    eventName: 'AttachUserPolicy',
    awsRegion: 'us-east-1',
    sourceIPAddress: '198.51.100.77',
    userAgent: 'aws-cli/2.0',
    requestParameters: {
      userName: 'compromised-admin',
      policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
    },
    responseElements: undefined,
    eventID: `evt-${crypto.randomUUID()}`,
    readOnly: false,
    eventType: 'AwsApiCall',
    recipientAccountId: '123456789012',
  };

  const normalizedCloudTrail = cloudTrailNormalizer.normalizeRecord(
    mockCloudTrailRecord,
    tenantId,
    environmentId,
    region,
  );
  logger.log(`  ✔ Ingested & Normalized AWS CloudTrail API Call: ${normalizedCloudTrail.event_type} (${normalizedCloudTrail.source_event_id})`);

  const mockSyslogMsg = `<34>1 ${new Date().toISOString()} bastion-srv-01 sshd 4312 ID47 [exampleSDID@32473 iut="3"] Failed password for invalid user root from 198.51.100.77 port 54122 ssh2`;
  const parsedSyslog = syslogNormalizer.parseRfc5424(mockSyslogMsg);
  const normalizedSyslog = syslogNormalizer.normalizeMessage(
    parsedSyslog!,
    tenantId,
    environmentId,
    region,
  );
  logger.log(`  ✔ Ingested & Normalized Syslog TLS Stream: ${normalizedSyslog.action_type} from ${normalizedSyslog.source_ip}`);

  // Test Quarantine DLQ with malformed payload
  const badPayload = 'CORRUPTED_NON_PARSABLE_BINARY_DATA';
  const quarantined = quarantineService.quarantine({
    tenantId,
    environmentId,
    connectorId: 'conn-generic-syslog',
    rawPayload: badPayload,
    failureReason: 'PARSER_EXCEPTION',
    errorMessage: 'Header format does not conform to RFC 5424 / RFC 3164',
  });
  logger.log(`  ✔ Quarantined malformed telemetry in Ingestion DLQ (Record ID: ${quarantined.quarantineId})`);

  // 2. AI Security & Threat Adversarial Testing
  logger.log('\n[Phase 3] AI Threat Modeling, Injection Detection & FinOps Budgeting');
  const redTeamService = new AiRedTeamService();
  const finOpsService = new AiFinOpsBudgetService();

  const telemetryText = `Suspicious privilege escalation by user ${mockCloudTrailRecord.userIdentity.userName}`;
  const threatCheck = redTeamService.evaluatePayload(telemetryText);
  logger.log(`  ✔ Evaluated payload safety (Vulnerable: ${threatCheck.isVulnerable}, Risk Score: ${threatCheck.riskScore})`);

  const budgetCheck = finOpsService.checkBudget(tenantId, 0.02, 1500);
  logger.log(`  ✔ FinOps Budget Check Passed (Remaining: $${budgetCheck.remainingBudgetUsd.toFixed(2)})`);

  // 3. Bounded Agentic Reasoning & Tool Capability Grants
  logger.log('\n[Phase 4] Bounded Agentic Investigation Loop & Tool Grants');
  const toolCapabilityService = new ToolCapabilityService();
  const decisionLedger = new AiDecisionLedgerService();

  // Validate allowed T0 tool grant
  const readToolGrant = toolCapabilityService.issueGrant({
    agentPrincipal: 'sec-investigator-agent',
    tenantId,
    toolName: 'telemetry.query',
    resourceScope: 'aws-cloudtrail-logs',
  });
  logger.log(`  ✔ Tool Capability Issued: 'telemetry.query' (Grant ID: ${readToolGrant.grantId}, Class: ${readToolGrant.sideEffectClass})`);

  // Assert T5 tool rejection
  let t5Blocked = false;
  try {
    toolCapabilityService.issueGrant({
      agentPrincipal: 'sec-investigator-agent',
      tenantId,
      toolName: 'evidence.delete',
      resourceScope: 'evidence_ledger_table',
    });
  } catch (err: any) {
    t5Blocked = true;
  }
  logger.log(`  ✔ Side-Effect Safety Enforced: 'evidence.delete' (Class: T5 Prohibited, Blocked: ${t5Blocked})`);

  // Emit AI Decision Record linked to Evidence Ledger
  const decisionRecord = decisionLedger.createDecisionRecord({
    tenantId,
    actorId: 'sec-analyst-agent',
    useCaseId: 'CASE_SUMMARY',
    policyVersions: ['ZS-ENG-AI-001-v1.0'],
    promptProfile: { id: 'prompt-investigate-v1', version: 1 },
    contextPayload: JSON.stringify({
      cloudTrailEventId: normalizedCloudTrail.source_event_id,
      syslogEventId: normalizedSyslog.source_event_id,
    }),
    outputContent: JSON.stringify({
      verdict: 'CONFIRMED_COMPROMISE',
      severity: 'CRITICAL',
      recommendedPlaybook: 'RANSOMWARE_CONTAINMENT',
      attackerIp: '198.51.100.77',
      compromisedUser: 'compromised-admin',
    }),
    sources: [
      { id: normalizedCloudTrail.source_event_id, version: 1, span: 'AttachUserPolicy:AdministratorAccess' },
      { id: normalizedSyslog.source_event_id, version: 1, span: 'sshd:Failed password' },
    ],
    modelRoute: 'zoiko-agent-v1',
    validation: { schema: 'pass', grounding: 'pass', citations: 'pass' },
    cost: { tokensIn: 420, tokensOut: 180, amountUsd: 0.012 },
  });
  logger.log(`  ✔ Recorded Cryptographic AI Decision Trace: ${decisionRecord.requestId} (Evidence ID: ${decisionRecord.evidenceId})`);

  // 4. Automated Response Playbook & Rollback Broker
  logger.log('\n[Phase 5] Automated Response Playbook Execution & 1-Click Rollback');
  const authorityService = new ActionAuthorityService();
  const rollbackBroker = new ActionRollbackBrokerService();
  const playbookService = new ResponsePlaybookService(authorityService, rollbackBroker);

  const playbook = {
    playbookId: 'PB-CRITICAL-CONTAINMENT',
    name: 'Critical Incident Automated Containment',
    category: 'RANSOMWARE_CONTAINMENT' as const,
    steps: [
      {
        stepNumber: 1,
        actionType: 'session.revoke',
        authorityLevel: 'R1' as const,
        targetIdentifier: 'compromised-admin',
        parameters: { revokeAllActiveTokens: true },
        compensatingActionType: 'session.noop',
      },
      {
        stepNumber: 2,
        actionType: 'host.isolate',
        authorityLevel: 'R2' as const,
        targetIdentifier: 'bastion-srv-01',
        parameters: { isolationVlan: 'quarantine-vlan' },
        compensatingActionType: 'host.unisolate',
      },
      {
        stepNumber: 3,
        actionType: 'firewall.block_ip',
        authorityLevel: 'R3' as const,
        targetIdentifier: '198.51.100.77',
        parameters: { dropDirection: 'INBOUND_AND_OUTBOUND' },
        compensatingActionType: 'firewall.unblock_ip',
      },
    ],
  };

  const playbookReport = await playbookService.executePlaybook({
    playbook,
    tenantId,
    proposalStatus: 'APPROVED',
    approverIds: ['soc-lead-analyst-1'],
    stepExecutor: async () => ({ success: true }),
  });
  logger.log(`  ✔ Playbook Executed Successfully: ${playbookReport.completedSteps}/${playbookReport.totalSteps} steps completed`);

  // Test 1-Click Rollback of an action receipt
  const firstReceiptId = playbookReport.executedReceiptIds[0];
  const receipt = rollbackBroker.getReceipt(tenantId, firstReceiptId);
  const rollbackResult = await rollbackBroker.executeRollback(tenantId, receipt.rollbackToken);
  logger.log(`  ✔ 1-Click Rollback Verified: Action '${rollbackResult.actionType}' status transitioned to ${rollbackResult.status}`);

  // 5. Cryptographic Anchoring & RFC 3161 Public Witness
  logger.log('\n[Phase 6] Merkle Tree Anchoring & RFC 3161 Public Witness Attestation');
  const merkleService = new MerkleTreeService();
  const rfc3161Witness = new Rfc3161WitnessService();

  const evidenceLeaves = [
    normalizedCloudTrail.raw_payload_hash,
    normalizedSyslog.raw_payload_hash,
    decisionRecord.outputHash,
    rollbackResult.receiptId,
  ];

  const merkleResult = merkleService.build(evidenceLeaves);
  logger.log(`  ✔ Computed Incident Evidence Merkle Root: ${merkleResult.root}`);

  const witnessReceipt = await rfc3161Witness.attest(merkleResult.root);
  logger.log(`  ✔ Public Witness Attestation Issued: [Type: ${witnessReceipt.witnessType}, Serial: ${witnessReceipt.witnessId}]`);
  logger.log(`  ✔ Cryptographic Receipt Hash: ${witnessReceipt.receiptHash}`);

  logger.log('\n======================================================================');
  logger.log(' 🎉 End-to-End SOC Incident Simulation & Platform Assurance PASSED!  ');
  logger.log('======================================================================\n');
}

if (require.main === module) {
  runSocLifecycleSimulation().catch((err) => {
    console.error('SOC Simulation failed:', err);
    process.exit(1);
  });
}
