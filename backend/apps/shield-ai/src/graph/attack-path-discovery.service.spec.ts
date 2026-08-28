import { AttackPathDiscoveryService } from './attack-path-discovery.service';

describe('AttackPathDiscoveryService', () => {
  let graphService: AttackPathDiscoveryService;

  beforeEach(() => {
    graphService = new AttackPathDiscoveryService();
  });

  it('should find shortest lateral movement path and determine choke point remediation', () => {
    // 1. Build graph nodes
    graphService.addNode({
      id: 'user-dev-intern',
      name: 'Intern Developer Account',
      type: 'IDENTITY_USER',
    });
    graphService.addNode({
      id: 'ec2-jump-host',
      name: 'Dev Jumpbox VM',
      type: 'COMPUTE_INSTANCE',
    });
    graphService.addNode({
      id: 'iam-role-infra-admin',
      name: 'InfraAdminRole',
      type: 'IAM_ROLE',
    });
    graphService.addNode({
      id: 'db-customer-pii-prod',
      name: 'Production Customer PII Database',
      type: 'DATABASE',
      isCrownJewel: true,
    });

    // 2. Add lateral relationships
    graphService.addEdge({
      sourceId: 'user-dev-intern',
      targetId: 'ec2-jump-host',
      relationship: 'CAN_EXECUTE',
      weight: 1,
    });
    graphService.addEdge({
      sourceId: 'ec2-jump-host',
      targetId: 'iam-role-infra-admin',
      relationship: 'ASSUMES_ROLE',
      weight: 1,
    });
    graphService.addEdge({
      sourceId: 'iam-role-infra-admin',
      targetId: 'db-customer-pii-prod',
      relationship: 'KEY_DECRYPT_PERMISSION',
      weight: 1,
    });

    // 3. Find path
    const path = graphService.findShortestAttackPath(
      'user-dev-intern',
      'db-customer-pii-prod',
    );

    expect(path).not.toBeNull();
    expect(path?.pathHops.length).toBe(3);
    expect(path?.targetCrownJewel.isCrownJewel).toBe(true);
    expect(path?.criticalChokePointNodeId).toBeDefined();
    expect(path?.remediationRecommendation).toContain('Sever relationship');
    expect(path?.analysisDigest).toBeDefined();
  });

  it('should return null when no path exists between nodes', () => {
    graphService.addNode({
      id: 'isolated-node-a',
      name: 'Isolated Node',
      type: 'COMPUTE_INSTANCE',
    });
    graphService.addNode({
      id: 'db-isolated',
      name: 'Isolated DB',
      type: 'DATABASE',
      isCrownJewel: true,
    });

    const path = graphService.findShortestAttackPath(
      'isolated-node-a',
      'db-isolated',
    );
    expect(path).toBeNull();
  });
});
