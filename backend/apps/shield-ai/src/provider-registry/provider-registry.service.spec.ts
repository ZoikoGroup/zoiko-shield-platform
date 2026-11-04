import { ProviderRegistryService } from './provider-registry.service';
import { MockModelProvider } from './mock-model-provider';
import { GeminiModelProvider } from './gemini-model-provider';
import { OpenAiModelProvider } from './openai-model-provider';
import { AiUnavailableException } from '../gateway/fallback/fallback.exceptions';
import { ModelInvocationInput } from './model-provider.interface';

const ENV_KEYS = [
  'NODE_ENV',
  'GEMINI_API_KEY',
  'VERTEX_AI_API_KEY',
  'OPENAI_API_KEY',
] as const;

const input: ModelInvocationInput = {
  systemPrompt: 'sys',
  userInput: 'summarise the case',
  retrievalContext: JSON.stringify({ sourceRefs: ['evt-1', 'evt-2'] }),
  outputSchema: {},
};

describe('Model providers — synthetic output is never served in production', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let mock: MockModelProvider;
  let gemini: GeminiModelProvider;
  let openai: OpenAiModelProvider;
  let registry: ProviderRegistryService;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mock = new MockModelProvider();
    gemini = new GeminiModelProvider();
    openai = new OpenAiModelProvider();
    registry = new ProviderRegistryService(mock, gemini, openai);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    jest.restoreAllMocks();
  });

  describe('production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it.each(['mock', 'anthropic', 'unknown-vendor'])(
      'registry refuses provider key %s instead of returning the mock',
      (key) => {
        expect(() => registry.get(key)).toThrow(AiUnavailableException);
      },
    );

    it('registry still returns real adapters', () => {
      expect(registry.get('gemini')).toBe(gemini);
      expect(registry.get('vertex')).toBe(gemini);
      expect(registry.get('openai')).toBe(openai);
    });

    it('mock provider refuses to invoke', async () => {
      await expect(mock.invoke(input)).rejects.toThrow(AiUnavailableException);
    });

    it.each([
      ['gemini', () => gemini],
      ['openai', () => openai],
    ])('%s fails closed when no API key is configured', async (_name, get) => {
      await expect(get().invoke(input)).rejects.toThrow(AiUnavailableException);
    });

    it.each([
      ['gemini', 'GEMINI_API_KEY', () => gemini],
      ['openai', 'OPENAI_API_KEY', () => openai],
    ])(
      '%s fails closed when the upstream call fails instead of fabricating output',
      async (_name, envKey, get) => {
        process.env[envKey] = 'test-key';
        jest
          .spyOn(global, 'fetch')
          .mockResolvedValue(new Response('{}', { status: 503 }));
        await expect(get().invoke(input)).rejects.toThrow(
          AiUnavailableException,
        );
      },
    );
  });

  describe('non-production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('registry falls back to the mock for unknown keys', () => {
      expect(registry.get('unknown-vendor')).toBe(mock);
      expect(registry.get('anthropic')).toBe(mock);
    });

    it('mock and keyless real providers return deterministic output', async () => {
      for (const provider of [mock, gemini, openai]) {
        const result = await provider.invoke(input);
        expect(result.citedSourceRefs.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Real providers — citations reflect the model output, keys stay out of URLs', () => {
  const realFetch = global.fetch;
  const savedEnv = { ...process.env };
  const retrieval = JSON.stringify({ sourceRefs: ['evt-1', 'evt-2', 'evt-3'] });
  const fetchMock = jest.fn();

  const geminiReply = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });
  const openAiReply = (text: string) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...savedEnv };
  });

  it('sends the Gemini key in x-goog-api-key and never in the URL', async () => {
    process.env.GEMINI_API_KEY = 'secret-gemini-key';
    fetchMock.mockResolvedValue(geminiReply('{"citedSourceRefs":["evt-2"]}'));

    await new GeminiModelProvider().invoke({
      ...input,
      retrievalContext: retrieval,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('secret-gemini-key');
    expect(String(url)).not.toContain('key=');
    expect(init.headers['x-goog-api-key']).toBe('secret-gemini-key');
  });

  it('Gemini cites only the refs the model returned, not the first N retrieved', async () => {
    process.env.GEMINI_API_KEY = 'k';
    fetchMock.mockResolvedValue(
      geminiReply('{"answer":"x","citedSourceRefs":["evt-3"]}'),
    );

    const result = await new GeminiModelProvider().invoke({
      ...input,
      retrievalContext: retrieval,
    });
    expect(result.citedSourceRefs).toEqual(['evt-3']);
  });

  it('OpenAI cites nothing when the model output references no source', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValue(
      openAiReply('An answer that names no evidence.'),
    );

    const result = await new OpenAiModelProvider().invoke({
      ...input,
      retrievalContext: retrieval,
    });
    expect(result.citedSourceRefs).toEqual([]);
  });

  it('passes invented refs through so the citation validator can degrade the answer', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValue(
      openAiReply('{"citedSourceRefs":["evt-1","evt-made-up"]}'),
    );

    const result = await new OpenAiModelProvider().invoke({
      ...input,
      retrievalContext: retrieval,
    });
    expect(result.citedSourceRefs).toEqual(['evt-1', 'evt-made-up']);
  });

  it('falls back to retrieved refs named verbatim in non-JSON text', async () => {
    process.env.OPENAI_API_KEY = 'k';
    fetchMock.mockResolvedValue(
      openAiReply('Based on evt-2, the login was anomalous.'),
    );

    const result = await new OpenAiModelProvider().invoke({
      ...input,
      retrievalContext: retrieval,
    });
    expect(result.citedSourceRefs).toEqual(['evt-2']);
  });
});
