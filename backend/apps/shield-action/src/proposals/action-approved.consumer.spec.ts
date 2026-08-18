import { ActionApprovedConsumer } from './action-approved.consumer';

describe('ActionApprovedConsumer', () => {
  it('registers a handler for action.approved.v1 on init', () => {
    const kafkaConsumer = { registerHandler: jest.fn() } as any;
    const simulation = { simulate: jest.fn() } as any;
    const consumer = new ActionApprovedConsumer(kafkaConsumer, simulation);
    consumer.onModuleInit();
    expect(kafkaConsumer.registerHandler).toHaveBeenCalledWith(
      'action.approved.v1',
      expect.any(Function),
    );
  });

  it('is trigger-only — calls SimulationService.simulate with the proposalId from the payload, not any authorization fields on the event itself', async () => {
    const kafkaConsumer = { registerHandler: jest.fn() } as any;
    const simulation = {
      simulate: jest.fn().mockResolvedValue({ status: 'SIMULATED' }),
    } as any;
    const consumer = new ActionApprovedConsumer(kafkaConsumer, simulation);
    consumer.onModuleInit();
    const handler = kafkaConsumer.registerHandler.mock.calls[0][1];

    await handler({
      eventId: 'evt1',
      tenantId: 't1',
      correlationId: 'corr1',
      payload: { tenantId: 't1', proposalId: 'p1', caseId: 'case1' },
    });

    expect(simulation.simulate).toHaveBeenCalledWith('t1', 'p1', 'corr1');
  });

  it('fails closed when the payload is missing a proposalId', async () => {
    const kafkaConsumer = { registerHandler: jest.fn() } as any;
    const simulation = { simulate: jest.fn() } as any;
    const consumer = new ActionApprovedConsumer(kafkaConsumer, simulation);
    consumer.onModuleInit();
    const handler = kafkaConsumer.registerHandler.mock.calls[0][1];

    await expect(
      handler({
        eventId: 'evt1',
        tenantId: 't1',
        correlationId: 'corr1',
        payload: { tenantId: 't1' },
      }),
    ).rejects.toThrow('missing tenantId or proposalId');
    expect(simulation.simulate).not.toHaveBeenCalled();
  });

  it('fails closed when the payload and envelope tenants conflict', async () => {
    const kafkaConsumer = { registerHandler: jest.fn() } as any;
    const simulation = { simulate: jest.fn() } as any;
    const consumer = new ActionApprovedConsumer(kafkaConsumer, simulation);
    consumer.onModuleInit();
    const handler = kafkaConsumer.registerHandler.mock.calls[0][1];

    await expect(
      handler({
        eventId: 'evt1',
        tenantId: 'tenant-a',
        correlationId: 'corr1',
        payload: { tenantId: 'tenant-b', proposalId: 'p1' },
      }),
    ).rejects.toThrow('conflicting tenant context');
    expect(simulation.simulate).not.toHaveBeenCalled();
  });
});
