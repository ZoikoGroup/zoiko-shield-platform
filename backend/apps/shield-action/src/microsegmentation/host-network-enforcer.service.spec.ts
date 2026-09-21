import { HostNetworkEnforcerService } from './host-network-enforcer.service';

describe('HostNetworkEnforcerService', () => {
  let enforcerService: HostNetworkEnforcerService;

  beforeEach(() => {
    enforcerService = new HostNetworkEnforcerService();
  });

  it('should apply zero-trust microsegmentation rule to host network policy table', () => {
    const tenantId = 'tenant-enterprise-01';

    const receipt = enforcerService.applyMicrosegmentationRule({
      tenantId,
      sourcePodSelector: 'app=payment-frontend',
      destinationCidrOrPod: 'app=postgres-primary',
      destinationPort: 5432,
      protocol: 'TCP',
      action: 'ALLOW',
      priority: 10,
    });

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.status).toBe('POLICY_ENFORCEMENT_SUCCESS');
    expect(receipt.enforcedAction).toBe('ALLOW');
    expect(receipt.attestationDigest).toBeDefined();

    const rules = enforcerService.getActiveRules(tenantId);
    expect(rules.length).toBe(1);
    expect(rules[0].destinationPort).toBe(5432);
  });

  it('should instantly isolate compromised pod with QUARANTINE_ISOLATE action at priority 1', () => {
    const tenantId = 'tenant-enterprise-01';

    const quarantineReceipt = enforcerService.quarantinePodNetwork(
      tenantId,
      'app=compromised-worker-pod',
    );

    expect(quarantineReceipt.enforcedAction).toBe('QUARANTINE_ISOLATE');
    expect(quarantineReceipt.targetPodSelector).toBe(
      'app=compromised-worker-pod',
    );

    const rules = enforcerService.getActiveRules(tenantId);
    const quarantineRule = rules.find(
      (r) => r.sourcePodSelector === 'app=compromised-worker-pod',
    );
    expect(quarantineRule?.priority).toBe(1);
    expect(quarantineRule?.destinationCidrOrPod).toBe('0.0.0.0/0');
  });
});
