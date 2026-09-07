import { Test, TestingModule } from '@nestjs/testing';
import {
  SignedCommandBrokerService,
  SignedCommandEnvelope,
} from './broker/signed-command-broker.service';
import { CloudHsmSignerService } from './command-signing/cloud-hsm-signer.service';

describe('LAB 15 — Action Broker & Governed Response Hard Boundaries', () => {
  let brokerService: SignedCommandBrokerService;
  let hsmSigner: CloudHsmSignerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignedCommandBrokerService, CloudHsmSignerService],
    }).compile();

    brokerService = module.get<SignedCommandBrokerService>(SignedCommandBrokerService);
    hsmSigner = module.get<CloudHsmSignerService>(CloudHsmSignerService);
  });

  describe('Non-Exportable Key Posture (Section 7 Hard Boundary)', () => {
    it('should confirm broker workloads hold no exportable private key APIs', () => {
      const metadata = hsmSigner.getActiveKeyMetadata();
      expect(metadata.keyId).toBeDefined();
      expect(metadata.publicKeyPem).toBeDefined();
      expect(metadata.hsmEnclaveId).toBe('gcp-cloud-hsm-us-east1-cluster01');
      expect(metadata.fipsLevel).toBe('FIPS_140_3_LEVEL_3');

      // The public metadata contract must NEVER contain privateKeyPem
      expect((metadata as any).privateKeyPem).toBeUndefined();
    });
  });

  describe('LAB 15 Mandatory Negative Command Tests', () => {
    it('Negative 1 (Replay): should REJECT replayed command with duplicate nonce', () => {
      const command = brokerService.createSignedCommand(
        'tenant-alpha',
        'ISOLATE_ENDPOINT',
        'host-srv-01',
        'R1',
        'appr-1234',
        '1.0',
      );

      // First dispatch succeeds
      const receipt1 = brokerService.dispatchGovernedCommand(command);
      expect(receipt1.executionStatus).toBe('EXECUTED_SUCCESSFULLY');
      expect(receipt1.observedState).toBe('TARGET_CONTAINED');

      // Replay attempt with same envelope / nonce must be rejected
      const receipt2 = brokerService.dispatchGovernedCommand(command);
      expect(receipt2.executionStatus).toBe('REJECTED_REPLAY_NONCE');
      expect(receipt2.observedState).toBe('NO_CHANGE');
      expect(receipt2.attestationDigest).toBeDefined();
    });

    it('Negative 2 (Expired): should REJECT expired command envelope', () => {
      const expiredEnvelope: SignedCommandEnvelope = {
        commandId: 'cmd-expired-1',
        tenantId: 'tenant-alpha',
        actionType: 'DISABLE_USER_ACCOUNT',
        targetRef: 'user-compromised-99',
        authorityLevel: 'R1',
        approvalRef: 'appr-5678',
        policyVersion: '1.0',
        expiresAt: new Date(Date.now() - 10000).toISOString(), // 10 seconds in the past
        nonce: 'nonce-exp-999',
        signature: 'simulated-signature',
      };

      const receipt = brokerService.dispatchGovernedCommand(expiredEnvelope);
      expect(receipt.executionStatus).toBe('REJECTED_EXPIRED_COMMAND');
      expect(receipt.observedState).toBe('NO_CHANGE');
    });

    it('Negative 3 (Invalid Signature): should REJECT tampered / unsigned command', () => {
      const validCommand = brokerService.createSignedCommand(
        'tenant-alpha',
        'QUARANTINE_SUBNET',
        'subnet-10-0-1-0',
        'R1',
        'appr-9999',
        '1.0',
      );

      // Tamper with targetRef without re-signing
      const tamperedCommand: SignedCommandEnvelope = {
        ...validCommand,
        targetRef: 'subnet-10-0-2-0-TAMPERED',
      };

      const receipt = brokerService.dispatchGovernedCommand(tamperedCommand);
      expect(receipt.executionStatus).toBe('REJECTED_VALIDATION_FAILURE');
      expect(receipt.observedState).toBe('NO_CHANGE');
    });
  });

  describe('Positive Simulation & Governed Execution Path', () => {
    it('should produce signed execution receipt with rollback reference on valid execution', () => {
      const command = brokerService.createSignedCommand(
        'tenant-alpha',
        'REVOKE_IAM_SESSION',
        'session-sess-100',
        'R1',
        'appr-soc-1',
        '1.0',
        600,
      );

      const receipt = brokerService.dispatchGovernedCommand(command);
      expect(receipt.executionStatus).toBe('EXECUTED_SUCCESSFULLY');
      expect(receipt.observedState).toBe('TARGET_CONTAINED');
      expect(receipt.rollbackReceiptId).toBeDefined();
      expect(receipt.attestationDigest).toHaveLength(64); // SHA-256 hex
    });
  });
});
