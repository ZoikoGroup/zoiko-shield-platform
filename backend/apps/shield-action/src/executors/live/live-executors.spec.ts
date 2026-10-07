import { LiveGcpIamExecutor } from './live-gcp-iam.executor';
import { LiveGcpCloudArmorExecutor } from './live-gcp-cloud-armor.executor';
import { LiveGoogleWorkspaceExecutor } from './live-google-workspace.executor';
import { LiveCrowdstrikeExecutor } from './live-crowdstrike.executor';
import { LiveOktaExecutor } from './live-okta.executor';
import { LiveActionExecutorService } from '../live-action-executor.service';
import { DualCustodyApprovalsService } from '../../approvals/dual-custody-approvals.service';

describe('Live GCP Native SOAR Action Executors', () => {
  let gcpIam: LiveGcpIamExecutor;
  let gcpArmor: LiveGcpCloudArmorExecutor;
  let googleWorkspace: LiveGoogleWorkspaceExecutor;
  let crowdstrike: LiveCrowdstrikeExecutor;
  let okta: LiveOktaExecutor;
  let dualCustodyService: DualCustodyApprovalsService;
  let liveActionExecutor: LiveActionExecutorService;

  beforeEach(() => {
    gcpIam = new LiveGcpIamExecutor();
    gcpArmor = new LiveGcpCloudArmorExecutor();
    googleWorkspace = new LiveGoogleWorkspaceExecutor();
    crowdstrike = new LiveCrowdstrikeExecutor();
    okta = new LiveOktaExecutor();
    dualCustodyService = new DualCustodyApprovalsService();
    liveActionExecutor = new LiveActionExecutorService(
      dualCustodyService,
      gcpArmor,
      gcpIam,
      googleWorkspace,
      crowdstrike,
      okta,
    );
  });

  it('should dispatch live GCP Service Account key revocation', async () => {
    const res = await gcpIam.revokeServiceAccountKey({
      tenantId: 'tenant-gcp-corp',
      serviceAccountEmail:
        'compromised-runner@zoiko-shield.iam.gserviceaccount.com',
      keyId: 'key-gcp-9901-abcd',
      projectNumberOrId: 'zoiko-shield',
      reason:
        'Automated containment following credential exposure in telemetry',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-gcp-iam');
    expect(res.providerResponse?.cloudProvider).toBe('GOOGLE_CLOUD_PLATFORM');
    expect(res.providerResponse?.keyState).toBe('DISABLED');
  });

  it('should dispatch live GCP IAM member role eviction', async () => {
    const res = await gcpIam.evictIamMember({
      tenantId: 'tenant-gcp-corp',
      member: 'user:attacker@enterprise.com',
      roleToRevoke: 'roles/owner',
      projectNumberOrId: 'zoiko-shield',
      reason: 'Privileged anomaly detected',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-gcp-iam-evict');
  });

  it('should dispatch live GCP Cloud Armor security policy IP block', async () => {
    const res = await gcpArmor.blockIp({
      tenantId: 'tenant-gcp-corp',
      securityPolicyName: 'zoiko-shield-edge-armor',
      ipToBlock: '198.51.100.44',
      projectId: 'zoiko-shield',
      reason: 'Volumetric DDoS and brute force flood detected',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-gcp-armor');
    expect(res.providerResponse?.action).toBe('DENY_403');
  });

  it('should dispatch live GCP Compute Engine quarantine network tag isolation', async () => {
    const res = await gcpArmor.isolateComputeInstance({
      tenantId: 'tenant-gcp-corp',
      securityPolicyName: 'default-policy',
      ipToBlock: '10.0.0.5',
      instanceName: 'shield-core-worker-01',
      zone: 'europe-west3-a',
      reason: 'Host beaconing to C2 server',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-gcp-gce-iso');
    expect(res.providerResponse?.networkTag).toBe('quarantine-isolated');
  });

  it('should dispatch live Google Workspace session revocation', async () => {
    const res = await googleWorkspace.revokeUserSessions({
      tenantId: 'tenant-gcp-corp',
      userEmail: 'compromised-admin@zoikoshield.com',
      reason: 'Impossible travel anomaly detected by AI copilot',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-gw-revoke');
    expect(res.providerResponse?.identityPlatform).toBe('GOOGLE_WORKSPACE');
  });

  it('should dispatch live CrowdStrike Falcon network containment', async () => {
    const res = await crowdstrike.containHost({
      tenantId: 'tenant-test',
      deviceAgentId: 'cs-agent-9923',
      hostname: 'FIN-WKS-012',
      reason: 'Lateral movement attempt',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-cs-contain');
  });

  it('should dispatch live Okta session revocation', async () => {
    const res = await okta.revokeUserSessions({
      tenantId: 'tenant-test',
      oktaUserId: '00u1234567890abcdef',
      userEmail: 'attacker@corp.com',
      reason: 'Impossible travel anomaly',
    });

    expect(res.status).toBe('EXECUTED');
    expect(res.receiptId).toContain('rcpt-okta-revoke');
  });

  it('should route live actions through LiveActionExecutorService with rollback metadata', async () => {
    const receipt = await liveActionExecutor.executeAction({
      tenantId: 'tenant-soar-corp',
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '203.0.113.88',
      authorityLevel: 'R1',
      parameters: {
        securityPolicy: 'soar-perimeter-armor',
        projectId: 'zoiko-shield-prod',
      },
    });

    expect(receipt.status).toBe('EXECUTED');
    expect(receipt.actionType).toBe('BLOCK_PERIMETER_IP');
    expect(receipt.targetRef).toBe('203.0.113.88');
    expect(receipt.rollbackCapability.supported).toBe(true);
    expect(receipt.rollbackCapability.rollbackAction).toBe(
      'REMOVE_CLOUD_ARMOR_IP_RULE',
    );
    expect(receipt.signature).toBeDefined();
  });

  it('should enforce Dual-Custody quorum for live R2+ actions', async () => {
    await expect(
      liveActionExecutor.executeAction({
        tenantId: 'tenant-soar-corp',
        actionType: 'REVOKE_GCP_SA_KEY',
        targetRef: 'admin-sa@zoiko-shield.iam.gserviceaccount.com',
        authorityLevel: 'R2',
      }),
    ).rejects.toThrow('Dual-custody approval required');
  });
});
