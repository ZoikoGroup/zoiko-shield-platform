import { guardOutput, LlmService, type LlmAnswer } from './llm.service';
import type { PublicSource } from '../content/types';

const answer = (overrides: Partial<LlmAnswer> = {}): LlmAnswer => ({
  kind: 'answer',
  paragraphs: ['ZoikoShield correlates telemetry and raises alerts.'],
  bullets: [],
  citations: ['cap-detection'],
  ...overrides,
});

describe('guardOutput', () => {
  it('accepts a plain, grounded answer', () => {
    expect(guardOutput(answer())).toBeNull();
  });

  it.each([
    ['empty', answer({ paragraphs: [], bullets: [] }), 'empty'],
    ['too long', answer({ paragraphs: ['x'.repeat(1700)] }), 'too_long'],
    ['a URL', answer({ paragraphs: ['See https://example.com for more.'] }), 'url'],
    ['a price', answer({ paragraphs: ['It costs $500 per month.'] }), 'price'],
    ['a percentage', answer({ paragraphs: ['It has 99% accuracy.'] }), 'percentage_claim'],
    ['an SLA figure', answer({ paragraphs: ['We offer 24/7 coverage.'] }), 'sla_claim'],
    ['prompt disclosure', answer({ paragraphs: ['My instructions say to help.'] }), 'prompt_disclosure'],
    ['a certification claim', answer({ paragraphs: ['We are SOC 2 certified.'] }), 'certification_claim'],
    ['an audit claim in a bullet', answer({ bullets: ['ISO 27001 audited annually'] }), 'certification_claim'],
  ])('rejects %s', (_label, value, reason) => {
    expect(guardOutput(value)).toBe(reason);
  });

  it('allows a sentence that explicitly declines to claim a certification', () => {
    expect(guardOutput(answer({ paragraphs: ['I cannot confirm that ZoikoShield is SOC 2 certified.'] }))).toBeNull();
  });

  it('allows naming a framework without claiming it', () => {
    expect(guardOutput(answer({ paragraphs: ['Ask the trust team about GDPR scope.'] }))).toBeNull();
  });
});

describe('LlmService', () => {
  const source = { id: 'cap-detection', title: 'Detection "core"', body: 'Detection body text.' } as PublicSource;
  const original = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  let fetchMock: jest.SpyInstance;

  const reply = (content: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => ({ choices: [{ message: { content } }] }) }) as unknown as Response;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.GROQ_MODEL;
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (original === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = original;
    if (originalModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalModel;
  });

  it('is disabled and makes no request without a key', async () => {
    delete process.env.GROQ_API_KEY;
    const service = new LlmService();
    expect(service.enabled()).toBe(false);
    await expect(service.answer('q', [source])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a valid JSON answer and sends sources and earlier questions as data', async () => {
    fetchMock.mockResolvedValue(
      reply(JSON.stringify({ kind: 'answer', paragraphs: [' Hello '], bullets: ['a'], citations: ['cap-detection'] })),
    );
    const service = new LlmService();
    const result = await service.answer('how does <b>detection</b> work', [source], ['earlier one']);
    expect(result).toEqual({ kind: 'answer', paragraphs: ['Hello'], bullets: ['a'], citations: ['cap-detection'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('api.groq.com');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format).toEqual({ type: 'json_object' });
    const user = body.messages[1].content as string;
    expect(user).toContain('<source id="cap-detection"');
    expect(user).toContain('EARLIER VISITOR QUESTIONS');
    expect(user).toContain('<question>earlier one</question>');
    expect(user).not.toContain('<b>');
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('does not send reasoning effort to a non-reasoning model', async () => {
    process.env.GROQ_MODEL = 'llama-3.1-8b-instant';
    fetchMock.mockResolvedValue(reply(JSON.stringify({ kind: 'abstain', paragraphs: [], bullets: [], citations: [] })));
    await new LlmService().answer('q', [source]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('llama-3.1-8b-instant');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it.each([
    ['an HTTP error', () => reply('', false, 500)],
    ['non-JSON output', () => reply('not json')],
    ['an unknown kind', () => reply(JSON.stringify({ kind: 'weird', paragraphs: ['x'] }))],
    ['a missing choice', () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response],
  ])('returns null on %s', async (_label, make) => {
    fetchMock.mockResolvedValue(make());
    await expect(new LlmService().answer('q', [source])).resolves.toBeNull();
  });

  it('returns null on a network error and on a timeout', async () => {
    const service = new LlmService();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(service.answer('q', [source])).resolves.toBeNull();
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abort);
    await expect(service.answer('q', [source])).resolves.toBeNull();
  });

  it('opens a circuit after three failures and stops calling the provider', async () => {
    fetchMock.mockResolvedValue(reply('', false, 503));
    const service = new LlmService();
    for (let i = 0; i < 3; i += 1) await service.answer('q', [source]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(service.answer('q', [source])).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
