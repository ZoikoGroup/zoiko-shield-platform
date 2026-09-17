import { retentionUntil } from './object-storage.service';

/**
 * Object Lock retention is what actually holds evidence immutable; if the
 * profile-to-duration mapping drifts, evidence silently becomes deletable
 * earlier than its retention profile claims.
 */
describe('evidence retention windows', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');
  const daysBetween = (a: Date, b: Date) =>
    Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));

  it('defaults an unspecified profile to the standard 90 days', () => {
    expect(daysBetween(from, retentionUntil(undefined, from))).toBe(90);
    expect(daysBetween(from, retentionUntil('STANDARD', from))).toBe(90);
  });

  it('maps explicit day-count profiles to their stated windows', () => {
    expect(daysBetween(from, retentionUntil('30_DAYS', from))).toBe(30);
    expect(daysBetween(from, retentionUntil('180_DAYS', from))).toBe(180);
    expect(daysBetween(from, retentionUntil('365_DAYS', from))).toBe(365);
  });

  it('supports a multi-year regulatory window', () => {
    expect(daysBetween(from, retentionUntil('7_YEARS', from))).toBe(2555);
  });

  it('falls back to the default rather than zero for an unknown profile', () => {
    // A zero/past retain-until would make the object immediately deletable,
    // which is worse than over-retaining an unrecognised profile.
    expect(daysBetween(from, retentionUntil('NOT_A_PROFILE', from))).toBe(90);
  });
});
