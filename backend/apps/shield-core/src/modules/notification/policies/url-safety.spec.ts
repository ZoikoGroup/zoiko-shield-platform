import { BadRequestException } from '@nestjs/common';
import { assertSafeCtaUrl, isSafeCtaUrl } from './url-safety';

describe('assertSafeCtaUrl (Gate 3 Action Safety)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts a first-party HTTPS action link', () => {
    expect(() =>
      assertSafeCtaUrl('https://app.zoikoshield.com/cases/INC-1'),
    ).not.toThrow();
  });

  it.each([
    'http://insecure.zoikoshield.com/login',
    'http://phishing.example.com/steal',
  ])('rejects plain HTTP: %s', (url) => {
    expect(() => assertSafeCtaUrl(url)).toThrow(BadRequestException);
  });

  it.each([
    "javascript:fetch('//evil.example')",
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://app.zoikoshield.com/x',
  ])('rejects forbidden scheme: %s', (url) => {
    expect(() => assertSafeCtaUrl(url)).toThrow(BadRequestException);
  });

  it('rejects embedded credentials that disguise the real host', () => {
    // Reads as a zoikoshield link in the plaintext body, resolves to evil.example.
    expect(() =>
      assertSafeCtaUrl('https://app.zoikoshield.com@evil.example/login'),
    ).toThrow(BadRequestException);
  });

  it('rejects control characters that would break out of a header or attribute', () => {
    expect(() =>
      assertSafeCtaUrl('https://app.zoikoshield.com/a\r\nBcc:attacker@evil.example'),
    ).toThrow(BadRequestException);
  });

  it.each(['', '   ', 'not-a-url', '/relative/path'])(
    'rejects unparseable or empty value: %p',
    (url) => {
      expect(() => assertSafeCtaUrl(url)).toThrow(BadRequestException);
    },
  );

  describe('loopback HTTP affordance', () => {
    it('permits http://localhost outside production', () => {
      process.env.NODE_ENV = 'development';
      expect(() => assertSafeCtaUrl('http://localhost:3000/invite')).not.toThrow();
      expect(() => assertSafeCtaUrl('http://127.0.0.1:3000/invite')).not.toThrow();
    });

    it('fails closed on loopback HTTP in production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => assertSafeCtaUrl('http://localhost:3000/invite')).toThrow(
        BadRequestException,
      );
    });

    it('does not treat an arbitrary *.localhost host as loopback', () => {
      // A suffix match would have let 'evil.localhost' through as a dev host.
      process.env.NODE_ENV = 'development';
      expect(() => assertSafeCtaUrl('http://evil.localhost/pwn')).toThrow(
        BadRequestException,
      );
    });
  });

  it('isSafeCtaUrl mirrors assertSafeCtaUrl without throwing', () => {
    expect(isSafeCtaUrl('https://app.zoikoshield.com')).toBe(true);
    expect(isSafeCtaUrl('http://evil.example')).toBe(false);
  });
});
