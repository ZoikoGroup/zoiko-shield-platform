import { OfflineTelemetryBufferService } from './offline-telemetry-buffer.service';

describe('OfflineTelemetryBufferService', () => {
  let service: OfflineTelemetryBufferService;

  beforeEach(() => {
    service = new OfflineTelemetryBufferService();
  });

  it('should sync buffered airgap events and compute batch Merkle root', async () => {
    const events = [
      {
        sequenceNumber: 1,
        eventId: 'evt-ag-1',
        sourceNodeId: 'field-node-oil-rig-01',
        facilityLocation: 'Platform-Delta',
        eventType: 'PRESSURE_TELEMETRY',
        payload: { psi: 1400 },
        capturedAt: new Date(Date.now() - 3600000).toISOString(),
        nodeSignature: 'sig-node-1',
      },
      {
        sequenceNumber: 2,
        eventId: 'evt-ag-2',
        sourceNodeId: 'field-node-oil-rig-01',
        facilityLocation: 'Platform-Delta',
        eventType: 'VALVE_STATE',
        payload: { valveOpen: true },
        capturedAt: new Date(Date.now() - 1800000).toISOString(),
        nodeSignature: 'sig-node-2',
      },
    ];

    const receipt = await service.syncTelemetryBatch({
      batchId: 'batch-001',
      tenantId: 'tenant-energy-1',
      sourceNodeId: 'field-node-oil-rig-01',
      facilityLocation: 'Platform-Delta',
      totalEvents: 2,
      firstSequenceNumber: 1,
      lastSequenceNumber: 2,
      batchMerkleRoot: '',
      events,
      nodeAttestationSignature: 'sig-node-attestation',
    });

    expect(receipt.verificationStatus).toBe('BATCH_VERIFIED_AND_INGESTED');
    expect(receipt.syncedEventsCount).toBe(2);
    expect(receipt.duplicateEventsIgnored).toBe(0);
    expect(receipt.computedMerkleRoot).toBeDefined();
  });

  it('should ignore duplicate replayed sequence numbers during batch sync', async () => {
    const event = {
      sequenceNumber: 10,
      eventId: 'evt-ag-10',
      sourceNodeId: 'field-node-oil-rig-01',
      facilityLocation: 'Platform-Delta',
      eventType: 'TELEMETRY',
      payload: { temp: 42 },
      capturedAt: new Date().toISOString(),
      nodeSignature: 'sig-node-10',
    };

    // First sync
    await service.syncTelemetryBatch({
      batchId: 'batch-10A',
      tenantId: 'tenant-energy-1',
      sourceNodeId: 'field-node-oil-rig-01',
      facilityLocation: 'Platform-Delta',
      totalEvents: 1,
      firstSequenceNumber: 10,
      lastSequenceNumber: 10,
      batchMerkleRoot: '',
      events: [event],
      nodeAttestationSignature: 'sig-node-attestation',
    });

    // Replay second sync
    const replayReceipt = await service.syncTelemetryBatch({
      batchId: 'batch-10B',
      tenantId: 'tenant-energy-1',
      sourceNodeId: 'field-node-oil-rig-01',
      facilityLocation: 'Platform-Delta',
      totalEvents: 1,
      firstSequenceNumber: 10,
      lastSequenceNumber: 10,
      batchMerkleRoot: '',
      events: [event],
      nodeAttestationSignature: 'sig-node-attestation',
    });

    expect(replayReceipt.syncedEventsCount).toBe(0);
    expect(replayReceipt.duplicateEventsIgnored).toBe(1);
  });
});
