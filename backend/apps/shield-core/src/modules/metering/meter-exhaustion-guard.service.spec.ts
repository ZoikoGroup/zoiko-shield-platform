import { MeterExhaustionGuardService } from './meter-exhaustion-guard.service';

describe('MeterExhaustionGuardService', () => {
  let meterGuard: MeterExhaustionGuardService;

  beforeEach(() => {
    meterGuard = new MeterExhaustionGuardService();
  });

  it('should return NORMAL state for consumption below 75%', () => {
    const res = meterGuard.evaluateMeterExhaustion({
      tenantId: 'tenant-01',
      planTier: 'PROFESSIONAL', // 1000 GB limit
      currentIngestGb: 500, // 50%
      activeEndpoints: 100,
    });

    expect(res.status).toBe('NORMAL');
    expect(res.isIngestPermitted).toBe(true);
    expect(res.throttleAction).toBe('NONE');
  });

  it('should trigger WARNING_75 state when capacity reaches 75%', () => {
    const res = meterGuard.evaluateMeterExhaustion({
      tenantId: 'tenant-01',
      planTier: 'PROFESSIONAL',
      currentIngestGb: 760, // 76%
      activeEndpoints: 100,
    });

    expect(res.status).toBe('WARNING_75');
    expect(res.throttleAction).toBe('SOFT_ALERT');
    expect(res.isIngestPermitted).toBe(true);
  });

  it('should trigger CRITICAL_90 state when capacity reaches 90%', () => {
    const res = meterGuard.evaluateMeterExhaustion({
      tenantId: 'tenant-01',
      planTier: 'PROFESSIONAL',
      currentIngestGb: 920, // 92%
      activeEndpoints: 100,
    });

    expect(res.status).toBe('CRITICAL_90');
    expect(res.throttleAction).toBe('ESCALATE_UPSELL');
    expect(res.isIngestPermitted).toBe(true);
  });

  it('should grant grace period when quota reaches 100% within grace window', () => {
    const res = meterGuard.evaluateMeterExhaustion({
      tenantId: 'tenant-01',
      planTier: 'PROFESSIONAL', // 48-hour grace window
      currentIngestGb: 1050, // 105%
      activeEndpoints: 100,
      exhaustionOverrunHours: 12, // within 48h
    });

    expect(res.status).toBe('EXHAUSTED_GRACE_PERIOD');
    expect(res.isIngestPermitted).toBe(true);
    expect(res.throttleAction).toBe('RATE_LIMIT_50PCT');
  });

  it('should hard block ingest when grace period is exceeded', () => {
    const res = meterGuard.evaluateMeterExhaustion({
      tenantId: 'tenant-01',
      planTier: 'PROFESSIONAL',
      currentIngestGb: 1100,
      activeEndpoints: 100,
      exhaustionOverrunHours: 60, // Exceeded 48h
    });

    expect(res.status).toBe('EXHAUSTED_HARD_THROTTLE');
    expect(res.isIngestPermitted).toBe(false);
    expect(res.throttleAction).toBe('HARD_BLOCK');
  });
});
