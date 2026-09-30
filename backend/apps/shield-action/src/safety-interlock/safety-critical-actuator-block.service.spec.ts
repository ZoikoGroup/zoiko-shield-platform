import { SafetyCriticalActuatorBlockService } from './safety-critical-actuator-block.service';

describe('SafetyCriticalActuatorBlockService', () => {
  let service: SafetyCriticalActuatorBlockService;

  beforeEach(() => {
    service = new SafetyCriticalActuatorBlockService();
  });

  it('should block automated playbook mutation on safety-critical PLC', async () => {
    const receipt = await service.evaluateActuatorInterlock({
      tenantId: 'tenant-power-grid',
      commandId: 'cmd-101',
      actionType: 'WRITE_MODBUS_COIL',
      targetDescriptor: {
        targetRef: 'plc-substation-alpha-01',
        deviceCategory: 'INDUSTRIAL_PLC',
        protocol: 'MODBUS_TCP',
        ipAddressOrEndpoint: '10.240.10.15',
        unitIdOrNodeId: '1',
        registerOrCoilRange: '0x0001-0x0010',
        safetyCritical: true,
        facilityLocation: 'Substation-Alpha',
      },
      payloadMutation: { coilAddress: 1, value: 1 },
      automatedPlaybookRef: 'playbook-auto-isolate-v1',
    });

    expect(receipt.interlockStatus).toBe('BLOCKED_SAFETY_INTERLOCK_ACTIVE');
    expect(receipt.failsafeReversible).toBe(false);
    expect(receipt.reason).toContain(
      'Automated playbook mutation strictly blocked',
    );
  });

  it('should permit mutation when valid dual-key physical token authorization is provided', async () => {
    const receipt = await service.evaluateActuatorInterlock({
      tenantId: 'tenant-power-grid',
      commandId: 'cmd-102',
      actionType: 'WRITE_MODBUS_COIL',
      targetDescriptor: {
        targetRef: 'plc-substation-alpha-01',
        deviceCategory: 'INDUSTRIAL_PLC',
        protocol: 'MODBUS_TCP',
        ipAddressOrEndpoint: '10.240.10.15',
        unitIdOrNodeId: '1',
        registerOrCoilRange: '0x0001-0x0010',
        safetyCritical: true,
        facilityLocation: 'Substation-Alpha',
      },
      payloadMutation: { coilAddress: 1, value: 1 },
      automatedPlaybookRef: 'playbook-auto-isolate-v1',
      dualKeyAuthorization: {
        primaryOperatorId: 'operator-1',
        primaryOperatorFido2Signature: 'sig-fido2-operator-valid',
        secondarySafetyEngineerId: 'engineer-2',
        secondarySafetyEngineerTokenSignature: 'sig-token-engineer-valid',
        physicalInterlockKeySerial: 'YUBIKEY-HSM-SAFETY-9982',
        signedAt: new Date().toISOString(),
        challengeNonce: 'nonce-9921',
      },
    });

    expect(receipt.interlockStatus).toBe('MUTATION_PERMITTED_DUAL_KEY');
    expect(receipt.failsafeReversible).toBe(true);
    expect(receipt.physicalInterlockKeySerial).toBe('YUBIKEY-HSM-SAFETY-9982');
  });

  it('should engage emergency failsafe isolation when requested', async () => {
    const receipt = await service.engageEmergencyFailsafe(
      'tenant-power-grid',
      'scada-rtu-pump-3',
      'Overpressure threshold exceeded',
    );

    expect(receipt.interlockStatus).toBe('FAILSAFE_ISOLATION_ENGAGED');
    expect(receipt.reason).toContain('Overpressure threshold exceeded');
  });
});
