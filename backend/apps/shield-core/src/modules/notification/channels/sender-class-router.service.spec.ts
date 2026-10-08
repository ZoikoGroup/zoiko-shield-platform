import { SenderClassRouterService } from './sender-class-router.service';
import { ProductionEmailTemplateEngine } from '../templates/production-email-template.engine';

describe('SenderClassRouterService (Gate 9 Router)', () => {
  let router: SenderClassRouterService;

  beforeEach(() => {
    router = new SenderClassRouterService();
  });

  it('should resolve security_sender profile with SECURITY_CRITICAL reputation pool and non-unsubscribe policy', () => {
    const profile = router.resolveSenderProfile('security_sender');
    expect(profile.fromAddress).toBe('security-alerts@zoikoshield.com');
    expect(profile.fromDisplayName).toBe('Zoiko Shield SecOps & Alert Command');
    expect(profile.replyTo).toBe('soc-response@zoikoshield.com');
    expect(profile.reputationPool).toBe('SECURITY_CRITICAL');
    expect(profile.mandatoryDkimAlignment).toBe(true);
    expect(profile.supportUnsubscribe).toBe(false);
  });

  it('should resolve billing_sender with BILLING pool and supportUnsubscribe enabled', () => {
    const profile = router.resolveSenderProfile('billing_sender');
    expect(profile.fromAddress).toBe('billing@zoikoshield.com');
    expect(profile.reputationPool).toBe('BILLING');
    expect(profile.supportUnsubscribe).toBe(true);
  });

  it('should resolve developer_sender with TRANSACTIONAL_HIGH pool', () => {
    const profile = router.resolveSenderProfile('developer_sender');
    expect(profile.fromAddress).toBe('api-admin@zoikoshield.com');
    expect(profile.reputationPool).toBe('TRANSACTIONAL_HIGH');
    expect(profile.supportUnsubscribe).toBe(true);
  });

  it('should resolve internal_ops_sender with OPS_PAGER pool', () => {
    const profile = router.resolveSenderProfile('internal_ops_sender');
    expect(profile.fromAddress).toBe('ops-pager@zoikoshield.com');
    expect(profile.reputationPool).toBe('OPS_PAGER');
    expect(profile.supportUnsubscribe).toBe(false);
  });

  it('should fallback to default safe platform sender profile on unrecognized sender class', () => {
    const profile = router.resolveSenderProfile('unknown_custom_sender');
    expect(profile.fromAddress).toBe('notifications@zoikoshield.com');
    expect(profile.fromDisplayName).toBe('Zoiko Shield Platform');
    expect(profile.reputationPool).toBe('TRANSACTIONAL_HIGH');
    expect(profile.mandatoryDkimAlignment).toBe(true);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'does not resolve inherited Object.prototype key "%s" as a profile',
    (key) => {
      // A bare this.profiles[key] lookup returns a truthy prototype member,
      // which would have been handed back as a profile with an undefined
      // fromAddress — i.e. mail dispatched with no From.
      const profile = router.resolveSenderProfile(key);
      expect(profile.fromAddress).toBe('notifications@zoikoshield.com');
      expect(profile.reputationPool).toBe('TRANSACTIONAL_HIGH');
    },
  );

  // Regression: 175 of the 226 template contracts declared a mailbox address
  // (e.g. 'security-alerts@zoikoshield.com') in the senderClass field instead
  // of a router profile key, so every one of them silently collapsed onto the
  // generic fallback sender — losing SECURITY_CRITICAL / BILLING / OPS_PAGER
  // pool separation and the RFC 8058 unsubscribe policy.
  describe('full template matrix routing', () => {
    const engine = new ProductionEmailTemplateEngine();
    const templates = engine.listTemplates();

    it('registers every sender class declared by the template matrix', () => {
      const unregistered = templates
        .filter((t) => !router.isRegisteredSenderClass(t.senderClass))
        .map((t) => `${t.id} -> ${t.senderClass}`);

      expect(unregistered).toEqual([]);
    });

    it('routes security and action templates to the SECURITY_CRITICAL pool', () => {
      for (const template of templates.filter(
        (t) => t.category === 'SEC' || t.category === 'ACT',
      )) {
        expect(
          router.resolveSenderProfile(template.senderClass).reputationPool,
        ).toBe('SECURITY_CRITICAL');
      }
    });

    it('routes billing templates to the BILLING pool with unsubscribe support', () => {
      const billing = templates.filter((t) => t.category === 'BILL');
      expect(billing.length).toBeGreaterThan(0);
      for (const template of billing) {
        const profile = router.resolveSenderProfile(template.senderClass);
        expect(profile.reputationPool).toBe('BILLING');
        expect(profile.supportUnsubscribe).toBe(true);
      }
    });

    it('routes internal OPS templates to the OPS_PAGER pool', () => {
      for (const template of templates.filter((t) => t.category === 'OPS')) {
        expect(
          router.resolveSenderProfile(template.senderClass).reputationPool,
        ).toBe('OPS_PAGER');
      }
    });

    it('keeps privacy templates on the privacy sender', () => {
      for (const template of templates.filter(
        (t) => t.category === 'PRIV' || t.category === 'OFF',
      )) {
        expect(router.resolveSenderProfile(template.senderClass).fromAddress).toBe(
          'privacy-officer@zoikoshield.com',
        );
      }
    });
  });
});
