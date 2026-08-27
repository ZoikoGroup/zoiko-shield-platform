import { DataSovereigntyGuardService } from './data-sovereignty-guard.service';
import { ForbiddenException } from '@nestjs/common';

describe('DataSovereigntyGuardService', () => {
  let sovereigntyGuard: DataSovereigntyGuardService;

  beforeEach(() => {
    sovereigntyGuard = new DataSovereigntyGuardService();
  });

  it('should permit EU_SOVEREIGN storage routing within EU data centers', () => {
    const res = sovereigntyGuard.assertSovereignRouting({
      tenantId: 'tenant-eu-bank-01',
      sourceRegion: 'europe-west1',
      targetStorageRegion: 'europe-west3', // Frankfurt
      dataType: 'EVIDENCE_BLOB',
      jurisdiction: 'EU_SOVEREIGN',
    });

    expect(res.status).toBe('COMPLIANT');
    expect(res.isRoutingPermitted).toBe(true);
    expect(res.auditAttestationDigest).toBeDefined();
  });

  it('should block cross-border egress when EU_SOVEREIGN data targets US region', () => {
    expect(() => {
      sovereigntyGuard.assertSovereignRouting({
        tenantId: 'tenant-eu-bank-01',
        sourceRegion: 'europe-west3',
        targetStorageRegion: 'us-central1', // Prohibited US egress
        dataType: 'RAW_TELEMETRY',
        jurisdiction: 'EU_SOVEREIGN',
      });
    }).toThrow(ForbiddenException);
  });

  it('should permit global commercial routing to any valid target region', () => {
    const res = sovereigntyGuard.assertSovereignRouting({
      tenantId: 'tenant-global-01',
      sourceRegion: 'us-east-1',
      targetStorageRegion: 'ap-southeast-1',
      dataType: 'AUDIT_PACKAGE',
      jurisdiction: 'GLOBAL_COMMERCIAL',
    });

    expect(res.status).toBe('COMPLIANT');
    expect(res.isRoutingPermitted).toBe(true);
  });
});
