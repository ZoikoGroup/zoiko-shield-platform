import { Test, TestingModule } from '@nestjs/testing';
import { RegulatoryControlsSeeder } from './regulatory-controls.seeder';
import { DetectionRulesSeeder } from './detection-rules.seeder';

describe('Production Master Data Seeders', () => {
  let regulatorySeeder: RegulatoryControlsSeeder;
  let detectionSeeder: DetectionRulesSeeder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RegulatoryControlsSeeder, DetectionRulesSeeder],
    }).compile();

    regulatorySeeder = module.get<RegulatoryControlsSeeder>(
      RegulatoryControlsSeeder,
    );
    detectionSeeder = module.get<DetectionRulesSeeder>(DetectionRulesSeeder);
  });

  it('seeds canonical regulatory frameworks with valid test keys', () => {
    const controls = regulatorySeeder.getCanonicalFrameworkControls();
    expect(controls.length).toBeGreaterThanOrEqual(7);

    const soc2 = controls.find((c) => c.code === 'SOC2-CC6.1');
    expect(soc2).toBeDefined();
    expect(soc2?.framework).toBe('SOC2_TYPE2');
    expect(soc2?.automatedTestKey).toBe(
      'test_mfa_enforcement_and_privileged_roles',
    );

    const dora = controls.find((c) => c.code === 'DORA-ART9');
    expect(dora).toBeDefined();
    expect(dora?.framework).toBe('DORA');
  });

  it('seeds high-fidelity detection rules with ATT&CK taxonomy', () => {
    const rules = detectionSeeder.getCanonicalDetectionRules();
    expect(rules.length).toBeGreaterThanOrEqual(4);

    const bruteForce = rules.find((r) => r.ruleId === 'ZS-AUTH-001');
    expect(bruteForce).toBeDefined();
    expect(bruteForce?.severity).toBe('HIGH');
    expect(bruteForce?.mitreTactic).toContain('Credential Access');
    expect(bruteForce?.triggerThreshold).toBe(5);

    const ransomware = rules.find((r) => r.ruleId === 'ZS-EP-001');
    expect(ransomware).toBeDefined();
    expect(ransomware?.severity).toBe('CRITICAL');
  });
});
