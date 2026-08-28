import { StixThreatIntelMatcherService, StixBundle } from './stix-threat-intel-matcher.service';

describe('StixThreatIntelMatcherService', () => {
  let matcher: StixThreatIntelMatcherService;

  beforeEach(() => {
    matcher = new StixThreatIntelMatcherService();
  });

  it('should parse STIX 2.1 bundle and index IP, Domain, and File Hash indicators', () => {
    const mockBundle: StixBundle = {
      type: 'bundle',
      id: 'bundle--9a8b7c6d-1111-2222-3333-444455556666',
      objects: [
        {
          type: 'threat-actor',
          id: 'threat-actor--apt29',
          name: 'Cozy Bear (APT29)',
        },
        {
          type: 'malware',
          id: 'malware--darkside',
          name: 'Ransomware.DarkSide',
        },
        {
          type: 'indicator',
          id: 'indicator--ip-01',
          name: 'Malicious C2 IP',
          pattern: "[ipv4-addr:value = '198.51.100.44']",
          confidence: 95,
          external_references: [{ source_name: 'mitre-attack', external_id: 'T1071.001' }],
        },
        {
          type: 'indicator',
          id: 'indicator--dom-01',
          name: 'C2 Exfiltration Domain',
          pattern: "[domain-name:value = 'c2-dropzone.ru']",
          confidence: 90,
          external_references: [{ source_name: 'mitre-attack', external_id: 'T1567' }],
        },
        {
          type: 'indicator',
          id: 'indicator--hash-01',
          name: 'Payload Dropper Hash',
          pattern: "[file:hashes.'SHA-256' = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']",
          confidence: 98,
          external_references: [{ source_name: 'mitre-attack', external_id: 'T1059.001' }],
        },
      ],
    };

    const res = matcher.ingestStixBundle(mockBundle);
    expect(res.indexedCount).toBe(3);

    // Test Telemetry Match
    const match = matcher.matchTelemetryObservables({
      ipAddresses: ['198.51.100.44'],
      domains: ['benign.corp'],
      fileHashes: ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    });

    expect(match.isMatched).toBe(true);
    expect(match.matchedIocs.length).toBe(2);
    expect(match.maxConfidence).toBe(98);
    expect(match.threatActors).toContain('Cozy Bear (APT29)');
    expect(match.malwareFamilies).toContain('Ransomware.DarkSide');
    expect(match.mitreTechniques).toContain('T1071.001');
    expect(match.mitreTechniques).toContain('T1059.001');
  });

  it('should return unmatched for clean observables', () => {
    const match = matcher.matchTelemetryObservables({
      ipAddresses: ['10.0.0.1'],
      domains: ['internal.corp'],
    });

    expect(match.isMatched).toBe(false);
    expect(match.matchedIocs.length).toBe(0);
    expect(match.maxConfidence).toBe(0);
  });
});
