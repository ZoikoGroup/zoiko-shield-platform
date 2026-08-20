import { Test, TestingModule } from '@nestjs/testing';
import { QuarantineService } from './quarantine.service';
import { NotFoundException } from '@nestjs/common';

describe('QuarantineService (Ingestion DLQ & Error Isolation)', () => {
  let service: QuarantineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuarantineService],
    }).compile();

    service = module.get<QuarantineService>(QuarantineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('quarantines malformed payload with error reason and SHA-256 payload hash', () => {
    const record = service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-aws-01',
      sourceEventId: 'evt-bad-1',
      rawPayload: '{"malformed": "json, missing brace',
      failureReason: 'PARSER_EXCEPTION',
      errorMessage: 'Unexpected end of JSON input',
    });

    expect(record.quarantineId).toBeDefined();
    expect(record.payloadHash).toBeDefined();
    expect(record.status).toBe('PENDING_REVIEW');
    expect(record.failureReason).toBe('PARSER_EXCEPTION');

    const fetched = service.getQuarantinedEvent('tenant-1', record.quarantineId);
    expect(fetched.quarantineId).toBe(record.quarantineId);
  });

  it('marks quarantined event as reprocessed after fix', () => {
    const record = service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-syslog-01',
      rawPayload: '<bad syslog>',
      failureReason: 'SCHEMA_MISMATCH',
      errorMessage: 'Invalid facility header',
    });

    const updated = service.markReprocessed('tenant-1', record.quarantineId);
    expect(updated.status).toBe('REPROCESSED');
    expect(updated.reprocessedAt).toBeDefined();
  });

  it('blocks cross-tenant access to quarantined events', () => {
    const record = service.quarantine({
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      connectorId: 'conn-1',
      rawPayload: 'bad data',
      failureReason: 'UNKNOWN',
      errorMessage: 'Error',
    });

    expect(() =>
      service.getQuarantinedEvent('tenant-2', record.quarantineId),
    ).toThrow(NotFoundException);
  });
});
