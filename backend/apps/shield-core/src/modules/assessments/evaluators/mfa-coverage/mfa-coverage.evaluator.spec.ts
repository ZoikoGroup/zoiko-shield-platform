import { MfaCoverageEvaluator } from './mfa-coverage.evaluator';

describe('MfaCoverageEvaluator', () => {
  const evaluator = new MfaCoverageEvaluator();

  it('PASSes only when every expected identity has MFA-enabled evidence', async () => {
    const result = await evaluator.run({
      evidenceRecords: [
        { id: 'e1', content_hash: 'h1', source_object_id: 'o1', period_start: null, period_end: null, content: { identityId: 'u1', mfaEnabled: true } },
        { id: 'e2', content_hash: 'h2', source_object_id: 'o2', period_start: null, period_end: null, content: { identityId: 'u2', mfaEnabled: true } },
      ],
      configuration: { expectedPopulation: ['u1', 'u2'] },
    });
    expect(result.result).toBe('PASS');
  });

  it('FAILs (not PARTIAL, not silently PASS) when any expected identity has MFA explicitly disabled', async () => {
    const result = await evaluator.run({
      evidenceRecords: [
        { id: 'e1', content_hash: 'h1', source_object_id: 'o1', period_start: null, period_end: null, content: { identityId: 'u1', mfaEnabled: true } },
        { id: 'e2', content_hash: 'h2', source_object_id: 'o2', period_start: null, period_end: null, content: { identityId: 'u2', mfaEnabled: false } },
      ],
      configuration: { expectedPopulation: ['u1', 'u2'] },
    });
    expect(result.result).toBe('FAIL');
  });

  it('never silently PASSes on missing evidence — reports PARTIAL/UNKNOWN with explicit limitations', async () => {
    const result = await evaluator.run({
      evidenceRecords: [{ id: 'e1', content_hash: 'h1', source_object_id: 'o1', period_start: null, period_end: null, content: { identityId: 'u1', mfaEnabled: true } }],
      configuration: { expectedPopulation: ['u1', 'u2', 'u3'] },
    });
    expect(result.result).not.toBe('PASS');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('reports UNKNOWN when no expected population is configured, never a bare PASS', async () => {
    const result = await evaluator.run({ evidenceRecords: [], configuration: {} });
    expect(result.result).toBe('UNKNOWN');
  });
});
