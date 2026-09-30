import { Test, TestingModule } from '@nestjs/testing';
import {
  CertifiedEdrBrokerService,
  EdrActionCommand,
} from './certified-edr-broker.service';

describe('CertifiedEdrBrokerService', () => {
  let service: CertifiedEdrBrokerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CertifiedEdrBrokerService],
    }).compile();

    service = module.get<CertifiedEdrBrokerService>(CertifiedEdrBrokerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should dispatch EDR host isolation and generate verifiable receipt with rollback token', () => {
    const command: EdrActionCommand = {
      commandId: 'cmd-edr-01',
      tenantId: 'tenant-enterprise-01',
      provider: 'CROWDSTRIKE_FALCON',
      actionType: 'ISOLATE_HOST_NETWORK',
      targetHostId: 'host-k8s-node-88',
      incidentReference: 'INC-2026-EDR-01',
      operatorId: 'sec-analyst-01',
    };

    const receipt = service.dispatchEdrAction(command, false);

    expect(receipt.receiptId).toBeDefined();
    expect(receipt.executionStatus).toBe('EXECUTED_CONFIRMED');
    expect(receipt.compensationRollbackToken).toBeDefined();
    expect(receipt.cryptographicSignature).toBeDefined();
  });

  it('should support simulated EDR action without real mutation', () => {
    const command: EdrActionCommand = {
      commandId: 'cmd-edr-02',
      tenantId: 'tenant-enterprise-02',
      provider: 'MICROSOFT_DEFENDER_ENDPOINT',
      actionType: 'TERMINATE_MALICIOUS_PROCESS',
      targetHostId: 'host-win-server-02',
      targetProcessPid: 4404,
      incidentReference: 'INC-2026-EDR-02',
      operatorId: 'sec-analyst-02',
    };

    const receipt = service.dispatchEdrAction(command, true);

    expect(receipt.executionStatus).toBe('SIMULATED_REVERSIBLE');
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
