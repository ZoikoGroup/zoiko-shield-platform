import { EmergencyFreezeLockdownService } from './emergency-freeze-lockdown.service';
import { ForbiddenException } from '@nestjs/common';

describe('EmergencyFreezeLockdownService (ZS-ENG-DRS-001 §19.4)', () => {
  let freezeService: EmergencyFreezeLockdownService;

  beforeEach(() => {
    freezeService = new EmergencyFreezeLockdownService();
  });

  it('1. should allow actions when no freezes are active', () => {
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).not.toThrow();

    const status = freezeService.checkFreezeStatus({
      tenantId: 'tenant-01',
      actionType: 'ISOLATE_ENDPOINT',
    });
    expect(status.frozen).toBe(false);
  });

  it('2. should block all actions when GLOBAL freeze is engaged', () => {
    freezeService.engageFreeze({
      scope: 'GLOBAL',
      reason: 'Global Log4j/Supply-chain Zero-Day incident response',
      initiatedBy: 'ciso@zoiko.com',
    });

    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).toThrow(ForbiddenException);
  });

  it('3. should block only targeted region when REGIONAL freeze is engaged', () => {
    freezeService.engageFreeze({
      scope: 'REGIONAL',
      region: 'eu-west-1',
      reason: 'EU-West data center fiber severed',
      initiatedBy: 'sre-lead@zoiko.com',
    });

    // Blocked for eu-west-1
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        region: 'eu-west-1',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).toThrow(ForbiddenException);

    // Allowed for us-east-1
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        region: 'us-east-1',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).not.toThrow();
  });

  it('4. should block tenant actions when TENANT lockdown is engaged', () => {
    freezeService.engageFreeze({
      scope: 'TENANT',
      tenantId: 'tenant-compromised-99',
      reason: 'Active adversarial lateral movement detected',
      initiatedBy: 'secops-lead@zoiko.com',
    });

    // Blocked for targeted tenant
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-compromised-99',
        actionType: 'DISABLE_USER_ACCOUNT',
      });
    }).toThrow(ForbiddenException);

    // Allowed for another healthy tenant
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-healthy-01',
        actionType: 'DISABLE_USER_ACCOUNT',
      });
    }).not.toThrow();
  });

  it('5. should enforce Dual-Custody for releasing high-impact GLOBAL freeze', () => {
    const freeze = freezeService.engageFreeze({
      scope: 'GLOBAL',
      reason: 'Critical cloud outage response',
      initiatedBy: 'ciso@zoiko.com',
    });

    // Initiator cannot unfreeze alone
    expect(() => {
      freezeService.approveUnfreeze(freeze.freezeId, 'ciso@zoiko.com');
    }).toThrow(ForbiddenException);

    // First independent approver signs
    const firstApproval = freezeService.approveUnfreeze(freeze.freezeId, 'head-of-secops@zoiko.com');
    expect(firstApproval.released).toBe(false);
    expect(firstApproval.message).toContain('Awaiting secondary approval');

    // Second independent approver signs
    const secondApproval = freezeService.approveUnfreeze(freeze.freezeId, 'cto@zoiko.com');
    expect(secondApproval.released).toBe(true);
    expect(secondApproval.message).toContain('fully released');

    // Now actions should be permitted
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).not.toThrow();
  });
});
