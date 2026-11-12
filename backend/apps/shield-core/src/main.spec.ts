import { gunzipSync } from 'zlib';
import { parseTrustProxy, gzipCompressionMiddleware } from './main';

describe('shield-core main bootstrap helpers', () => {
  describe('parseTrustProxy', () => {
    it('returns default private subnet list when unset or blank', () => {
      expect(parseTrustProxy(undefined)).toBe('loopback, linklocal, uniquelocal');
      expect(parseTrustProxy('   ')).toBe('loopback, linklocal, uniquelocal');
    });

    it('parses boolean strings true and false so Express proxy-addr does not throw TypeError', () => {
      expect(parseTrustProxy('true')).toBe(true);
      expect(parseTrustProxy('TRUE')).toBe(true);
      expect(parseTrustProxy('false')).toBe(false);
    });

    it('parses integer hop counts into numbers', () => {
      expect(parseTrustProxy('1')).toBe(1);
      expect(parseTrustProxy('2')).toBe(2);
    });

    it('preserves explicit subnet/IP expressions', () => {
      expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    });
  });

  describe('gzipCompressionMiddleware', () => {
    it('compresses JSON responses when Accept-Encoding includes gzip', () => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      let sentBody: any;
      const req: any = { headers: { 'accept-encoding': 'gzip, deflate, br' } };
      const res: any = {
        getHeader: (k: string) => headers[k.toLowerCase()],
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
        removeHeader: (k: string) => {
          delete headers[k.toLowerCase()];
        },
        send: (body: any) => {
          sentBody = body;
          return res;
        },
      };

      const next = jest.fn();
      gzipCompressionMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();

      const payload = JSON.stringify({ message: 'x'.repeat(200) });
      res.send(payload);

      expect(headers['content-encoding']).toBe('gzip');
      expect(headers['vary']).toBe('Accept-Encoding');
      expect(Buffer.isBuffer(sentBody)).toBe(true);
      expect(gunzipSync(sentBody).toString('utf8')).toBe(payload);
    });
  });
});

