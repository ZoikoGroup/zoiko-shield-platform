import { ProductionEmailTemplateEngine } from './production-email-template.engine';

describe('ProductionEmailTemplateEngine (ZS-EML-TPL-001 v2.0)', () => {
  let engine: ProductionEmailTemplateEngine;

  beforeEach(() => {
    engine = new ProductionEmailTemplateEngine();
  });

  it('should render ZS-EML-IAM-001 email verification template with valid variables and security footer', () => {
    const rendered = engine.render({
      templateId: 'ZS-EML-IAM-001',
      recipientFirstName: 'Alice',
      referenceId: 'ref-ver-001',
      statusLabel: 'PENDING_VERIFICATION',
      occurredAtLocal: '2026-10-06 10:00:00',
      timezone: 'UTC',
      tokenExpiresAtLocal: '2026-10-07 10:00:00 UTC',
      verificationUrl: 'https://app.zoikoshield.com/verify?token=abc',
    });

    expect(rendered.templateId).toBe('ZS-EML-IAM-001');
    expect(rendered.subject).toContain('Verify your email address');
    expect(rendered.senderClass).toBe('account_sender');
    expect(rendered.plainTextBody).toContain('Hello Alice,');
    expect(rendered.plainTextBody).toContain('Reference: ref-ver-001');
    expect(rendered.plainTextBody).toContain(
      'Security note: Zoiko Shield will never ask you to send a password',
    );
    expect(rendered.htmlBody).toContain(
      'https://app.zoikoshield.com/verify?token=abc',
    );
  });

  it('should render ZS-EML-SEC-001 critical security alert template with allowlisted enum status', () => {
    const rendered = engine.render({
      templateId: 'ZS-EML-SEC-001',
      recipientFirstName: 'SecurityLead',
      organizationName: 'Acme Corporation',
      referenceId: 'alert-crit-9982',
      statusLabel: 'ACTION_REQUIRED',
      occurredAtLocal: '2026-10-06 10:15:00',
      timezone: 'CEST',
      actionUrl: 'https://app.zoikoshield.com/cases/alert-crit-9982',
    });

    expect(rendered.subject).toContain(
      'Critical security alert requires review',
    );
    expect(rendered.senderClass).toBe('security_sender');
    expect(rendered.plainTextBody).toContain('Organization: Acme Corporation');
    expect(rendered.htmlBody).toContain(
      'https://app.zoikoshield.com/cases/alert-crit-9982',
    );
  });

  it('should fail closed when rendering unknown template or missing mandatory parameters', () => {
    expect(() =>
      engine.render({
        templateId: 'ZS-EML-UNKNOWN-999',
        recipientFirstName: '',
        referenceId: '',
        statusLabel: '',
        occurredAtLocal: '',
        timezone: '',
      }),
    ).toThrow();
  });
});
