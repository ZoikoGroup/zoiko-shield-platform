import { CanaryHoneypotProbeService } from './canary-honeypot-probe.service';

describe('CanaryHoneypotProbeService', () => {
  let canaryService: CanaryHoneypotProbeService;

  beforeEach(() => {
    canaryService = new CanaryHoneypotProbeService();
  });

  it('should provision canary tokens and trigger instant P0 alert upon interaction', () => {
    const tenantId = 'tenant-enterprise-01';

    // 1. Deploy AWS Canary Token
    const token = canaryService.deployCanaryToken({
      tenantId,
      canaryType: 'AWS_ACCESS_KEY',
      decoyIdentifier: 'AKIA_CANARY_SECRET_KEY_9921',
      deployedEnvironment: 'aws-us-east-1-staging',
    });

    expect(token.tokenId).toBeDefined();
    expect(token.isActive).toBe(true);

    // 2. Benign event does not trigger alert
    const benignCheck = canaryService.inspectTelemetryForCanaryTripwire({
      tenantId,
      accessedIdentifier: 'AKIA_LEGITIMATE_PROD_KEY_123',
      sourceIp: '10.0.0.5',
      actionAttempted: 'sts:GetCallerIdentity',
    });
    expect(benignCheck).toBeNull();

    // 3. Adversary attempts to use Canary Key
    const alert = canaryService.inspectTelemetryForCanaryTripwire({
      tenantId,
      accessedIdentifier: 'AKIA_CANARY_SECRET_KEY_9921',
      sourceIp: '198.51.100.44',
      userAgent: 'aws-cli/2.15.0',
      actionAttempted: 'iam:ListUsers',
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe('P0_CRITICAL');
    expect(alert?.findingType).toBe('HONEYPOT_SYNTHETIC_TRIPWIRE_TRIGGER');
    expect(alert?.confidenceScore).toBe(100);
    expect(alert?.attackerContext.sourceIp).toBe('198.51.100.44');
    expect(alert?.tripwireAttestationDigest).toBeDefined();
  });
});
