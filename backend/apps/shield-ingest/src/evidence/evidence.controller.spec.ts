import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { HttpStatus } from '@nestjs/common';

describe('EvidenceController', () => {
  let controller: EvidenceController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      createEvidence: jest.fn(),
      getEvidenceByTenant: jest.fn(),
      getEvidenceById: jest.fn(),
      verifyEvidenceIntegrity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvidenceController],
      providers: [{ provide: EvidenceService, useValue: serviceMock }],
    }).compile();

    controller = module.get<EvidenceController>(EvidenceController);
  });

  it('should create evidence and return CREATED status', async () => {
    const mockEvidence = { id: 'ev-1', sha256_hash: 'hash123' };
    serviceMock.createEvidence.mockResolvedValue(mockEvidence);

    const response = await controller.createEvidence('tenant-1', {
      environmentId: 'env-1',
      region: 'eu-west-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Audit Log',
      rawContent: 'Sample log',
    });

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(response.data).toBe(mockEvidence);
  });

  it('should verify evidence integrity and return OK status', async () => {
    const mockVerify = { isIntegrityValid: true };
    serviceMock.verifyEvidenceIntegrity.mockResolvedValue(mockVerify);

    const response = await controller.verifyEvidenceIntegrity(
      'tenant-1',
      'ev-1',
    );
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockVerify);
    expect(serviceMock.verifyEvidenceIntegrity).toHaveBeenCalledWith(
      'tenant-1',
      'ev-1',
    );
  });
});
