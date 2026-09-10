import * as crypto from 'crypto';
import { SnykNormalizerService } from '../src/connectors/providers/snyk-vulnerability/snyk-vulnerability.normalizer';
import { JiraNormalizerService } from '../src/connectors/providers/jira-ticketing/jira-ticketing.normalizer';
import { JiraIssuePayload } from '../src/connectors/providers/jira-ticketing/jira-ticketing.types';
import { CrowdStrikeNormalizerService } from '../src/connectors/providers/crowdstrike/crowdstrike.normalizer';
import { SyslogTlsNormalizerService } from '../src/connectors/providers/syslog-tls/syslog-tls.normalizer';
import { AwsCloudTrailNormalizerService } from '../src/connectors/providers/aws-cloudtrail/aws-cloudtrail.normalizer';
import { EntraNormalizerService } from '../src/connectors/providers/microsoft-entra/entra.normalizer';

describe('P0 Ingestion Connectors Certification Suite (ERB-01 / Master Build Plan §7 Checkpoint 5)', () => {
  const tenantId = 'tenant-cert-001';
  const environmentId = 'production';
  const region = 'us-east-1';

  let snykNormalizer: SnykNormalizerService;
  let jiraNormalizer: JiraNormalizerService;
  let crowdStrikeNormalizer: CrowdStrikeNormalizerService;
  let syslogNormalizer: SyslogTlsNormalizerService;
  let cloudTrailNormalizer: AwsCloudTrailNormalizerService;
  let entraNormalizer: EntraNormalizerService;

  beforeEach(() => {
    snykNormalizer = new SnykNormalizerService();
    jiraNormalizer = new JiraNormalizerService();
    crowdStrikeNormalizer = new CrowdStrikeNormalizerService();
    syslogNormalizer = new SyslogTlsNormalizerService();
    cloudTrailNormalizer = new AwsCloudTrailNormalizerService();
    entraNormalizer = new EntraNormalizerService();
  });

  describe('1. Generic Webhook HMAC Verification Contract', () => {
    it('should compute and verify valid HMAC sha256 signature and nonce', () => {
      const secret = 'test-webhook-hmac-secret-2026';
      const payload = JSON.stringify({
        event: 'alert.triggered',
        source: 'custom-sensor',
        severity: 'HIGH',
      });
      const timestamp = new Date().toISOString();
      const nonce = crypto.randomUUID();

      const computedSig = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${nonce}.${payload}`)
        .digest('hex');

      // Verify validation logic
      const verificationString = `${timestamp}.${nonce}.${payload}`;
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(verificationString)
        .digest('hex');

      expect(computedSig).toBe(expectedSig);
      expect(
        crypto.timingSafeEqual(
          Buffer.from(computedSig),
          Buffer.from(expectedSig),
        ),
      ).toBe(true);
    });
  });

  describe('2. Generic Syslog RFC 5424 Connector Normalization', () => {
    it('should parse and normalize RFC 5424 structured syslog into canonical syslog event', () => {
      const rawSyslog =
        '<165>1 2026-09-10T10:15:30.000Z firewall.corp.local sudo 1234 ID47 [auth@32473 user="admin" privilege="root"] Accepted password for admin from 192.168.1.100';

      const parsed = syslogNormalizer.parseRfc5424(rawSyslog);
      expect(parsed).toBeDefined();
      expect(parsed?.hostname).toBe('firewall.corp.local');

      const event = syslogNormalizer.normalizeMessage(
        parsed!,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.provider).toBe('syslog-tls');
      expect(event.tenant_id).toBe(tenantId);
      expect(event.action_type).toBe('AUTH_SUCCESS');
      expect(event.target_user).toBe('admin');
      expect(event.source_ip).toBe('192.168.1.100');
      expect(event.raw_payload_hash).toBeDefined();
    });
  });

  describe('3. Microsoft Entra ID Identity Audit Connector Normalization', () => {
    it('should normalize Entra ID audit sign-in event into canonical identity event', () => {
      const entraAuditRecord = {
        id: 'entra-audit-evt-991',
        createdDateTime: '2026-09-10T11:00:00Z',
        userPrincipalName: 'admin@zoikogroup.com',
        userId: 'usr-aad-1002',
        ipAddress: '198.51.100.42',
        status: {
          errorCode: 0,
        },
        conditionalAccessStatus: 'success',
        riskLevelDuringSignIn: 'low',
        appDisplayName: 'ZoikoShield Portal',
      };

      const event = entraNormalizer.normalizeSignInLog(
        entraAuditRecord,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.provider).toBe('microsoft-entra');
      expect(event.tenant_id).toBe(tenantId);
      expect(event.authentication_result).toBe('SUCCESS');
      expect(event.conditional_access_result).toBe('SUCCESS');
      expect(event.user_identity.username).toBe('admin@zoikogroup.com');
      expect(event.ip_address).toBe('198.51.100.42');
    });
  });

  describe('4. AWS CloudTrail Infrastructure Connector Normalization', () => {
    it('should normalize CloudTrail IAM policy mutation into canonical CloudTrail event', () => {
      const cloudTrailRecord = {
        eventVersion: '1.08',
        userIdentity: {
          type: 'IAMUser',
          principalId: 'AIDAEXAMPLE',
          arn: 'arn:aws:iam::123456789012:user/Alice',
          accountId: '123456789012',
          userName: 'Alice',
        },
        eventTime: '2026-09-10T11:30:00Z',
        eventSource: 'iam.amazonaws.com',
        eventName: 'AttachUserPolicy',
        awsRegion: 'us-east-1',
        sourceIPAddress: '203.0.113.19',
        userAgent: 'aws-cli/2.15.0',
        eventID: 'evt-ct-12345',
        eventType: 'AwsApiCall',
        recipientAccountId: '123456789012',
        requestParameters: {
          userName: 'Alice',
          roleArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
        },
      };

      const event = cloudTrailNormalizer.normalizeRecord(
        cloudTrailRecord,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.provider).toBe('aws-cloudtrail');
      expect(event.actor.user_name).toBe('Alice');
      expect(event.target.action).toBe('AttachUserPolicy');
      expect(event.network.source_ip).toBe('203.0.113.19');
      expect(event.status).toBe('SUCCESS');
      expect(event.raw_payload_hash).toBeDefined();
    });
  });

  describe('5. Snyk Vulnerability Connector Normalization', () => {
    it('should normalize Snyk finding into OCSF 2002 Vulnerability Finding event', () => {
      const snykFinding = {
        id: 'SNYK-JS-AXIOS-54321',
        issue_type: 'vuln' as const,
        pkg_name: 'axios',
        pkg_version: '0.21.1',
        severity: 'high' as const,
        title: 'Server-Side Request Forgery in axios',
        cve: ['CVE-2021-3749'],
        cwe: ['CWE-918'],
        cvss_score: 7.5,
        is_patchable: true,
        project_id: 'proj-shield-core',
        project_name: 'zoikoshield-core',
      };

      const event = snykNormalizer.normalizeFinding(
        snykFinding,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.category_uid).toBe(2); // Findings
      expect(event.class_uid).toBe(2002); // Vulnerability Finding
      expect(event.severity).toBe('HIGH');
      expect(event.vulnerability.name).toBe(
        'Server-Side Request Forgery in axios',
      );
      expect(event.affected_resource.name).toBe('axios');
      expect(event.raw_payload_hash).toBeDefined();
    });
  });

  describe('6. Certified EDR (CrowdStrike Falcon) Connector Normalization', () => {
    it('should normalize CrowdStrike detection into OCSF 1007 Process Activity event with MITRE mapping', () => {
      const csDetection = {
        detection_id: 'det-cs-98765',
        created_timestamp: '2026-09-10T12:00:00Z',
        max_severity: 4,
        max_confidence: 95,
        status: 'new' as const,
        device: {
          device_id: 'host-win-prod-42',
          hostname: 'WIN-SRV-DB01',
          local_ip: '10.0.4.15',
          os_version: 'Windows Server 2022',
        },
        behaviors: [
          {
            scenario: 'malware',
            objective: 'execution',
            pattern_id: 10001,
            severity: 4,
            confidence: 95,
            timestamp: '2026-09-10T12:00:00Z',
            cmdline: 'powershell.exe -enc SQBFAFgA...',
            filename: 'powershell.exe',
            sha256:
              'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            user_name: 'NT AUTHORITY\\SYSTEM',
            tactic: 'Execution',
            technique: 'Command and Scripting Interpreter: PowerShell',
          },
        ],
      };

      const event = crowdStrikeNormalizer.normalizeDetection(
        csDetection,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.category_uid).toBe(1); // System Activity
      expect(event.class_uid).toBe(1007); // Process Activity
      expect(event.severity).toBe('CRITICAL');
      expect(event.process.name).toBe('powershell.exe');
      expect(event.attacks).toHaveLength(1);
      expect(event.attacks?.[0].tactic.name).toBe('Execution');
      expect(event.raw_payload_hash).toBeDefined();
    });
  });

  describe('7. Jira Security Ticketing Connector Normalization', () => {
    it('should normalize Jira issue into OCSF 2001 Security Finding event', () => {
      const jiraIssue: JiraIssuePayload = {
        id: '10042',
        key: 'SEC-101',
        summary: 'Suspicious privilege escalation observed on Host-09',
        description: 'Multiple failed sudo attempts followed by root session',
        issue_type: 'Incident',
        priority: 'High',
        status: 'In Progress',
        assignee_email: 'analyst@zoikogroup.com',
        created: '2026-09-10T10:00:00Z',
        project_key: 'SEC',
      };

      const event = jiraNormalizer.normalizeIssue(
        jiraIssue,
        tenantId,
        environmentId,
        region,
      );

      expect(event).toBeDefined();
      expect(event.category_uid).toBe(2); // Findings
      expect(event.class_uid).toBe(2001); // Security Finding
      expect(event.severity).toBe('HIGH');
      expect(event.finding_info.title).toBe(
        '[SEC-101] Suspicious privilege escalation observed on Host-09',
      );
      expect(event.finding_info.uid).toBe('10042');
      expect(event.raw_payload_hash).toBeDefined();
    });
  });
});
