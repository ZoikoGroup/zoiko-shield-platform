import { Test, TestingModule } from '@nestjs/testing';
import { ActionRollbackBrokerService } from './action-rollback-broker.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ActionRollbackBrokerService (Receipts & Reversibility)', () => {
  let service: ActionRollbackBrokerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActionRollbackBrokerService],
    }).compile();

    service = module.get<ActionRollbackBrokerService>(
      ActionRollbackBrokerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('records action receipt and issues single-use rollback token', () => {
    const receipt = service.recordExecution({
      tenantId: 'tenant-1',
      actionCommandId: 'cmd-100',
      actionType: 'host.isolate',
      targetIdentifier: 'host-srv-01',
      status: 'SUCCESS',
      beforeState: { networkStatus: 'CONNECTED' },
      afterState: { networkStatus: 'ISOLATED' },
      compensatingAction: {
        actionType: 'host.unisolate',
        targetIdentifier: 'host-srv-01',
        parameters: { restoreNetwork: true },
      },
    });

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.rollbackToken).toBeDefined();
    expect(receipt.status).toBe('SUCCESS');

    const fetched = service.getReceipt('tenant-1', receipt.receiptId);
    expect(fetched.receiptId).toBe(receipt.receiptId);
  });

  it('executes rollback and transitions status to ROLLED_BACK', async () => {
    const receipt = service.recordExecution({
      tenantId: 'tenant-1',
      actionCommandId: 'cmd-200',
      actionType: 'ip.block',
      targetIdentifier: '198.51.100.44',
      status: 'SUCCESS',
      beforeState: { firewallRule: 'ALLOW' },
      afterState: { firewallRule: 'DROP' },
      compensatingAction: {
        actionType: 'ip.unblock',
        targetIdentifier: '198.51.100.44',
        parameters: { removeRuleId: 'fw-rule-99' },
      },
    });

    let executedComp: any = null;
    const rolledBack = await service.executeRollback(
      'tenant-1',
      receipt.rollbackToken,
      async (comp) => {
        executedComp = comp;
        return true;
      },
    );

    expect(rolledBack.status).toBe('ROLLED_BACK');
    expect(rolledBack.rolledBackAt).toBeDefined();
    expect(executedComp.actionType).toBe('ip.unblock');

    // Rollback token is single-use and consumed
    await expect(
      service.executeRollback('tenant-1', receipt.rollbackToken),
    ).rejects.toThrow(NotFoundException);
  });
});
