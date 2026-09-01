import { PlatformDiagnosticsService } from './platform-diagnostics.service';

describe('PlatformDiagnosticsService (Production Diagnostics & Correlation)', () => {
  let diagService: PlatformDiagnosticsService;

  beforeEach(() => {
    diagService = new PlatformDiagnosticsService();
  });

  it('should generate complete diagnostics report across all 6 microservices', () => {
    const report = diagService.generateDiagnosticsReport(
      'test-correlation-1234',
    );

    expect(report.reportId).toBeDefined();
    expect(report.overallHealth).toBe('HEALTHY');
    expect(report.globalCorrelationId).toBe('test-correlation-1234');
    expect(report.microservices).toHaveLength(6);
    expect(report.microservices.map((m) => m.serviceName)).toEqual(
      expect.arrayContaining([
        'shield-core',
        'shield-ingest',
        'shield-ai',
        'shield-action',
        'shield-anchor',
        'verifier-cli',
      ]),
    );
    expect(report.attestationDigest).toHaveLength(64);
  });
});
