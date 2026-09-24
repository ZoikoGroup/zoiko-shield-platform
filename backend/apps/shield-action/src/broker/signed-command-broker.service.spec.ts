import { SignedCommandBrokerService } from './signed-command-broker.service';
import { DevGovernedCommandSigner } from '../command-signing/dev-governed-command-signer.service';

describe('SignedCommandBrokerService (LAB 15 Governed Action Broker)', () => {
  let brokerService: SignedCommandBrokerService;

  beforeEach(() => {
    brokerService = new SignedCommandBrokerService(
      new DevGovernedCommandSigner(),
    );
  });

  it('should create and execute valid signed command with rollback receipt', async () => {
    const tenantId = 'tenant-enterprise-01';

    const envelope = await brokerService.createSignedCommand(
      tenantId,
      'ISOLATE_ENDPOINT',
      'host-prod-db-01',
      'R2',
      'appr-lead-99',
      'policy-v2.1',
      300,
    );

    expect(envelope.commandId).toBeDefined();
    expect(envelope.signature).toBeDefined();

    const receipt = await brokerService.dispatchGovernedCommand(envelope);
    expect(receipt.executionStatus).toBe('EXECUTED_SUCCESSFULLY');
    expect(receipt.observedState).toBe('TARGET_CONTAINED');
    expect(receipt.rollbackReceiptId).toBeDefined();
  });

  it('should reject replayed command with consumed nonce', async () => {
    const tenantId = 'tenant-enterprise-01';

    const envelope = await brokerService.createSignedCommand(
      tenantId,
      'REVOKE_IAM_SESSION',
      'role-compromised',
      'R2',
      'appr-lead-99',
      'policy-v2.1',
    );

    const first = await brokerService.dispatchGovernedCommand(envelope);
    expect(first.executionStatus).toBe('EXECUTED_SUCCESSFULLY');

    // Attempt replay
    const second = await brokerService.dispatchGovernedCommand(envelope);
    expect(second.executionStatus).toBe('REJECTED_REPLAY_NONCE');
    expect(second.observedState).toBe('NO_CHANGE');
  });

  it('should reject expired command envelope', async () => {
    const tenantId = 'tenant-enterprise-01';

    const envelope = await brokerService.createSignedCommand(
      tenantId,
      'DISABLE_USER_ACCOUNT',
      'user@company.com',
      'R2',
      'appr-lead-99',
      'policy-v2.1',
      -10, // Expired 10s ago
    );

    const receipt = await brokerService.dispatchGovernedCommand(envelope);
    expect(receipt.executionStatus).toBe('REJECTED_EXPIRED_COMMAND');
  });
});
