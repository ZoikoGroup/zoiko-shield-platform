import { Test, TestingModule } from '@nestjs/testing';
import { ActionAuthorityService } from './action-authority.service';
import { ForbiddenException } from '@nestjs/common';

describe('ActionAuthorityService (R0-R4 Response Authority Matrix)', () => {
  let service: ActionAuthorityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActionAuthorityService],
    }).compile();

    service = module.get<ActionAuthorityService>(ActionAuthorityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows R0 in simulation mode and blocks R0 in live mode', () => {
    expect(
      service.validateAuthority({
        authorityLevel: 'R0',
        proposalStatus: 'APPROVED',
        approverIds: ['analyst-1'],
        actionType: 'host.isolate',
        isSimulation: true,
      }).allowed,
    ).toBe(true);

    expect(
      service.validateAuthority({
        authorityLevel: 'R0',
        proposalStatus: 'APPROVED',
        approverIds: ['analyst-1'],
        actionType: 'host.isolate',
        isSimulation: false,
      }).allowed,
    ).toBe(false);
  });

  it('allows R1, R2, R3 with single approved human reviewer', () => {
    for (const level of ['R1', 'R2', 'R3'] as const) {
      const result = service.validateAuthority({
        authorityLevel: level,
        proposalStatus: 'APPROVED',
        approverIds: ['soc-lead-1'],
        actionType: 'session.revoke',
      });
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks R4 when only 1 approver is provided (requires Dual Approval)', () => {
    const result = service.validateAuthority({
      authorityLevel: 'R4',
      proposalStatus: 'APPROVED',
      approverIds: ['soc-lead-1'],
      actionType: 'subnet.sever',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('dual-key approval');

    expect(() =>
      service.assertAuthority({
        authorityLevel: 'R4',
        proposalStatus: 'APPROVED',
        approverIds: ['soc-lead-1'],
        actionType: 'subnet.sever',
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows R4 when 2 distinct approvers are provided', () => {
    const result = service.validateAuthority({
      authorityLevel: 'R4',
      proposalStatus: 'APPROVED',
      approverIds: ['soc-lead-1', 'ciso-admin-2'],
      actionType: 'subnet.sever',
    });

    expect(result.allowed).toBe(true);
  });
});
