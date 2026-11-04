import { ContentService, tokenize } from './content.service';
import { SOURCES } from './corpus';
import type { PublicSource } from './types';

describe('tokenize', () => {
  it('lowercases, drops stopwords and punctuation', () => {
    expect(tokenize('How does Detection work?!')).toEqual(['detection', 'work']);
  });
});

describe('ContentService', () => {
  const service = new ContentService();
  const base = SOURCES.find((source) => source.status === 'PUBLISHED') as PublicSource;
  const variant = (changes: Partial<PublicSource>): PublicSource => ({ ...base, ...changes });

  it('finds relevant published content, best match first, with a snippet', () => {
    const hits = service.search('How does detection work?', { limit: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(hits[0].snippet.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(4);
  });

  it('keeps at most two chunks from any one source', () => {
    const hits = service.search('ZoikoShield platform detection investigation evidence', { limit: 20 });
    const perSource = new Map<string, number>();
    for (const hit of hits) perSource.set(hit.source.id, (perSource.get(hit.source.id) ?? 0) + 1);
    for (const count of perSource.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('returns nothing for text with no overlap', () => {
    expect(service.search('zzzz qqqq')).toEqual([]);
    expect(service.search('the and of')).toEqual([]);
  });

  it('only serves eligible sources', () => {
    expect(service.isEligible(base)).toBe(true);
    expect(service.isEligible(variant({ status: 'WITHDRAWN' }))).toBe(false);
    expect(service.isEligible(variant({ status: 'REVIEW' }))).toBe(false);
    expect(service.isEligible(variant({ classification: 'INTERNAL' }))).toBe(false);
    expect(service.isEligible(variant({ effectiveFrom: '2999-01-01' }))).toBe(false);
    expect(service.isEligible(variant({ expiresAt: '2000-01-01' }))).toBe(false);
    expect(service.isEligible(variant({ locale: 'fr-FR' }))).toBe(false);
    expect(service.isEligible(variant({ markets: ['us'] }), 'eu')).toBe(false);
    expect(service.isEligible(variant({ markets: ['us'] }), 'us')).toBe(true);
    expect(service.isEligible(variant({ locale: 'en-GB' }), 'undecided', 'en-US')).toBe(true);
  });

  it('looks sources up by id and hides unknown ones', () => {
    expect(service.getSource(base.id)?.id).toBe(base.id);
    expect(service.getSourceForCitation(base.id)?.id).toBe(base.id);
    expect(service.getSource('nope')).toBeUndefined();
    expect(service.getEpoch()).toBe(1);
  });

  it('exposes the help home, articles and guides', () => {
    const home = service.helpHome();
    expect(home.tiles.length).toBeGreaterThan(0);
    expect(home.articles[0]).toHaveProperty('source_id');
    const article = service.helpArticle(home.articles[0].id);
    expect(article?.body).toBeDefined();
    expect(service.helpArticle('missing')).toBeUndefined();
    expect(service.guide('first-30-days')?.title).toBe('First 30 days');
    expect(service.guide('missing')).toBeUndefined();
  });

  it('lists plans, connectors, trust topics and routes for a market', () => {
    expect(service.plans('undecided').length).toBeGreaterThan(0);
    const connectors = service.connectors('undecided');
    expect(connectors.length).toBeGreaterThan(0);
    const category = connectors[0].category;
    const filtered = service.connectors('undecided', category.toUpperCase());
    expect(filtered.every((connector) => connector.category === category)).toBe(true);
    expect(service.connectors('undecided', 'no-such-category')).toEqual([]);
    expect(service.trustTopics('undecided').length).toBeGreaterThan(0);
    expect(service.routes().WEB_SUPPORT.href).toBeTruthy();
    expect(service.discoveryCatalog()).toBeDefined();
    expect(service.discoveryRules()).toBeDefined();
    expect(service.onboarding()).toBeDefined();
    expect(service.copy().displayName).toBeTruthy();
  });

  it('suggests follow-ups per intent and falls back to the general set', () => {
    expect(service.followUpChips('WRITE_DEMO').length).toBeGreaterThan(0);
    expect(service.followUpChips('SOMETHING_ELSE')).toEqual(service.followUpChips('INFO'));
  });
});
