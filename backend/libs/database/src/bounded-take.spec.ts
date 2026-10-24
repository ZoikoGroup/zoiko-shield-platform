import { boundedTake } from './bounded-take';

describe('boundedTake', () => {
  it('uses the fallback when no usable limit is given', () => {
    expect(boundedTake(undefined)).toBe(100);
    expect(boundedTake('abc')).toBe(100);
    expect(boundedTake('0')).toBe(100);
    expect(boundedTake('-5')).toBe(100);
    expect(boundedTake('2.5')).toBe(100);
  });

  it('honours a positive integer limit up to the cap', () => {
    expect(boundedTake('25')).toBe(25);
    expect(boundedTake(10)).toBe(10);
    expect(boundedTake('100000')).toBe(500);
    expect(boundedTake('80', 20, 50)).toBe(50);
  });
});
