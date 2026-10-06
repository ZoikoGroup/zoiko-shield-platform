import { Test, TestingModule } from '@nestjs/testing';
import { ThreatIntelController } from './threat-intel.controller';
import { StixThreatIntelMatcherService } from './stix-threat-intel-matcher.service';
import {
  MpcThreatMatcherService,
  TenantPsiClient,
} from '../mpc-intel/mpc-threat-matcher.service';

describe('ThreatIntelController', () => {
  let controller: ThreatIntelController;
  let stixService: StixThreatIntelMatcherService;
  let mpcService: MpcThreatMatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreatIntelController],
      providers: [StixThreatIntelMatcherService, MpcThreatMatcherService],
    }).compile();

    controller = module.get<ThreatIntelController>(ThreatIntelController);
    stixService = module.get<StixThreatIntelMatcherService>(
      StixThreatIntelMatcherService,
    );
    mpcService = module.get<MpcThreatMatcherService>(MpcThreatMatcherService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('STIX 2.1 Ingestion & Matching Endpoints', () => {
    it('should ingest a STIX bundle via POST /api/v1/threat-intel/stix/bundles and match observables via POST /api/v1/threat-intel/match', () => {
      const bundle = {
        type: 'bundle' as const,
        id: 'bundle--test-controller-1',
        objects: [
          {
            type: 'threat-actor',
            id: 'threat-actor--lazarus',
            name: 'Lazarus Group',
          },
          {
            type: 'indicator',
            id: 'indicator--ip-test',
            pattern: "[ipv4-addr:value = '203.0.113.88']",
            confidence: 95,
            external_references: [
              { source_name: 'mitre-attack', external_id: 'T1566' },
            ],
          },
        ],
      };

      const ingestRes = controller.ingestStixBundle(bundle);
      expect(ingestRes.status).toBe('INGESTED');
      expect(ingestRes.bundleId).toBe('bundle--test-controller-1');
      expect(ingestRes.indexedCount).toBe(1);

      // Match
      const matchRes = controller.matchObservables({
        ipAddresses: ['203.0.113.88'],
      });
      expect(matchRes.status).toBe('MATCHED');
      expect(matchRes.result.isMatched).toBe(true);
      expect(matchRes.result.threatActors).toContain('Lazarus Group');
      expect(matchRes.result.mitreTechniques).toContain('T1566');
    });

    it('should return metrics from GET /api/v1/threat-intel/stats', () => {
      const stats = controller.getThreatIntelStats();
      expect(stats.stix).toBeDefined();
      expect(stats.mpcPrivacyPreserving).toBeDefined();
      expect(stats.mpcPrivacyPreserving.oprfCurve).toContain('P-256');
    });
  });

  describe('MPC Blind Evaluation & Server Dataset Endpoints', () => {
    it('should evaluate blinded curve points from TenantPsiClient without revealing plaintext observables', () => {
      const rawIndicators = [
        '198.51.100.99', // known in server dataset (APT29)
        'clean-internal-host.local', // unknown
      ];
      const preparedBatch = TenantPsiClient.blindIndicators(rawIndicators);

      // 1. Client calls POST /api/v1/threat-intel/mpc/blind-evaluate
      const evalRes = controller.blindEvaluateMpcBatch({
        items: preparedBatch.map((p) => p.blindedQuery),
      });

      expect(evalRes.status).toBe('EVALUATED');
      expect(evalRes.evaluatedResults.length).toBe(2);

      // 2. Client calls GET /api/v1/threat-intel/mpc/server-dataset
      const datasetRes = controller.getServerDataset();
      expect(datasetRes.dataset.length).toBeGreaterThan(0);

      // 3. Client locally finalizes without sending secret scalar to server
      const matchReceipt = TenantPsiClient.finalizeAndIntersect(
        'tenant-enterprise-bank',
        preparedBatch,
        evalRes.evaluatedResults,
        datasetRes.dataset,
      );

      expect(matchReceipt.matchedIndicatorsCount).toBe(1);
      expect(matchReceipt.matches[0].threatActorCampaign).toBe(
        'APT29_CozyBear_C2',
      );
    });
  });
});
