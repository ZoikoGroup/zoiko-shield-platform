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
      recipients: [{ email: 'soc-responder@acme.com', name: 'Commander Shepard' }],
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

    expect(receipt.subject).toContain('Critical security alert requires review');
    expect(receipt.htmlBody).toContain('Commander Shepard');
    expect(receipt.htmlBody).toContain('Acme Aerospace');
    expect(receipt.htmlBody).toContain('REF-SEC-9988');
    expect(receipt.deliveryStatus).toBe('DELIVERED');
    expect(receipt.renderHash).toBeDefined();
    expect(receipt.contentDigest).toBeDefined();
  });
});

