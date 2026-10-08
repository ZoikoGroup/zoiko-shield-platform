import { TransactionalEmailService } from './transactional-email.service';
import { BadRequestException } from '@nestjs/common';

describe('TransactionalEmailService', () => {
  let emailService: TransactionalEmailService;

  beforeEach(() => {
    emailService = new TransactionalEmailService();
  });

  it('should throw BadRequestException when no recipients are provided', async () => {
    await expect(
      emailService.dispatchTransactionalEmail({
        tenantId: 'tenant-01',
        templateKey: 'USG/UsageThreshold75Percent',
        recipients: [],
        variables: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should format and dispatch 75% usage threshold email alert', async () => {
    const receipt = await emailService.dispatchTransactionalEmail({
      tenantId: 'tenant-acme',
      templateKey: 'USG/UsageThreshold75Percent',
      recipients: [{ email: 'admin@acme.com', name: 'Acme Admin' }],
      variables: {
        tenantName: 'Acme Financial Inc.',
        consumedGb: 750,
        limitGb: 1000,
      },
    });

    expect(receipt.subject).toContain('75% Capacity Reached');
    expect(receipt.htmlBody).toContain('750 GB');
    expect(receipt.deliveryStatus).toBe('DELIVERED');
    expect(receipt.contentDigest).toBeDefined();
  });

  it('should format and dispatch critical incident update email', async () => {
    const receipt = await emailService.dispatchTransactionalEmail({
      tenantId: 'tenant-acme',
      templateKey: 'SUP/IncidentUpdate',
      recipients: [{ email: 'soc-lead@acme.com', name: 'Lead Analyst' }],
      variables: {
        incidentTitle: 'Lateral Movement in K8s Cluster',
        incidentSeverity: 'CRITICAL',
        incidentStatus: 'CONTAINED',
        remediationAction: 'ISOLATE_ENDPOINT',
      },
    });

    expect(receipt.subject).toContain('Security Incident Update');
    expect(receipt.htmlBody).toContain('Lateral Movement in K8s Cluster');
    expect(receipt.htmlBody).toContain('ISOLATE_ENDPOINT');
  });

  it('should render and dispatch any of the 226 production ZS-EML-* templates', async () => {
    const receipt = await emailService.dispatchTransactionalEmail({
      tenantId: 'tenant-acme',
      templateKey: 'ZS-EML-SEC-001',
      recipients: [
        { email: 'soc-responder@acme.com', name: 'Commander Shepard' },
      ],
      variables: {
        organizationName: 'Acme Aerospace',
        referenceId: 'REF-SEC-9988',
        statusLabel: 'CRITICAL_DETECTED',
        occurredAtLocal: '2026-10-07 09:00:00',
        timezone: 'UTC',
        environment_name: 'Production AWS/GCP Multi-Cloud',
        security_object_url: 'https://app.zoikoshield.com/cases/9988',
      },
    });

    expect(receipt.subject).toContain(
      'Critical security alert requires review',
    );
    expect(receipt.htmlBody).toContain('Commander Shepard');
    expect(receipt.htmlBody).toContain('Acme Aerospace');
    expect(receipt.htmlBody).toContain('REF-SEC-9988');
    expect(receipt.deliveryStatus).toBe('DELIVERED');
    expect(receipt.renderHash).toBeDefined();
    expect(receipt.contentDigest).toBeDefined();
  });

  it('should fail-closed and reject dispatch when resource belongs to foreign tenant (Gate 3)', async () => {
    await expect(
      emailService.dispatchTransactionalEmail({
        tenantId: 'tenant-acme-prod',
        templateKey: 'ZS-EML-SEC-001',
        recipients: [{ email: 'analyst@acme.com', name: 'Analyst' }],
        variables: {
          organizationName: 'Acme Corp',
          resourceTenantId: 'tenant-foreign-evil-corp', // Cross-tenant boundary violation!
          referenceId: 'REF-CROSS-01',
          statusLabel: 'CRITICAL',
          occurredAtLocal: '2026-10-08 12:00:00',
          timezone: 'UTC',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject non-HTTPS external CTA links in transactional email input', async () => {
    await expect(
      emailService.dispatchTransactionalEmail({
        tenantId: 'tenant-acme-prod',
        templateKey: 'ZS-EML-IAM-001',
        recipients: [{ email: 'admin@acme.com', name: 'Admin' }],
        variables: {
          organizationName: 'Acme Corp',
          referenceId: 'REF-URL-01',
          statusLabel: 'ACTIVE',
          occurredAtLocal: '2026-10-08 12:00:00',
          timezone: 'UTC',
          actionUrl: 'http://insecure-phishing-site.com/login', // Insecure HTTP URL!
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // Regression: Gate 3 previously validated only actionUrl / action_url /
  // security_object_url / onboardingUrl / onboarding_url, while the template
  // engine resolved the CTA from ~22 keys. Every other key was an unchecked
  // path to the action button in a Zoiko-Shield-branded security email.
  describe('Gate 3 CTA URL coverage across every resolution key', () => {
    const CTA_KEYS = [
      'actionUrl',
      'action_url',
      'accountSecurityUrl',
      'account_security_url',
      'invitation_url',
      'auditUrl',
      'audit_url',
      'billingUrl',
      'billing_url',
      'supportUrl',
      'support_url',
      'onboardingUrl',
      'onboarding_url',
      'developerUrl',
      'developer_url',
      'governanceUrl',
      'governance_url',
      'verificationUrl',
      'verification_url',
      'passwordResetUrl',
      'password_reset_url',
      'downloadUrl',
      'download_url',
    ];

    const baseVariables = {
      organizationName: 'Acme Corp',
      referenceId: 'REF-CTA-01',
      statusLabel: 'ACTIVE',
      occurredAtLocal: '2026-10-08 12:00:00',
      timezone: 'UTC',
    };

    it.each(CTA_KEYS)(
      'rejects a hostile HTTP CTA supplied via "%s"',
      async (key) => {
        await expect(
          emailService.dispatchTransactionalEmail({
            tenantId: 'tenant-acme-prod',
            templateKey: 'ZS-EML-SEC-001',
            recipients: [{ email: 'analyst@acme.com', name: 'Analyst' }],
            variables: {
              ...baseVariables,
              [key]: 'http://phishing.example.com/steal',
            },
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it.each(CTA_KEYS)(
      'rejects a javascript: CTA supplied via "%s"',
      async (key) => {
        await expect(
          emailService.dispatchTransactionalEmail({
            tenantId: 'tenant-acme-prod',
            templateKey: 'ZS-EML-SEC-001',
            recipients: [{ email: 'analyst@acme.com', name: 'Analyst' }],
            variables: {
              ...baseVariables,
              [key]: "javascript:fetch('//evil.example')",
            },
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('rejects a credential-disguised CTA host', async () => {
      await expect(
        emailService.dispatchTransactionalEmail({
          tenantId: 'tenant-acme-prod',
          templateKey: 'ZS-EML-SEC-001',
          recipients: [{ email: 'analyst@acme.com', name: 'Analyst' }],
          variables: {
            ...baseVariables,
            invitation_url: 'https://app.zoikoshield.com@evil.example/login',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('still accepts a legitimate HTTPS CTA and renders it', async () => {
      const receipt = await emailService.dispatchTransactionalEmail({
        tenantId: 'tenant-acme-prod',
        templateKey: 'ZS-EML-SEC-001',
        recipients: [{ email: 'analyst@acme.com', name: 'Analyst' }],
        variables: {
          ...baseVariables,
          invitation_url: 'https://app.zoikoshield.com/invite/abc',
        },
      });
      expect(receipt.htmlBody).toContain('https://app.zoikoshield.com/invite/abc');
    });
  });

  it('rejects a recipient address carrying SMTP header injection', async () => {
    await expect(
      emailService.dispatchTransactionalEmail({
        tenantId: 'tenant-acme-prod',
        templateKey: 'ZS-EML-SEC-001',
        recipients: [
          { email: 'analyst@acme.com\nBcc: attacker@evil.example', name: 'A' },
        ],
        variables: {
          organizationName: 'Acme Corp',
          referenceId: 'REF-HDR-01',
          statusLabel: 'ACTIVE',
          occurredAtLocal: '2026-10-08 12:00:00',
          timezone: 'UTC',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

