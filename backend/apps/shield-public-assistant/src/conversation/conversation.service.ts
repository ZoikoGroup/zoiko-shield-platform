import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ContentService, tokenize } from '../content/content.service';
import type {
  AnswerBlock,
  AnswerOutcome,
  AnswerPayload,
  Citation,
  PublicSource,
} from '../content/types';
import { AssistantConfigService } from '../config/assistant-config.service';
import type { GuestSession } from '../session/session.service';
import { classify, hasSecret, redact, type Classification } from './classifier';
import { guardOutput, LlmService, type LlmAnswer } from './llm.service';

export interface CreateMessageInput {
  client_message_id: string;
  content: string;
  locale?: string;
  market?: string;
  intent_key?: string;
  consent_snapshot_id?: string;
  previous_questions?: string[];
}

export interface StreamEvent {
  seq: number;
  type:
    | 'acknowledged'
    | 'progress'
    | 'delta'
    | 'final'
    | 'safety_limited'
    | 'error';
  data: Record<string, unknown>;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  epoch: number;
  clientMessageId: string;
  contentRedacted: string;
  outcome: AnswerOutcome;
  payload: AnswerPayload;
  events: StreamEvent[];
  createdAt: number;
  cancelled: boolean;
}

@Injectable()
export class ConversationService {
  private readonly messages = new Map<string, MessageRecord>();
  private readonly byClientId = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<MessageRecord>>();
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly content: ContentService,
    private readonly config: AssistantConfigService,
    private readonly llm: LlmService,
  ) {}

  async createMessage(
    session: GuestSession,
    input: CreateMessageInput,
  ): Promise<MessageRecord> {
    const idempotencyKey = `${session.id}:${input.client_message_id}`;
    const existingId = this.byClientId.get(idempotencyKey);
    if (existingId) {
      const existing = this.messages.get(existingId);
      if (existing) return existing;
    }
    // A double submit while the first call is still running must not ask the model twice.
    const running = this.inflight.get(idempotencyKey);
    if (running) return running;

    const work = this.build(session, input, idempotencyKey).finally(() =>
      this.inflight.delete(idempotencyKey),
    );
    this.inflight.set(idempotencyKey, work);
    return work;
  }

  private async build(
    session: GuestSession,
    input: CreateMessageInput,
    idempotencyKey: string,
  ): Promise<MessageRecord> {
    const classification = classify(input.content);
    const payload = await this.answer(classification, input);
    const id = `msg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const createdAt = Date.now();

    const record: MessageRecord = {
      id,
      sessionId: session.id,
      epoch: session.epoch,
      clientMessageId: input.client_message_id,
      contentRedacted: redact(input.content).slice(0, 2000),
      outcome: payload.outcome,
      payload,
      events: [],
      createdAt,
      cancelled: false,
    };
    record.events = this.buildEvents(record);
    this.messages.set(id, record);
    this.byClientId.set(idempotencyKey, id);
    this.evict();
    return record;
  }

  getForSession(id: string, session: GuestSession): MessageRecord {
    const record = this.messages.get(id);
    if (!record || record.sessionId !== session.id) {
      throw new NotFoundException({
        error_code: 'MESSAGE_NOT_FOUND',
        user_safe_message:
          'That message is not available in this conversation.',
      });
    }
    return record;
  }

  cancel(id: string, session: GuestSession): boolean {
    const record = this.getForSession(id, session);
    record.cancelled = true;
    return true;
  }

  private async answer(
    classification: Classification,
    input: CreateMessageInput,
  ): Promise<AnswerPayload> {
    const flags = this.config.flags();
    const market = input.market ?? 'undecided';
    const locale = input.locale ?? 'en-US';
    const chips = this.content.followUpChips(classification.intent);

    if (classification.intent === 'SECRET') {
      return {
        outcome: 'REJECTED',
        blocks: [
          {
            type: 'callout',
            text: 'I can’t accept passwords, keys, tokens or other secrets. Remove the secret from your message and ask the question again. If a credential may already be exposed, rotate it through your normal process and contact your security team.',
          },
        ],
        citations: [],
        follow_up_chips: chips,
      };
    }

    if (classification.intent === 'INJECTION') {
      return {
        outcome: 'LIMITED',
        blocks: [
          {
            type: 'callout',
            text: 'I can’t share or change how I work. I’m here to answer questions about ZoikoShield using approved public information. Ask about the platform, plans, integrations, trust or onboarding and I’ll help.',
          },
        ],
        citations: [],
        follow_up_chips: this.chipsFor(input.content, undefined),
      };
    }

    if (classification.intent === 'IDENTITY') {
      return {
        outcome: 'ANSWERED',
        blocks: [
          {
            type: 'paragraph',
            text: `I’m the ${this.config.displayName()} — an AI-assisted public information service, not a person. I answer questions about ZoikoShield’s platform, plans, integrations, trust and onboarding from approved public content, and I cite what I use.`,
          },
          {
            type: 'bullets',
            items: [
              'I can’t see any account, tenant, alert or case, and I can’t book a meeting or promise a price.',
              'I can take a demo, support or quote request and give you a receipt for it.',
              'Please don’t share passwords, tokens or live incident details.',
            ],
          },
        ],
        citations: this.citationsFor(['help-ai-disclosure']),
        follow_up_chips: this.chipsFor(input.content, undefined),
      };
    }

    if (classification.intent === 'PRIVILEGED') {
      return {
        outcome: 'REJECTED',
        blocks: [
          {
            type: 'callout',
            text: 'This is a public information assistant. It has no access to tenant data, alerts, cases, evidence, playbooks or response controls, and it cannot make account changes. Sign in to the ZoikoShield workspace or use your contracted support channel for those actions.',
          },
        ],
        citations: [],
        follow_up_chips: chips,
      };
    }

    if (classification.intent === 'INCIDENT') {
      const route = this.content.routes().INCIDENT_ROUTE;
      return {
        outcome: 'LIMITED',
        route_key: 'INCIDENT_ROUTE',
        blocks: [
          {
            type: 'callout',
            text: 'I can’t handle a live incident in public chat. If you are an existing customer, use your contracted incident or support channel now — that channel is staffed and tracked under your agreement. This assistant cannot dispatch a responder, open an incident or promise a response time.',
          },
          {
            type: 'paragraph',
            text: 'If you are not yet a customer and need to reach the team, use the support route below. Do not paste live incident details, credentials or customer data here.',
          },
        ],
        citations: [],
        follow_up_chips: chips,
        action: {
          type: 'link',
          href: route.href,
          label: route.label,
        },
      };
    }

    if (classification.intent === 'PRIVACY') {
      const route = this.content.routes().WEB_PRIVACY;
      return {
        outcome: 'LIMITED',
        route_key: 'WEB_PRIVACY',
        blocks: [
          {
            type: 'paragraph',
            text: 'Privacy and data-subject requests are handled through the published privacy route so the privacy team can verify the request and its scope. This assistant does not collect a data-subject request itself.',
          },
          {
            type: 'bullets',
            items: [
              'Use the privacy notice to find the current contact route.',
              'Do not include identity documents or sensitive personal data in a chat message.',
              'Marketing consent is separate from a support or sales request and is never pre-selected.',
            ],
          },
        ],
        citations: this.citationsFor(['help-data-protection']),
        follow_up_chips: chips,
        action: { type: 'link', href: route.href, label: route.label },
      };
    }

    if (classification.intent === 'WRITE_DEMO') {
      const enabled = flags.assistant_lead_submit && !flags.assistant_kill;
      return {
        outcome: 'LIMITED',
        blocks: [
          {
            type: 'paragraph',
            text: enabled
              ? 'I can take a demo request here. It records your details for the team and gives you a durable receipt. It does not book a calendar slot or confirm a meeting — the team will follow up with options.'
              : 'Demo requests are handled by the team on the demo route. I can’t take the request in chat right now.',
          },
        ],
        citations: [],
        follow_up_chips: chips,
        action: enabled
          ? { type: 'flow', flow: 'demo', label: 'Start demo request' }
          : {
              type: 'link',
              href: this.content.routes().WEB_DEMO.href,
              label: 'Open demo route',
            },
      };
    }

    if (classification.intent === 'WRITE_SUPPORT') {
      const enabled = flags.assistant_support_submit && !flags.assistant_kill;
      return {
        outcome: 'LIMITED',
        blocks: [
          {
            type: 'paragraph',
            text: enabled
              ? 'I can take a general support request. It is not a live incident ticket and it does not promise a response time. For anything time-critical, existing customers should use their contracted incident channel.'
              : 'Support requests are handled through the support route. I can’t take the request in chat right now.',
          },
          {
            type: 'callout',
            text: 'Do not include passwords, tokens, customer data or live incident details in a support request.',
          },
        ],
        citations: this.citationsFor(['help-support-routes']),
        follow_up_chips: chips,
        action: enabled
          ? { type: 'flow', flow: 'support', label: 'Start support request' }
          : {
              type: 'link',
              href: this.content.routes().WEB_SUPPORT.href,
              label: 'Open support route',
            },
      };
    }

    if (classification.intent === 'WRITE_QUOTE') {
      const enabled = flags.assistant_lead_submit && !flags.assistant_kill;
      return {
        outcome: 'LIMITED',
        blocks: [
          {
            type: 'paragraph',
            text: enabled
              ? 'I can take a quote inquiry. The commercial team confirms scope, sizing and a written quote — this chat does not produce a binding price or a discount.'
              : 'Quote requests go to the commercial team. I can’t take the request in chat right now.',
          },
        ],
        citations: this.citationsFor(['help-pricing-guide']),
        follow_up_chips: chips,
        action: enabled
          ? { type: 'flow', flow: 'quote', label: 'Start quote inquiry' }
          : {
              type: 'link',
              href: this.content.routes().WEB_PRICING.href,
              label: 'See plans and pricing',
            },
      };
    }

    // Head-to-head comparisons with another vendor are not in approved content, and a retrieval
    // match on the vendor's name would only surface an unrelated article.
    if (
      /\b(?:better|worse|superior|inferior|cheaper|faster|stronger)\s+than\b|\bvs\.?\s+\w+|\bversus\b|\bcompared?\s+(?:to|with)\s+\w+/i.test(
        input.content,
      )
    ) {
      return {
        outcome: 'LIMITED',
        blocks: [
          {
            type: 'paragraph',
            text: 'I can’t compare ZoikoShield with another vendor’s product: approved public content does not include comparisons. I can describe what ZoikoShield does, and a demo or technical evaluation is the way to judge fit for your environment.',
          },
        ],
        citations: [],
        follow_up_chips: chips,
        action:
          flags.assistant_lead_submit && !flags.assistant_kill
            ? { type: 'flow', flow: 'demo', label: 'Start demo request' }
            : {
                type: 'link',
                href: this.content.routes().WEB_DEMO.href,
                label: 'Open demo route',
              },
      };
    }

    // Information / discovery: deterministic retrieval over the public corpus.
    const earlier = this.earlierQuestions(input);
    const isFollowUp = earlier.length > 0 && tokenize(input.content).length < 5;
    const searchText = isFollowUp
      ? `${earlier[earlier.length - 1]} ${input.content}`
      : input.content;
    const hits = this.content.search(searchText, { market, locale, limit: 4 });
    if (hits.length === 0) {
      // No keyword match (for example a named third-party product). Let the model
      // try with broad platform sources; it abstains when they do not cover it.
      const broad = this.content
        .search(
          'ZoikoShield platform overview integrations connectors telemetry',
          { market, locale, limit: 3 },
        )
        .map((hit) => hit.source);
      const broadAnswer = await this.generate(input, broad, market, locale);
      if (broadAnswer && broadAnswer !== 'ABSTAIN') {
        return {
          outcome: 'ANSWERED',
          blocks: broadAnswer.blocks,
          citations: broadAnswer.citations,
          follow_up_chips: this.chipsFor(input.content, broad[0]),
        };
      }
      return this.abstainPayload(chips);
    }

    const generated = await this.generate(
      input,
      hits.map((hit) => hit.source),
      market,
      locale,
    );
    // A weak match (no title or tag hit) plus a model abstain means the sources do not cover
    // this. Say so rather than substituting an unrelated canned paragraph.
    if (generated === 'ABSTAIN' && hits[0].score < 6)
      return this.abstainPayload(chips);
    if (generated && generated !== 'ABSTAIN') {
      const modelAction = this.actionForQuery(input.content, flags);
      return {
        outcome: 'ANSWERED',
        blocks: generated.blocks,
        citations: generated.citations,
        follow_up_chips: this.chipsFor(input.content, hits[0].source),
        ...(modelAction ? { action: modelAction } : {}),
      };
    }

    const primary = hits[0].source;
    const related = this.uniqueSources(hits.map((hit) => hit.source)).filter(
      (source) => source.id !== primary.id,
    );
    const used = [primary, ...related].slice(0, 3);
    const aiEnabled = this.config.aiAnswersEnabled();

    const blocks: AnswerBlock[] = [
      {
        type: 'paragraph',
        text: this.primaryText(primary, hits[0].snippet),
      },
    ];
    if (related.length > 0) {
      blocks.push({
        type: 'bullets',
        items: related
          .slice(0, 2)
          .map((source) => `${source.title} — ${source.summary}`),
      });
    }
    blocks.push({
      type: 'note',
      text: aiEnabled
        ? 'This answer uses approved public content. Contracted scope, price, certification and service levels are confirmed by the team for your specific requirement.'
        : 'AI answers are currently in static-help mode. This answer uses approved public content only; contracted scope and service levels are confirmed by the team.',
    });

    const action = this.actionForQuery(input.content, flags);

    return {
      outcome: aiEnabled ? 'ANSWERED' : 'LIMITED',
      blocks,
      citations: used.map((source) => this.citation(source)),
      follow_up_chips: this.chipsFor(input.content, primary),
      ...(action ? { action } : {}),
    };
  }

  /**
   * Model answer, validated before anything is shown. Returns null for any
   * failure (no key, timeout, bad JSON, uncited, guard hit) so the caller falls
   * back to the deterministic answer.
   */
  private abstainPayload(chips: string[]): AnswerPayload {
    return {
      outcome: 'ABSTAINED',
      blocks: [
        {
          type: 'paragraph',
          text: 'I couldn’t find an approved public answer to that. I can still help with platform capabilities, plans, trust and compliance, integrations, onboarding or a demo request.',
        },
        {
          type: 'bullets',
          items: [
            'Try a more specific product or capability question.',
            'Choose one of the topics below.',
            'Or contact the team through the support route.',
          ],
        },
      ],
      citations: [],
      follow_up_chips: chips,
    };
  }

  private async generate(
    input: CreateMessageInput,
    hitSources: PublicSource[],
    market: string,
    locale: string,
  ): Promise<
    { blocks: AnswerBlock[]; citations: Citation[] } | 'ABSTAIN' | null
  > {
    if (!this.config.aiAnswersEnabled() || !this.llm.enabled()) return null;

    const context = this.uniqueSources(hitSources).slice(0, 4);
    const disclosure = this.content.getSource('help-ai-disclosure');
    if (disclosure && !context.some((source) => source.id === disclosure.id))
      context.push(disclosure);

    const result: LlmAnswer | null = await this.llm.answer(
      redact(input.content),
      context,
      this.earlierQuestions(input),
    );
    if (!result) return null;
    if (result.kind === 'abstain') return 'ABSTAIN';

    const allowed = new Map(context.map((source) => [source.id, source]));
    const cited = [...new Set(result.citations)]
      .map((id) => allowed.get(id))
      .filter((source): source is PublicSource => Boolean(source))
      .filter((source) => this.content.isEligible(source, market, locale));
    if (cited.length === 0) {
      this.logger.warn('Model answer rejected: no valid citation');
      return null;
    }
    const violation = guardOutput(result);
    if (violation) {
      this.logger.warn(`Model answer rejected: ${violation}`);
      return null;
    }

    const blocks: AnswerBlock[] = result.paragraphs.map((text) => ({
      type: 'paragraph',
      text,
    }));
    if (result.bullets.length > 0)
      blocks.push({ type: 'bullets', items: result.bullets });
    blocks.push({
      type: 'note',
      text: 'AI-generated from approved public content. Price, certification and service levels are confirmed by the team.',
    });
    return { blocks, citations: cited.map((source) => this.citation(source)) };
  }

  /** Earlier questions are visitor text too: drop anything that looks like a secret, redact the rest. */
  private earlierQuestions(input: CreateMessageInput): string[] {
    return (input.previous_questions ?? [])
      .slice(-3)
      .filter((question) => question.trim().length > 0 && !hasSecret(question))
      .map((question) => redact(question).slice(0, 300));
  }

  private static readonly CHIP_POOL = [
    'Explore plans and pricing',
    'How does detection work?',
    'Which integrations are available?',
    'How does ZoikoShield handle compliance?',
    'How does onboarding work?',
    'How does incident investigation work?',
    'What does governed AI assistance mean?',
  ];

  /** Follow-ups that differ from what was just asked and from the topic just answered. */
  private chipsFor(
    question: string,
    primary: PublicSource | undefined,
  ): string[] {
    const stem = (token: string) => token.slice(0, 4);
    const asked = new Set(
      [
        ...tokenize(question),
        ...(primary
          ? tokenize(`${primary.title} ${primary.tags.join(' ')}`)
          : []),
      ].map(stem),
    );
    const fresh = ConversationService.CHIP_POOL.filter(
      (chip) =>
        tokenize(chip).filter((token) => asked.has(stem(token))).length < 1,
    );
    return fresh.slice(0, 3);
  }

  private primaryText(source: PublicSource, snippet: string): string {
    if (source.answer) return source.answer;
    const sentence = snippet.replace(/^…/, '').replace(/…$/, '').trim();
    return sentence.length > 0 ? sentence : source.summary;
  }

  private actionForQuery(
    query: string,
    flags: Record<string, boolean>,
  ): AnswerPayload['action'] {
    const text = query.toLowerCase();
    const routes = this.content.routes();
    if (/\b(price|pricing|plan|plans|cost|quote)\b/.test(text)) {
      return flags.assistant_lead_submit && !flags.assistant_kill
        ? { type: 'flow', flow: 'quote', label: 'Ask for a quote' }
        : {
            type: 'link',
            href: routes.WEB_PRICING.href,
            label: routes.WEB_PRICING.label,
          };
    }
    if (/\b(onboard|onboarding|getting started|implementation)\b/.test(text)) {
      return {
        type: 'flow',
        flow: 'onboarding',
        label: 'Open onboarding checklist',
      };
    }
    if (
      /\b(trust|compliance|certif|soc 2|iso|gdpr|security programme)\b/.test(
        text,
      )
    ) {
      return {
        type: 'link',
        href: routes.WEB_TRUST.href,
        label: routes.WEB_TRUST.label,
      };
    }
    if (/\b(integrations?|connectors?|siem|telemetry sources?)\b/.test(text)) {
      return {
        type: 'link',
        href: routes.WEB_INTEGRATIONS.href,
        label: routes.WEB_INTEGRATIONS.label,
      };
    }
    return undefined;
  }

  private citationsFor(ids: string[]): Citation[] {
    return ids
      .map((id) => this.content.getSource(id))
      .filter((source): source is PublicSource => Boolean(source))
      .map((source) => this.citation(source));
  }

  private citation(source: PublicSource): Citation {
    return {
      source_id: source.id,
      title: source.title,
      url: source.canonicalUrl,
      kind: source.kind,
    };
  }

  private uniqueSources(sources: PublicSource[]): PublicSource[] {
    const seen = new Set<string>();
    return sources.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
  }

  private buildEvents(record: MessageRecord): StreamEvent[] {
    const events: StreamEvent[] = [
      {
        seq: 1,
        type: 'acknowledged',
        data: {
          message_id: record.id,
          session_id: record.sessionId,
          epoch: record.epoch,
        },
      },
      { seq: 2, type: 'progress', data: { stage: 'retrieving' } },
      { seq: 3, type: 'progress', data: { stage: 'validating' } },
    ];

    if (record.outcome === 'REJECTED') {
      events.push({
        seq: 4,
        type: 'safety_limited',
        data: {
          reason:
            record.payload.blocks[0]?.text ??
            'The message could not be answered in public chat.',
        },
      });
    } else {
      events.push({
        seq: 4,
        type: 'delta',
        data: { blocks: record.payload.blocks },
      });
    }

    events.push({
      seq: 5,
      type: 'final',
      data: {
        message_id: record.id,
        outcome: record.outcome,
        blocks: record.payload.blocks,
        citations: record.payload.citations,
        follow_up_chips: record.payload.follow_up_chips,
        ...(record.payload.route_key
          ? { route_key: record.payload.route_key }
          : {}),
        ...(record.payload.action ? { action: record.payload.action } : {}),
      },
    });
    return events;
  }

  private evict() {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, record] of this.messages) {
      if (record.createdAt < cutoff) {
        this.messages.delete(id);
        this.byClientId.delete(`${record.sessionId}:${record.clientMessageId}`);
      }
    }
  }
}
