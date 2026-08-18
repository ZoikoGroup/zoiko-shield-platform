import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DeclaredAccessGuard } from './declared-access.guard';

function context(): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('DeclaredAccessGuard', () => {
  it('fails closed when an HTTP handler has no declared access policy', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
      getAllAndMerge: jest.fn().mockReturnValue([]),
    } as unknown as Reflector;

    expect(() =>
      new DeclaredAccessGuard(reflector).canActivate(context()),
    ).toThrow(ForbiddenException);
  });

  it('allows explicitly unauthenticated ingress', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('PUBLIC'),
      getAllAndMerge: jest.fn().mockReturnValue([]),
    } as unknown as Reflector;

    expect(new DeclaredAccessGuard(reflector).canActivate(context())).toBe(
      true,
    );
  });

  it('allows handlers whose declared guards will enforce access', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
      getAllAndMerge: jest.fn().mockReturnValue([class Guard {}]),
    } as unknown as Reflector;

    expect(new DeclaredAccessGuard(reflector).canActivate(context())).toBe(
      true,
    );
  });

  it('does not let an authentication-only marker bypass a missing guard', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('AUTHENTICATION_ONLY'),
      getAllAndMerge: jest.fn().mockReturnValue([]),
    } as unknown as Reflector;

    expect(() =>
      new DeclaredAccessGuard(reflector).canActivate(context()),
    ).toThrow(ForbiddenException);
  });
});
