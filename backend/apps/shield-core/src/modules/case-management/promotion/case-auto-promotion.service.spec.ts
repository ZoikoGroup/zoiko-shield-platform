import { CaseAutoPromotionService } from './case-auto-promotion.service';

describe('CaseAutoPromotionService', () => {
  let kafka: { registerHandler: jest.Mock };
  let caseService: { createFromAlert: jest.Mock };
  let service: CaseAutoPromotionService;

  const envelopeFor = (payload: Record<string, unknown>) =>
    ({ eventId: 'evt-1', eventType: 'alert.created', payload }) as any;

  const handler = () => kafka.registerHandler.mock.calls[0][1];

  beforeEach(() => {
    delete process.env.CASE_AUTO_PROMOTION_ENABLED;
    delete process.env.CASE_AUTO_PROMOTION_MIN_SEVERITY;
    kafka = { registerHandler: jest.fn() };
    caseService = {
      createFromAlert: jest.fn().mockResolvedValue({ id: 'case-1' }),
    };
    service = new CaseAutoPromotionService(kafka as any, caseService as any);
  });

  it('subscribes to alert.created so alerts no longer wait for a manual promotion', () => {
    service.onModuleInit();
    expect(kafka.registerHandler).toHaveBeenCalledWith(
      'alert.created.v1',
      expect.any(Function),
    );
  });

  it('opens a case for an alert at the threshold', async () => {
    service.onModuleInit();
    await handler()(
      envelopeFor({
        tenantId: 'tenant-a',
        alertId: 'alert-1',
        severity: 'HIGH',
      }),
    );
    expect(caseService.createFromAlert).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      alertId: 'alert-1',
      actorId: 'system:case-auto-promotion',
    });
  });

  it('leaves alerts below the threshold in the alert queue', async () => {
    service.onModuleInit();
    await handler()(
      envelopeFor({
        tenantId: 'tenant-a',
        alertId: 'alert-2',
        severity: 'LOW',
      }),
    );
    expect(caseService.createFromAlert).not.toHaveBeenCalled();
  });

  it('honours a lowered threshold', async () => {
    process.env.CASE_AUTO_PROMOTION_MIN_SEVERITY = 'low';
    service.onModuleInit();
    await handler()(
      envelopeFor({
        tenantId: 'tenant-a',
        alertId: 'alert-3',
        severity: 'LOW',
      }),
    );
    expect(caseService.createFromAlert).toHaveBeenCalled();
  });

  it('promotes rather than drops an alert whose severity it does not recognise', async () => {
    service.onModuleInit();
    await handler()(
      envelopeFor({
        tenantId: 'tenant-a',
        alertId: 'alert-4',
        severity: 'SEV-1',
      }),
    );
    expect(caseService.createFromAlert).toHaveBeenCalled();
  });

  it('does not subscribe at all when promotion is switched off', () => {
    process.env.CASE_AUTO_PROMOTION_ENABLED = 'false';
    service.onModuleInit();
    expect(kafka.registerHandler).not.toHaveBeenCalled();
  });

  it('fails the message rather than guessing when the payload has no alert', async () => {
    service.onModuleInit();
    await expect(
      handler()(envelopeFor({ tenantId: 'tenant-a' })),
    ).rejects.toThrow(/Malformed alert.created payload/);
  });
});
