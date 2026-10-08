import { SenderClassRouterService } from './sender-class-router.service';

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
});
