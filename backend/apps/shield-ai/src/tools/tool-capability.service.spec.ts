import { Test, TestingModule } from '@nestjs/testing';
import { ToolCapabilityService } from './tool-capability.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('ToolCapabilityService (ZS-ENG-AI-001 §15)', () => {
  let service: ToolCapabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolCapabilityService],
    }).compile();

    service = module.get<ToolCapabilityService>(ToolCapabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('issues short-lived capability grant for T0 tool (case.read)', () => {
    const grant = service.issueGrant({
      agentPrincipal: 'agent-investigator-01',
      tenantId: 'tenant-1',
      toolName: 'case.read',
      resourceScope: 'case:case-100',
      ttlSeconds: 60,
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.sideEffectClass).toBe('T0');
    expect(grant.revoked).toBe(false);

    const verified = service.verifyGrant(grant.grantId, {
      tenantId: 'tenant-1',
      toolName: 'case.read',
    });
    expect(verified.grantId).toBe(grant.grantId);
  });

  it('strictly rejects T5 prohibited tools (evidence.delete) with ForbiddenException', () => {
    expect(() =>
      service.issueGrant({
        agentPrincipal: 'agent-investigator-01',
        tenantId: 'tenant-1',
        toolName: 'evidence.delete',
        resourceScope: 'all',
      }),
    ).toThrow(ForbiddenException);
  });

  it('blocks cross-tenant grant usage', () => {
    const grant = service.issueGrant({
      agentPrincipal: 'agent-investigator-01',
      tenantId: 'tenant-1',
      toolName: 'telemetry.query',
      resourceScope: 'logs',
    });

    expect(() =>
      service.verifyGrant(grant.grantId, {
        tenantId: 'tenant-2',
        toolName: 'telemetry.query',
      }),
    ).toThrow(ForbiddenException);
  });

  it('blocks revoked grants', () => {
    const grant = service.issueGrant({
      agentPrincipal: 'agent-investigator-01',
      tenantId: 'tenant-1',
      toolName: 'draft_note.create',
      resourceScope: 'case:case-1',
    });

    service.revokeGrant(grant.grantId);

    expect(() =>
      service.verifyGrant(grant.grantId, {
        tenantId: 'tenant-1',
        toolName: 'draft_note.create',
      }),
    ).toThrow(ForbiddenException);
  });

  it('blocks expired grants', () => {
    const grant = service.issueGrant({
      agentPrincipal: 'agent-investigator-01',
      tenantId: 'tenant-1',
      toolName: 'event.aggregate',
      resourceScope: 'case:case-1',
      ttlSeconds: -1, // already expired
    });

    expect(() =>
      service.verifyGrant(grant.grantId, {
        tenantId: 'tenant-1',
        toolName: 'event.aggregate',
      }),
    ).toThrow(UnauthorizedException);
  });
});
