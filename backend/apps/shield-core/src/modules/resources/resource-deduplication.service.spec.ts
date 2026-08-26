import { Test, TestingModule } from '@nestjs/testing';
import { ResourceDeduplicationService } from './resource-deduplication.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ResourceDeduplicationService (ZS-COM-BILL-001 §7 C1-C3 Resource Deduplication)', () => {
  let service: ResourceDeduplicationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceDeduplicationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ResourceDeduplicationService>(
      ResourceDeduplicationService,
    );
  });

  it('computes deterministic canonical ID from tenant, type, and primary key', () => {
    const id1 = service.computeCanonicalId(
      'tenant-1',
      'USER_IDENTITY',
      'alice@company.com',
    );
    const id2 = service.computeCanonicalId(
      'tenant-1',
      'USER_IDENTITY',
      'alice@company.com',
    );
    const id3 = service.computeCanonicalId(
      'tenant-1',
      'USER_IDENTITY',
      'bob@company.com',
    );

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1.startsWith('canon-')).toBe(true);
  });

  it('creates new cluster on first observation from Microsoft Entra', () => {
    const res = service.correlateObservation({
      tenantId: 'tenant-1',
      resourceType: 'USER_IDENTITY',
      primaryIdentifier: 'alice@company.com',
      metricFamily: 'PROTECTED_USERS',
      alias: {
        sourceConnectorId: 'conn-entra-1',
        sourceType: 'MICROSOFT_ENTRA',
        externalIdentifier: 'entra-usr-12345',
        attributes: { upn: 'alice@company.com', department: 'Engineering' },
      },
    });

    expect(res.isNewCluster).toBe(true);
    expect(res.cluster.aliases.length).toBe(1);
    expect(res.cluster.isDeduplicated).toBe(false);
  });

  it('deduplicates multi-connector observation into the same cluster (Entra ID + AWS IAM)', () => {
    // 1st observation: Entra ID
    service.correlateObservation({
      tenantId: 'tenant-1',
      resourceType: 'USER_IDENTITY',
      primaryIdentifier: 'alice@company.com',
      metricFamily: 'PROTECTED_USERS',
      alias: {
        sourceConnectorId: 'conn-entra-1',
        sourceType: 'MICROSOFT_ENTRA',
        externalIdentifier: 'entra-usr-12345',
        attributes: { upn: 'alice@company.com' },
      },
    });

    // 2nd observation: AWS IAM User with same email primary identifier
    const res2 = service.correlateObservation({
      tenantId: 'tenant-1',
      resourceType: 'USER_IDENTITY',
      primaryIdentifier: 'alice@company.com',
      metricFamily: 'PROTECTED_USERS',
      alias: {
        sourceConnectorId: 'conn-aws-1',
        sourceType: 'AWS_IAM',
        externalIdentifier: 'arn:aws:iam::123456789012:user/alice',
        attributes: { email: 'alice@company.com' },
      },
    });

    expect(res2.isNewCluster).toBe(false);
    expect(res2.isNewAlias).toBe(true);
    expect(res2.cluster.aliases.length).toBe(2);
    expect(res2.cluster.isDeduplicated).toBe(true);
  });

  it('detects conflicting multi-meter overlap when same resource is targeted by different metric families (§7 C2)', () => {
    const res = service.correlateObservation({
      tenantId: 'tenant-1',
      resourceType: 'ENDPOINT',
      primaryIdentifier: 'host-fintech-01',
      metricFamily: 'PROTECTED_WORKSTATIONS',
      alias: {
        sourceConnectorId: 'conn-edr-1',
        sourceType: 'CROWDSTRIKE_EDR',
        externalIdentifier: 'aid-abc-123',
        attributes: { hostname: 'host-fintech-01' },
      },
    });

    const isAllowedSame = service.validateMetricFamilyOverlap(
      res.cluster.canonicalResourceId,
      'PROTECTED_WORKSTATIONS',
    );
    expect(isAllowedSame).toBe(true);

    const isAllowedConflict = service.validateMetricFamilyOverlap(
      res.cluster.canonicalResourceId,
      'PROTECTED_SERVERS', // Conflicting metric family
    );
    expect(isAllowedConflict).toBe(false);
  });
});
