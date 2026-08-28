import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AuditPackageExportService } from './audit-package-export.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import * as fs from 'fs';

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('AuditPackageExportService', () => {
  let service: AuditPackageExportService;
  let prisma: any;
  let storageService: any;

  const tenantId = 'tenant-demo';
  const packageId = 'pkg-001';

  beforeEach(async () => {
    prisma = {
      auditPackage: {
        findFirst: jest.fn(),
      },
      auditPackageManifest: {
        findUnique: jest.fn(),
      },
    };

    storageService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditPackageExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: ObjectStorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<AuditPackageExportService>(AuditPackageExportService);
  });

  it('should export manifest correctly for a frozen package', async () => {
    const frozenContent = {
      packageId,
      version: '1.0.0',
      status: 'FROZEN',
      merkleRoot: 'root-hash-123',
    };

    prisma.auditPackage.findFirst.mockResolvedValue({
      id: packageId,
      tenant_id: tenantId,
      status: 'FROZEN',
    });

    prisma.auditPackageManifest.findUnique.mockResolvedValue({
      package_id: packageId,
      manifest_content: JSON.stringify(frozenContent),
      manifest_core_content: JSON.stringify(frozenContent),
    });

    const result = await service.exportManifest(tenantId, packageId);
    expect(result).toEqual(frozenContent);
  });

  it('should export evidence index in jsonl format', async () => {
    const manifest = {
      evidenceIndex: [
        { evidenceId: 'ev-1', hash: 'h1' },
        { evidenceId: 'ev-2', hash: 'h2' },
      ],
    };

    prisma.auditPackage.findFirst.mockResolvedValue({
      id: packageId,
      tenant_id: tenantId,
      status: 'BUILT',
    });

    prisma.auditPackageManifest.findUnique.mockResolvedValue({
      package_id: packageId,
      manifest_core_content: JSON.stringify(manifest),
    });

    const jsonl = await service.exportEvidenceIndexJsonl(tenantId, packageId);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).evidenceId).toBe('ev-1');
    expect(JSON.parse(lines[1]).evidenceId).toBe('ev-2');
  });

  it('should throw ConflictException when exporting non-frozen package to directory', async () => {
    prisma.auditPackage.findFirst.mockResolvedValue({
      id: packageId,
      tenant_id: tenantId,
      status: 'DRAFT',
    });

    await expect(
      service.exportToDirectory(tenantId, packageId, '/tmp/export-dir'),
    ).rejects.toThrow(ConflictException);
  });

  it('should export directory bundle for frozen package with envelope and manifest', async () => {
    prisma.auditPackage.findFirst.mockResolvedValue({
      id: packageId,
      tenant_id: tenantId,
      version: '1.0.0',
      status: 'FROZEN',
    });

    prisma.auditPackageManifest.findUnique.mockResolvedValue({
      package_id: packageId,
      manifest_content: JSON.stringify({ packageId, evidenceIndex: [] }),
      package_envelope_hash: 'env-hash-abc',
    });

    await service.exportToDirectory(
      tenantId,
      packageId,
      '/tmp/export-dir',
      false,
    );

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/export-dir', {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
