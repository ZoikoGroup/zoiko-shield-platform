import { ConflictException } from '@nestjs/common';
import { assertTransition } from './state-machine.util';

describe('assertTransition', () => {
  const transitions: Record<string, string[]> = {
    A: ['B'],
    B: ['C'],
    C: [],
  };

  it('allows a declared transition', () => {
    expect(() =>
      assertTransition(transitions, 'A', 'B', 'thing'),
    ).not.toThrow();
  });

  it('rejects an undeclared transition with 409 INVALID_STATE_TRANSITION', () => {
    try {
      assertTransition(transitions, 'A', 'C', 'thing');
      fail('expected ConflictException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().error).toBe('INVALID_STATE_TRANSITION');
    }
  });

  it('rejects a transition from a terminal state', () => {
    expect(() => assertTransition(transitions, 'C', 'A', 'thing')).toThrow(
      ConflictException,
    );
  });
});
