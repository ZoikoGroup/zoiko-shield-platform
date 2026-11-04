import { Injectable } from '@nestjs/common';
import {
  ASSISTANT_COPY,
  CONNECTORS,
  DISCOVERY_CATALOG,
  DISCOVERY_RULES,
  FOLLOW_UP_CHIPS,
  GUIDES,
  HELP_ARTICLES,
  ONBOARDING,
  PLANS,
  ROUTES,
  SOURCES,
  SUGGESTED_QUESTIONS,
  TOPIC_TILES,
  TRUST_TOPICS,
} from './corpus';
import type { PublicSource, SourceChunk } from './types';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for',
  'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our',
  'the', 'to', 'we', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
  'you', 'your', 'about', 'tell', 'please', 'would', 'like', 'need', 'want',
  'have', 'has', 'was', 'were', 'will', 'this', 'that', 'there', 'their',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Compare language tags on their primary subtag, so `en` and `en-US` match. */
function primaryTag(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/)[0];
}

@Injectable()
export class ContentService {
  private readonly sources = new Map<string, PublicSource>();
  private readonly chunks: SourceChunk[] = [];
  private readonly chunkIndex = new Map<string, SourceChunk[]>();
  private readonly cacheEpoch = 1;

  constructor() {
    for (const source of SOURCES) {
      this.sources.set(source.id, source);
      if (!this.isEligible(source)) continue;
      const chunks = this.chunk(source);
      this.chunks.push(...chunks);
      this.chunkIndex.set(source.id, chunks);
    }
  }

  getEpoch(): number {
    return this.cacheEpoch;
  }

  getSource(id: string): PublicSource | undefined {
    const source = this.sources.get(id);
    return source && this.isEligible(source) ? source : undefined;
  }

  getSourceForCitation(id: string): PublicSource | undefined {
    return this.getSource(id);
  }

  isEligible(source: PublicSource, market = 'undecided', locale = 'en-US'): boolean {
    if (source.status !== 'PUBLISHED' || source.classification !== 'PUBLIC') return false;
    if (primaryTag(source.locale) !== primaryTag(locale)) return false;
    const markets = source.markets.map((value) => value.toLowerCase());
    if (!markets.includes(market.toLowerCase()) && !markets.includes('undecided')) return false;
    const now = Date.now();
    if (Date.parse(source.effectiveFrom) > now) return false;
    if (source.expiresAt && Date.parse(source.expiresAt) < now) return false;
    return true;
  }

  search(
    query: string,
    options: { market?: string; locale?: string; limit?: number } = {},
  ): Array<{ source: PublicSource; chunk: SourceChunk; score: number; snippet: string }> {
    const market = options.market ?? 'undecided';
    const locale = options.locale ?? 'en-US';
    const limit = Math.min(options.limit ?? 5, 8);
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const scored: Array<{ source: PublicSource; chunk: SourceChunk; score: number; snippet: string }> = [];

    for (const source of this.sources.values()) {
      if (!this.isEligible(source, market, locale)) continue;
      const sourceChunks = this.chunkIndex.get(source.id) ?? [];
      const titleTerms = new Set(tokenize(`${source.title} ${source.tags.join(' ')}`));
      const summaryTerms = new Set(tokenize(source.summary));

      for (const chunk of sourceChunks) {
        const chunkTerms = tokenize(chunk.text);
        const counts = new Map<string, number>();
        for (const term of chunkTerms) counts.set(term, (counts.get(term) ?? 0) + 1);

        let score = 0;
        for (const term of terms) {
          if (titleTerms.has(term)) score += 6;
          if (summaryTerms.has(term)) score += 3;
          const inChunk = counts.get(term);
          if (inChunk) score += 1 + Math.min(inChunk, 3) * 0.5;
        }
        // Phrase bonus keeps exact product phrases ahead of incidental token hits.
        if (score > 0 && chunk.text.toLowerCase().includes(query.toLowerCase().trim())) score += 4;
        if (score <= 0) continue;

        scored.push({
          source,
          chunk,
          score,
          snippet: this.snippet(chunk.text, terms),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.chunk.ordinal - b.chunk.ordinal);

    // Keep at most two chunks per source so one article cannot fill the context.
    const perSource = new Map<string, number>();
    const results: typeof scored = [];
    for (const hit of scored) {
      const used = perSource.get(hit.source.id) ?? 0;
      if (used >= 2) continue;
      perSource.set(hit.source.id, used + 1);
      results.push(hit);
      if (results.length >= limit) break;
    }
    return results;
  }

  helpHome() {
    return {
      tiles: TOPIC_TILES,
      suggested_questions: SUGGESTED_QUESTIONS,
      articles: HELP_ARTICLES.map((article) => ({
        id: article.id,
        title: article.title,
        category: article.category,
        summary: article.summary,
        source_id: article.sourceId,
      })),
    };
  }

  helpArticle(id: string) {
    const article = HELP_ARTICLES.find((item) => item.id === id || item.sourceId === id);
    if (!article) return undefined;
    const source = this.getSource(article.sourceId);
    if (!source) return undefined;
    return {
      id: article.id,
      title: article.title,
      category: article.category,
      summary: article.summary,
      body: article.body,
      source_id: article.sourceId,
      canonical_url: source.canonicalUrl,
      revision: source.revision,
      review_at: source.reviewAt,
    };
  }

  guide(id: string) {
    return GUIDES.find((item) => item.id === id);
  }

  plans(market: string) {
    return PLANS.filter((plan) => {
      const source = this.getSource(plan.sourceId);
      return Boolean(source && this.isEligible(source, market));
    });
  }

  connectors(market: string, category?: string) {
    return CONNECTORS.filter((connector) => {
      const source = this.getSource(connector.sourceId);
      if (!source || !this.isEligible(source, market)) return false;
      return !category || connector.category.toLowerCase() === category.toLowerCase();
    });
  }

  trustTopics(market: string) {
    return TRUST_TOPICS.filter((topic) => {
      const source = this.getSource(topic.sourceId);
      return Boolean(source && this.isEligible(source, market));
    });
  }

  discoveryCatalog() {
    return DISCOVERY_CATALOG;
  }

  discoveryRules() {
    return DISCOVERY_RULES;
  }

  onboarding() {
    return ONBOARDING;
  }

  routes() {
    return ROUTES;
  }

  followUpChips(intent: string): string[] {
    return FOLLOW_UP_CHIPS[intent] ?? FOLLOW_UP_CHIPS.INFO;
  }

  copy() {
    return ASSISTANT_COPY;
  }

  private chunk(source: PublicSource): SourceChunk[] {
    const paragraphs = source.body
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks: SourceChunk[] = [];
    let ordinal = 0;
    for (const paragraph of paragraphs) {
      if (paragraph.length <= 700) {
        chunks.push({
          id: `${source.id}#${ordinal}`,
          sourceId: source.id,
          ordinal,
          text: paragraph,
        });
        ordinal += 1;
        continue;
      }
      // Split very long paragraphs on sentence boundaries near 600 chars.
      let buffer = '';
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
        if ((buffer + ' ' + sentence).trim().length > 600 && buffer) {
          chunks.push({
            id: `${source.id}#${ordinal}`,
            sourceId: source.id,
            ordinal,
            text: buffer.trim(),
          });
          ordinal += 1;
          buffer = sentence;
        } else {
          buffer = `${buffer} ${sentence}`.trim();
        }
      }
      if (buffer) {
        chunks.push({
          id: `${source.id}#${ordinal}`,
          sourceId: source.id,
          ordinal,
          text: buffer.trim(),
        });
        ordinal += 1;
      }
    }
    return chunks;
  }

  private snippet(text: string, terms: string[]): string {
    const lower = text.toLowerCase();
    let index = -1;
    for (const term of terms) {
      const found = lower.indexOf(term);
      if (found >= 0 && (index < 0 || found < index)) index = found;
    }
    if (index < 0) return text.slice(0, 220);
    const start = Math.max(0, index - 70);
    const end = Math.min(text.length, index + 150);
    return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
  }
}
