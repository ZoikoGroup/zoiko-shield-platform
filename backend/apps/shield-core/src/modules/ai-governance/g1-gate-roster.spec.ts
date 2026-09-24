import { G1GateService, CANONICAL_G1_ROLES } from './g1-gate.service';

describe('G1 Gate Multi-Approver Protocol (§05 & §16)', () => {
  let service: G1GateService;

  beforeEach(() => {
    service = new G1GateService();
  });

  it('initializes with 0 of 8 approvers signed and gateStatus as PENDING_MULTI_APPROVER_SIGNOFF', () => {
    const status = service.getRosterStatus();
    expect(status.gateStatus).toBe('PENDING_MULTI_APPROVER_SIGNOFF');
    expect(status.totalApprovers).toBe(8);
    expect(status.signedCount).toBe(0);
    expect(status.missingRoles.length).toBe(8);
    expect(status.failClosedLiveResponseEnforced).toBe(true);
    expect(status.ratifiedAt).toBeUndefined();
  });

  it('records a cryptographic signature from a valid approver role', () => {
    const approver = service.recordSignature({
      roleId: 'ciso',
      signatoryName: 'Jane Doe, Chief Information Security Officer',
      signatureProof: 'sig_ed25519_98f4b1e7c2a4d3',
      evidenceNotes:
        'Reviewed Cloud HSM KMS integration and zero ungrounded claims.',
    });

    expect(approver.isSigned).toBe(true);
    expect(approver.signatoryName).toBe(
      'Jane Doe, Chief Information Security Officer',
    );
    expect(approver.signatureProofRef).toBe('sig_ed25519_98f4b1e7c2a4d3');

    const status = service.getRosterStatus();
    expect(status.signedCount).toBe(1);
    expect(status.missingRoles.length).toBe(7);
    expect(status.gateStatus).toBe('PENDING_MULTI_APPROVER_SIGNOFF');
  });

  it('rejects an invalid or unknown roleId', () => {
    expect(() =>
      service.recordSignature({
        roleId: 'invalid_role_unknown',
        signatoryName: 'Fake Signer',
        signatureProof: 'sig_fake',
      }),
    ).toThrow();
  });

  it('only transitions to RATIFIED when all 8 distinct domain leads have signed', () => {
    for (const role of CANONICAL_G1_ROLES) {
      service.recordSignature({
        roleId: role.roleId,
        signatoryName: `Designated Lead for ${role.roleTitle}`,
        signatureProof: `sig_fido2_${role.roleId}_valid`,
      });
    }

    const status = service.getRosterStatus();
    expect(status.signedCount).toBe(8);
    expect(status.missingRoles.length).toBe(0);
    expect(status.gateStatus).toBe('RATIFIED');
    expect(status.failClosedLiveResponseEnforced).toBe(false);
    expect(status.ratifiedAt).toBeDefined();
  });

  it('resets roster correctly to fail-closed state', () => {
    service.recordSignature({
      roleId: 'ciso',
      signatoryName: 'Jane Doe',
      signatureProof: 'sig_123',
    });

    expect(service.getRosterStatus().signedCount).toBe(1);

    service.resetRoster();
    const status = service.getRosterStatus();
    expect(status.signedCount).toBe(0);
    expect(status.gateStatus).toBe('PENDING_MULTI_APPROVER_SIGNOFF');
  });
});
