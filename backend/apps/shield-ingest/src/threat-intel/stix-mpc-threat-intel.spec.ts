import { Test, TestingModule } from '@nestjs/testing';
import {
  StixThreatIntelMatcherService,
  StixBundle,
} from './stix-threat-intel-matcher.service';
import { MpcThreatMatcherService } from '../mpc-intel/mpc-threat-matcher.service';

describe('StixThreatIntelMatcherService & MpcThreatMatcherService (LAB 20 Threat Intel & MPC PSI)', () => {
  let stixMatcher: StixThreatIntelMatcherService;
  let mpcMatcher: MpcThreatMatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StixThreatIntelMatcherService, MpcThreatMatcherService],
    }).compile();

    stixMatcher = module.get<StixThreatIntelMatcherService>(
      StixThreatIntelMatcherService,
    );
    mpcMatcher = module.get<MpcThreatMatcherService>(MpcThreatMatcherService);
  });

  describe('STIX 2.1 Threat Intel Ingestion & Telemetry Observable Matching', () => {
    it('should ingest STIX 2.1 bundle and index IP, domain, and hash indicators', () => {
      const mockBundle: StixBundle = {
        type: 'bundle',
        id: 'bundle--test-apt29-campaign',
        objects: [
          {
            type: 'threat-actor',
            id: 'threat-actor--apt29',
            name: 'APT29 (Cozy Bear)',
          },
          {
            type: 'malware',
            id: 'malware--wellmess',
            name: 'WellMess Trojan',
          },
          {
            type: 'indicator',
            id: 'indicator--ip-01',
            pattern: "[ipv4-addr:value = '198.51.100.77']",
            confidence: 95,
            external_references: [
              { source_name: 'MITRE ATT&CK', external_id: 'T1071.001' },
            ],
          },
          {
            type: 'indicator',
            id: 'indicator--domain-01',
            pattern: "[domain-name:value = 'evil-c2-beacon.net']",
            confidence: 90,
            external_references: [
              { source_name: 'MITRE ATT&CK', external_id: 'T1566.002' },
            ],
          },
        ],
      };

      const result = stixMatcher.ingestStixBundle(mockBundle);
      expect(result.indexedCount).toBe(2);
      expect(result.bundleId).toBe('bundle--test-apt29-campaign');

      // Match against live telemetry observables
      const matchResult = stixMatcher.matchTelemetryObservables({
        ipAddresses: ['198.51.100.77', '10.0.0.1'],
        domains: ['evil-c2-beacon.net'],
      });

      expect(matchResult.isMatched).toBe(true);
      expect(matchResult.matchedIocs).toHaveLength(2);
      expect(matchResult.threatActors).toContain('APT29 (Cozy Bear)');
      expect(matchResult.malwareFamilies).toContain('WellMess Trojan');
      expect(matchResult.mitreTechniques).toContain('T1071.001');
      expect(matchResult.mitreTechniques).toContain('T1566.002');
      expect(matchResult.maxConfidence).toBe(95);
      expect(matchResult.enrichmentDigest).toHaveLength(64);
    });
  });

  describe('Privacy-Preserving MPC Private Set Intersection (PSI)', () => {
    it('should compute zero-knowledge matches against blinded tenant indicators without plaintext leakage', () => {
      const tenantId = 'tenant-confidential-bank';
      const tenantSecretKey = 'tenant-hmac-secret-salt-2026';

      // Tenant blinds internal IOCs locally before querying
      const blindedIp = mpcMatcher.blindIndicator(
        '198.51.100.99',
        tenantSecretKey,
      );
      const blindedCleanIp = mpcMatcher.blindIndicator(
        '10.20.30.40',
        tenantSecretKey,
      );

      const queryItems = [
        { blindedIndicatorHash: blindedIp },
        { blindedIndicatorHash: blindedCleanIp },
      ];

      const mpcResult = mpcMatcher.evaluatePrivateSetIntersection(
        tenantId,
        tenantSecretKey,
        queryItems,
      );

      expect(mpcResult.receiptId).toBeDefined();
      expect(mpcResult.totalQueriedCount).toBe(2);
      expect(mpcResult.matchedIndicatorsCount).toBe(1);
      expect(mpcResult.matches[0].iocType).toBe('IP');
      expect(mpcResult.matches[0].threatActorCampaign).toBe(
        'APT29_CozyBear_C2',
      );
      expect(mpcResult.matches[0].threatConfidence).toBe(0.99);
      expect(mpcResult.attestationDigest).toHaveLength(64);
    });
  });
});
