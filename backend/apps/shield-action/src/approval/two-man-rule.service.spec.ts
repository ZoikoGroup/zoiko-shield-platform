import { Test, TestingModule } from '@nestjs/testing';
import { TwoManRuleService } from './two-man-rule.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('TwoManRuleService', () => {
  let service: TwoManRuleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TwoManRuleService],
    }).compile();

    service = module.get<TwoManRuleService>(TwoManRuleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a Two-Man Rule dual authorization ticket with PENDING_SECOND_APPROVAL status', () => {
    const ticket = service.submitTicket({
      tenantId: 'tenant-enterprise-01',
      initiatorId: 'analyst-tier1@enterprise.com',
      proposalId: 'prop-isolate-vpc-101',
      actionType: 'ISOLATE_VPC_NETWORK',
      targetResource: 'vpc-09128312',
      authorityLevel: 'R3',
      rationale: 'Lateral movement detected across payment subnet',
      ttlMinutes: 20,
    });

    expect(ticket).toBeDefined();
    expect(ticket.ticketId).toMatch(/^ticket-2man-/);
    expect(ticket.status).toBe('PENDING_SECOND_APPROVAL');
    expect(ticket.initiatorId).toBe('analyst-tier1@enterprise.com');
    expect(ticket.authorityLevel).toBe('R3');
    expect(new Date(ticket.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should allow a distinct authorized approver to approve the ticket and generate signature', () => {
    const created = service.submitTicket({
      tenantId: 'tenant-enterprise-01',
      initiatorId: 'analyst-tier1@enterprise.com',
      proposalId: 'prop-purge-iam-99',
      actionType: 'REVOKE_ALL_ENTERPRISE_SESSIONS',
      targetResource: 'iam-role-root-admin',
      authorityLevel: 'R4',
      rationale: 'Active credential leak on public repository',
    });

    const approved = service.approveTicket({
      tenantId: 'tenant-enterprise-01',
      ticketId: created.ticketId,
      approverId: 'ciso-lead@enterprise.com',
      approvalNotes: 'Confirmed key compromise with incident commander.',
      fido2MfaToken: 'fido2-hw-key-verified',
    });

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy).toBe('ciso-lead@enterprise.com');
    expect(approved.approvedAt).toBeDefined();
    expect(approved.approvalSignature).toBeDefined();
    expect(approved.approvalSignature).toHaveLength(64);

    const validation = service.validateDualAuthorization(
      'tenant-enterprise-01',
      created.ticketId,
      'prop-purge-iam-99',
    );
    expect(validation.valid).toBe(true);
    expect(validation.ticket?.status).toBe('APPROVED');
  });

  it('should throw ForbiddenException if initiator attempts to self-approve ticket (Two-Man Rule Violation)', () => {
    const created = service.submitTicket({
      tenantId: 'tenant-enterprise-01',
      initiatorId: 'analyst-tier1@enterprise.com',
      proposalId: 'prop-firewall-rewrite',
      actionType: 'REWRITE_GLOBAL_FIREWALL',
      targetResource: 'fw-edge-cluster',
      authorityLevel: 'R3',
      rationale: 'Zero-day exploit mitigation',
    });

    expect(() =>
      service.approveTicket({
        tenantId: 'tenant-enterprise-01',
        ticketId: created.ticketId,
        approverId: 'analyst-tier1@enterprise.com', // Same as initiator
      }),
    ).toThrow(ForbiddenException);
  });

  it('should reject ticket and record rejector metadata', () => {
    const created = service.submitTicket({
      tenantId: 'tenant-enterprise-01',
      initiatorId: 'analyst-tier1@enterprise.com',
      proposalId: 'prop-isolate-host',
      actionType: 'ISOLATE_HOST',
      targetResource: 'srv-finance-db',
      authorityLevel: 'R3',
      rationale: 'Unusual spike in DB connections',
    });

    const rejected = service.rejectTicket(
      'tenant-enterprise-01',
      created.ticketId,
      'soc-lead@enterprise.com',
      'False positive - scheduled quarterly batch job.',
    );

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectedBy).toBe('soc-lead@enterprise.com');
    expect(rejected.rejectionReason).toContain('False positive');

    const validation = service.validateDualAuthorization(
      'tenant-enterprise-01',
      created.ticketId,
      'prop-isolate-host',
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('REJECTED');
  });

  it('should throw BadRequestException if ticket has expired', () => {
    const created = service.submitTicket({
      tenantId: 'tenant-enterprise-01',
      initiatorId: 'analyst-tier1@enterprise.com',
      proposalId: 'prop-isolate-host',
      actionType: 'ISOLATE_HOST',
      targetResource: 'srv-finance-db',
      authorityLevel: 'R3',
      rationale: 'Unusual spike in DB connections',
      ttlMinutes: -1, // Expired immediately
    });

    expect(() =>
      service.approveTicket({
        tenantId: 'tenant-enterprise-01',
        ticketId: created.ticketId,
        approverId: 'ciso@enterprise.com',
      }),
    ).toThrow(BadRequestException);
  });

  it('should throw NotFoundException for non-existent ticket', () => {
    expect(() =>
      service.getTicket('tenant-enterprise-01', 'ticket-2man-non-existent'),
    ).toThrow(NotFoundException);
  });
});
