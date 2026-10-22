import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

/**
 * Regression for the demo bypass removed from this guard: well-known demo
 * tokens, any `jwt-bearer-*` value, and headers containing "demo" were all
 * accepted as a fixed user for whatever tenant x-tenant-id named. Only a
 * signed session JWT may authenticate.
 */
describe('JwtAuthGuard', () => {
  const config = {
    getOrThrow: () => 'unit-test-jwt-secret-with-sufficient-entropy',
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;
  const unreachable = () => {
    throw new Error('session lookup must not run for an unsigned token');
  };
  // Registers the 'jwt' passport strategy the guard delegates to.
  new JwtStrategy(
    config,
    { findById: unreachable } as never,
    { findById: unreachable } as never,
    {} as never,
  );

  function context(
    headers: Record<string, string>,
    cookies: Record<string, string> = {},
  ) {
    const request = {
      headers: { 'x-tenant-id': 'tenant-victim', ...headers },
      cookies,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }

  it.each([
    [
      'the old demo session token',
      { authorization: 'Bearer demo-jwt-session-token-998811' },
    ],
    ['a jwt-bearer-* token', { authorization: 'Bearer jwt-bearer-anything' }],
    ['a header containing "demo"', { authorization: 'Bearer demo' }],
    ['no credentials', {}],
  ])('rejects %s', async (_label, headers) => {
    await expect(
      new JwtAuthGuard().canActivate(context(headers)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a jwt-bearer-* token sent as the access cookie', async () => {
    await expect(
      new JwtAuthGuard().canActivate(
        context({}, { shield_access_token: 'jwt-bearer-anything' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not fall back to a demo user outside production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await expect(
        new JwtAuthGuard().canActivate(context({})),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
