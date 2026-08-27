import { EmergencyFreezeLockdownService } from './emergency-freeze-lockdown.service';
import { ForbiddenException } from '@nestjs/common';

describe('EmergencyFreezeLockdownService', () => {
  let freezeService: EmergencyFreezeLockdownService;

  beforeEach(() => {
    freezeService = new EmergencyFreezeLockdownService();
  });

  it('should allow actions when no freezes are active', () => {
    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'ISOLATE_ENDPOINT',
      });
    }).not.toThrow();
  });

  it('should block all actions when GLOBAL freeze is engaged', () => {
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

  it('should block tenant actions when TENANT lockdown is engaged', () => {
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

  it('should release freeze when authorized release command is executed', () => {
    const freeze = freezeService.engageFreeze({
      scope: 'ACTION_TYPE',
      scopeRef: 'REVOKE_IAM_SESSION',
      reason: 'Cloud provider IAM rate limit throttling',
      initiatedBy: 'secops@zoiko.com',
    });

    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'REVOKE_IAM_SESSION',
      });
    }).toThrow(ForbiddenException);

    freezeService.releaseFreeze(freeze.freezeId, 'ciso@zoiko.com');

    expect(() => {
      freezeService.assertNotFrozen({
        tenantId: 'tenant-01',
        actionType: 'REVOKE_IAM_SESSION',
      });
    }).not.toThrow();
  });
});
