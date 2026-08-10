import { ContentHashService } from '../hashing/content-hash.service';

describe('ContentHashService', () => {
  const service = new ContentHashService();

  it('produces a deterministic hash for the same content regardless of key order', () => {
    const a = service.hashCanonicalJson({ b: 2, a: 1, c: { y: 2, x: 1 } });
    const b = service.hashCanonicalJson({ a: 1, c: { x: 1, y: 2 }, b: 2 });

    expect(a.contentHash).toBe(b.contentHash);
  });

  it('produces a different hash when content changes', () => {
    const a = service.hashCanonicalJson({ value: 'original' });
    const b = service.hashCanonicalJson({ value: 'tampered' });

    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('produces a 64-character hex SHA-256 digest', () => {
    const { contentHash } = service.hashCanonicalJson({ x: 1 });
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
