import { Test, TestingModule } from '@nestjs/testing';
import { ActionRollbackBrokerService } from './action-rollback-broker.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('LAB 15 — SOAR Response Reversible Rollback & Compensation', () => {
  let rollbackBroker: ActionRollbackBrokerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActionRollbackBrokerService],
    }).compile();

    rollbackBroker = module.get<ActionRollbackBrokerService>(
      ActionRollbackBrokerService,
    );
  });

  describe('Execution Receipt & Compensating Action Registration', () => {
    it('should record forward action and generate valid rollback token with state snapshot', () => {
      const receipt = rollbackBroker.recordExecution({
        tenantId: 'tenant-alpha',
        actionCommandId: 'cmd-act-101',
        actionType: 'ISOLATE_ENDPOINT',
        targetIdentifier: 'host-web-srv-01',
        status: 'SUCCESS',
        beforeState: { networkStatus: 'CONNECTED', isolationState: 'NONE' },
        afterState: { networkStatus: 'QUARANTINED', isolationState: 'ISOLATED' },
        compensatingAction: {
          actionType: 'UNISOLATE_ENDPOINT',
          targetIdentifier: 'host-web-srv-01',
          parameters: { restoreNetworkPolicy: 'default-allow-internal' },
        },
      });

      expect(receipt.receiptId.startsWith('rcpt-')).toBe(true);
      expect(receipt.rollbackToken.startsWith('rb-tok-')).toBe(true);
      expect(receipt.status).toBe('SUCCESS');
      expect(receipt.compensatingAction.actionType).toBe('UNISOLATE_ENDPOINT');
    });
  });

  describe('Rollback Execution & Compensation', () => {
    it('should successfully execute compensating action and update status to ROLLED_BACK', async () => {
      const receipt = rollbackBroker.recordExecution({
        tenantId: 'tenant-alpha',
        actionCommandId: 'cmd-act-102',
        actionType: 'DISABLE_USER_ACCOUNT',
        targetIdentifier: 'user-john-doe',
        status: 'SUCCESS',
        beforeState: { accountStatus: 'ACTIVE' },
        afterState: { accountStatus: 'SUSPENDED' },
        compensatingAction: {
          actionType: 'ENABLE_USER_ACCOUNT',
          targetIdentifier: 'user-john-doe',
          parameters: {},
        },
      });

      let compensatingExecutorCalled = false;
      const updatedReceipt = await rollbackBroker.executeRollback(
        'tenant-alpha',
        receipt.rollbackToken,
        async (comp) => {
          expect(comp.actionType).toBe('ENABLE_USER_ACCOUNT');
          expect(comp.targetIdentifier).toBe('user-john-doe');
          compensatingExecutorCalled = true;
          return true;
        },
      );

      expect(compensatingExecutorCalled).toBe(true);
      expect(updatedReceipt.status).toBe('ROLLED_BACK');
      expect(updatedReceipt.rolledBackAt).toBeDefined();
    });

    it('should REJECT duplicate rollback execution on an already rolled-back action', async () => {
      const receipt = rollbackBroker.recordExecution({
        tenantId: 'tenant-alpha',
        actionCommandId: 'cmd-act-103',
        actionType: 'QUARANTINE_SUBNET',
        targetIdentifier: 'subnet-10-0-1-0',
        status: 'SUCCESS',
        beforeState: { cidr: '10.0.1.0/24' },
        afterState: { cidr: '10.0.1.0/24', blackholed: true },
        compensatingAction: {
          actionType: 'RESTORE_SUBNET',
          targetIdentifier: 'subnet-10-0-1-0',
          parameters: {},
        },
      });

      // First rollback succeeds
      await rollbackBroker.executeRollback('tenant-alpha', receipt.rollbackToken);

      // Second rollback attempt with consumed token must fail
      await expect(
        rollbackBroker.executeRollback('tenant-alpha', receipt.rollbackToken),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent cross-tenant rollback attempts', async () => {
      const receipt = rollbackBroker.recordExecution({
        tenantId: 'tenant-alpha',
        actionCommandId: 'cmd-act-104',
        actionType: 'REVOKE_IAM_SESSION',
        targetIdentifier: 'sess-abc-123',
        status: 'SUCCESS',
        beforeState: {},
        afterState: {},
        compensatingAction: {
          actionType: 'RESTORE_IAM_SESSION',
          targetIdentifier: 'sess-abc-123',
          parameters: {},
        },
      });

      // Attempting to roll back tenant-alpha token from tenant-beta context
      await expect(
        rollbackBroker.executeRollback('tenant-beta', receipt.rollbackToken),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
