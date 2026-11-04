import { SESSION_TTL_MS, SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a session whose token resolves back to it, storing only a hash', () => {
    const { session, token } = service.create('203.0.113.9', 'Mozilla/5.0 (Windows)');
    expect(session.id).toMatch(/^sess_/);
    expect(session.epoch).toBe(1);
    expect(session.tokenHash).not.toContain(token);
    expect(session.ipHash).not.toContain('203.0.113.9');
    expect(service.resolve(token)).toBe(session);
  });

  it('classifies the client without keeping the user agent', () => {
    expect(service.create('1.1.1.1', 'Mozilla iPhone Mobile').session.uaClass).toBe('mobile');
    expect(service.create('1.1.1.1', 'Googlebot/2.1').session.uaClass).toBe('bot');
    expect(service.create('', 'Mozilla/5.0 (Windows)').session.uaClass).toBe('desktop');
  });

  it('does not resolve a missing, unknown or expired token', () => {
    const { token } = service.create('1.1.1.1', 'x');
    expect(service.resolve(undefined)).toBeUndefined();
    expect(service.resolve('unknown-token')).toBeUndefined();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + SESSION_TTL_MS + 1000);
    expect(service.resolve(token)).toBeUndefined();
  });

  it('clearing a session ends it and bumps its epoch', () => {
    const { session, token } = service.create('1.1.1.1', 'x');
    expect(service.clear(token)).toBe(true);
    expect(session.epoch).toBe(2);
    expect(service.resolve(token)).toBeUndefined();
    expect(service.clear(token)).toBe(false);
    expect(service.clear(undefined)).toBe(false);
  });

  it('drops expired sessions when a new one is created', () => {
    const first = service.create('1.1.1.1', 'x');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + SESSION_TTL_MS + 1000);
    service.create('2.2.2.2', 'y');
    expect(service.resolve(first.token)).toBeUndefined();
  });
});
