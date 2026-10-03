import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvestigationAgentController } from './investigation-agent.controller';
import { AutonomousInvestigationAgentService } from './autonomous-investigation-agent.service';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';

describe('InvestigationAgentController', () => {
  let controller: InvestigationAgentController;
  let service: AutonomousInvestigationAgentService;

  beforeEach(async () => {
    const mockInvestigationService = {
      runReActInvestigation: jest.fn().mockResolvedValue({
        investigationId: 'inv-test-1',
        incidentId: 'inc-123',
        tenantId: 'tenant-test',
        status: 'COMPLETED',
        verdict: 'TRUE_POSITIVE_MALICIOUS',
        confidenceScore: 0.94,
        totalHops: 5,
        hops: [],
        provenanceGraph: {
          incidentId: 'inc-123',
          tenantId: 'tenant-test',
          rootCauseEntity: 'svc-admin',
          attackStage: 'CREDENTIAL_COMPROMISE',
          confidenceScore: 0.94,
          nodes: [],
          edges: [],
          generatedAt: new Date().toISOString(),
        },
        recommendedActions: ['Revoke token'],
        citations: ['finding:inc-123'],
        completedAt: new Date().toISOString(),
      }),
      getProvenanceGraph: jest.fn((id: string) => {
        if (id === 'inc-123') {
          return {
            incidentId: 'inc-123',
            tenantId: 'tenant-test',
            rootCauseEntity: 'svc-admin',
            attackStage: 'CREDENTIAL_COMPROMISE',
            confidenceScore: 0.94,
            nodes: [],
            edges: [],
            generatedAt: new Date().toISOString(),
          };
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestigationAgentController],
      providers: [
        {
          provide: AutonomousInvestigationAgentService,
          useValue: mockInvestigationService,
        },
      ],
    })
      .overrideGuard(InternalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvestigationAgentController>(
      InvestigationAgentController,
    );
    service = module.get<AutonomousInvestigationAgentService>(
      AutonomousInvestigationAgentService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('executeReActInvestigation', () => {
    it('should trigger ReAct investigation loop and return findings', async () => {
      const dto = {
        incidentId: 'inc-123',
        findingSummary: 'Suspicious credential usage',
        initialEntities: { user: 'svc-admin' },
      };

      const result = await controller.executeReActInvestigation(
        'tenant-test',
        dto,
      );

      expect(result.statusCode).toBe(200);
      expect(result.data.incidentId).toBe('inc-123');
      expect(service.runReActInvestigation).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-test',
          incidentId: 'inc-123',
        }),
      );
    });
  });

  describe('getProvenanceGraph', () => {
    it('should return causal graph if incident was analyzed', () => {
      const result = controller.getProvenanceGraph('inc-123');
      expect(result.statusCode).toBe(200);
      expect(result.data.incidentId).toBe('inc-123');
    });

    it('should throw NotFoundException if graph not found', () => {
      expect(() => controller.getProvenanceGraph('inc-unknown')).toThrow(
        NotFoundException,
      );
    });
  });
});
