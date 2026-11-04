import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CertifiedEdrBrokerService,
  EdrActionCommand,
} from './certified-edr-broker.service';
import { DualCustodyQuorumService } from '../dual-custody/dual-custody-quorum.service';

describe('CertifiedEdrBrokerService', () => {
  let service: CertifiedEdrBrokerService;
  let consumeForExecution: jest.Mock;

  const isolate: EdrActionCommand = {
    commandId: 'cmd-edr-01',
    tenantId: 'tenant-enterprise-01',
    provider: 'CROWDSTRIKE_FALCON',
    actionType: 'ISOLATE_HOST_NETWORK',
    targetHostId: 'host-k8s-node-88',
    incidentReference: 'INC-2026-EDR-01',
    operatorId: 'sec-analyst-01',
  };

  beforeEach(() => {
    consumeForExecution = jest.fn();
    service = new CertifiedEdrBrokerService({
      consumeForExecution,
    } as unknown as DualCustodyQuorumService);
  });

  it('simulates a destructive EDR action without requiring approval or mutating anything', async () => {
    const receipt = await service.dispatchEdrAction(
      {
        ...isolate,
        actionType: 'TERMINATE_MALICIOUS_PROCESS',
        targetProcessPid: 4404,
      },
      true,
    );

    expect(receipt.executionStatus).toBe('SIMULATED_REVERSIBLE');
    expect(receipt.compensationRollbackToken).toBeDefined();
    expect(consumeForExecution).not.toHaveBeenCalled();
  });

  it('refuses live host isolation when the dual-custody quorum is missing or invalid', async () => {
    consumeForExecution.mockRejectedValue(new ForbiddenException('no quorum'));

    await expect(service.dispatchEdrAction(isolate, false)).rejects.toThrow(
      ForbiddenException,
    );
    expect(consumeForExecution).toHaveBeenCalledWith(
      'tenant-enterprise-01',
      undefined,
      'ISOLATE_HOST_NETWORK',
      'host-k8s-node-88',
    );
  });

  it('binds the quorum to the exact tenant, action and host, then fails closed with no provider wired', async () => {
    consumeForExecution.mockResolvedValue({});
    const approval = { quorumId: 'quorum-1', proposalId: 'prop-1' };

    await expect(
      service.dispatchEdrAction({ ...isolate, approval }, false),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(consumeForExecution).toHaveBeenCalledWith(
      'tenant-enterprise-01',
      approval,
      'ISOLATE_HOST_NETWORK',
      'host-k8s-node-88',
    );
  });

  it('never reports EXECUTED_CONFIRMED for a live dispatch, even for restorative actions', async () => {
    await expect(
      service.dispatchEdrAction(
        { ...isolate, actionType: 'RESTORE_HOST_CONNECTIVITY' },
        false,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(consumeForExecution).not.toHaveBeenCalled();
  });

  it('should successfully execute EDR rollback with compensation token', () => {
    const rollback = service.rollbackEdrAction(
      'tenant-enterprise-01',
      'edr-rcpt-sample',
      'token-sample-rollback',
      'Containment complete, restoring connectivity',
    );

    expect(rollback.rollbackStatus).toBe('ROLLBACK_SUCCESSFULLY_APPLIED');
    expect(rollback.rollbackReceiptId).toBeDefined();
  });
});
