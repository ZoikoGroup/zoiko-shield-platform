import { OtThreatDetectorService } from './ot-threat-detector.service';

describe('OtThreatDetectorService', () => {
  let service: OtThreatDetectorService;

  beforeEach(() => {
    service = new OtThreatDetectorService();
  });

  it('should detect unauthorized Modbus coil write command', async () => {
    const finding = await service.analyzeOtEvent({
      eventId: 'evt-modbus-01',
      tenantId: 'tenant-power-grid',
      timestamp: new Date().toISOString(),
      sourceIp: '192.168.1.100',
      destinationIp: '10.240.10.15',
      destinationPort: 502,
      protocol: 'MODBUS_TCP',
      functionCode: 0x05, // Write Single Coil
      payloadHex: '0001ff00',
    });

    expect(finding).not.toBeNull();
    expect(finding?.threatType).toBe('MODBUS_UNAUTHORIZED_FUNCTION_WRITE');
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.safetyCriticalImpact).toBe(true);
  });

  it('should detect unauthorized DNP3 outstation restart command', async () => {
    const finding = await service.analyzeOtEvent({
      eventId: 'evt-dnp3-01',
      tenantId: 'tenant-power-grid',
      timestamp: new Date().toISOString(),
      sourceIp: '192.168.1.105',
      destinationIp: '10.240.10.20',
      destinationPort: 20000,
      protocol: 'DNP3',
      functionCode: 0x0d, // Cold Restart
      unitIdOrStation: '4',
      payloadHex: '0564010d',
    });

    expect(finding).not.toBeNull();
    expect(finding?.threatType).toBe('DNP3_UNAUTHORIZED_COLD_RESTART');
    expect(finding?.severity).toBe('CRITICAL');
  });

  it('should detect unauthorized OPC-UA mutation on emergency node', async () => {
    const finding = await service.analyzeOtEvent({
      eventId: 'evt-opcua-01',
      tenantId: 'tenant-power-grid',
      timestamp: new Date().toISOString(),
      sourceIp: '192.168.1.110',
      destinationIp: '10.240.10.30',
      destinationPort: 4840,
      protocol: 'OPC_UA',
      serviceOrMethod: 'WriteRequest',
      nodeId: 'ns=2;s=Turbine.EmergencyTrip',
      payloadHex: '01000000',
    });

    expect(finding).not.toBeNull();
    expect(finding?.threatType).toBe('OPC_UA_SAFETY_NODE_MUTATION');
    expect(finding?.safetyCriticalImpact).toBe(true);
  });

  it('should return rules catalog with all supported OT protocols', () => {
    const catalog = service.getRulesCatalog();
    expect(catalog.totalRules).toBeGreaterThanOrEqual(5);
    expect(catalog.supportedProtocols).toContain('MODBUS_TCP');
    expect(catalog.supportedProtocols).toContain('DNP3');
    expect(catalog.supportedProtocols).toContain('OPC_UA');
  });
});
