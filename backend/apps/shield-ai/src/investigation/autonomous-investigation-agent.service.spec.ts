import { Test, TestingModule } from '@nestjs/testing';
import { AutonomousInvestigationAgentService } from './autonomous-investigation-agent.service';
import { ToolCapabilityService } from '../tools/tool-capability.service';

describe('AutonomousInvestigationAgentService', () => {
  let service: AutonomousInvestigationAgentService;
  let mockToolCapability: any;

  beforeEach(async () => {
    mockToolCapability = {
      issueGrant: jest.fn().mockReturnValue({ grantId: 'grant-test-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutonomousInvestigationAgentService,
        { provide: ToolCapabilityService, useValue: mockToolCapability },
      ],
    }).compile();

    service = module.get<AutonomousInvestigationAgentService>(
      AutonomousInvestigationAgentService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runReActInvestigation', () => {
    it('should complete multi-hop investigation and return causal provenance graph', async () => {
      const result = await service.runReActInvestigation({
        tenantId: 'tenant-test',
        incidentId: 'inc-999',
        findingSummary: 'Abnormal IAM AssumeRole followed by S3 bucket policy change',
        initialEntities: {
          user: 'attacker-svc',
          ip: '198.51.100.99',
          host: 'node-corp-12',
          resourceId: 'arn:aws:s3:::vault',
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.verdict).toBe('TRUE_POSITIVE_MALICIOUS');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.9);
      expect(result.hops.length).toBe(5);
      expect(result.provenanceGraph).toBeDefined();
      expect(result.provenanceGraph.nodes.length).toBeGreaterThanOrEqual(4);
      expect(result.provenanceGraph.edges.length).toBeGreaterThanOrEqual(3);
      expect(result.recommendedActions.length).toBeGreaterThanOrEqual(3);
      expect(result.citations.length).toBeGreaterThanOrEqual(3);
    });

    it('should retrieve cached provenance graph by incidentId', async () => {
      await service.runReActInvestigation({
        tenantId: 'tenant-test',
        incidentId: 'inc-cached-1',
        findingSummary: 'Test finding',
      });

      const graph = service.getProvenanceGraph('inc-cached-1');
      expect(graph).toBeDefined();
      expect(graph?.incidentId).toBe('inc-cached-1');
      expect(graph?.rootCauseEntity).toBeDefined();
    });
  });
});
