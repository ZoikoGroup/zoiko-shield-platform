import { Injectable } from '@nestjs/common';
import { ModelProvider } from './model-provider.interface';
import { MockModelProvider } from './mock-model-provider';
import { GeminiModelProvider } from './gemini-model-provider';
import { OpenAiModelProvider } from './openai-model-provider';

/**
 * Maps ModelProfile.provider -> ModelProvider implementation.
 * Supports Google Gemini / Vertex AI, OpenAI, and deterministic Mock provider.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly providers = new Map<string, ModelProvider>();

  constructor(
    mockProvider: MockModelProvider,
    geminiProvider: GeminiModelProvider,
    openAiProvider: OpenAiModelProvider,
  ) {
    this.providers.set('mock', mockProvider);
    this.providers.set('gemini', geminiProvider);
    this.providers.set('google', geminiProvider);
    this.providers.set('vertex', geminiProvider);
    this.providers.set('openai', openAiProvider);
    this.providers.set('anthropic', mockProvider); // fallback until dedicated Anthropic key added
  }

  get(providerKey: string): ModelProvider {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      // Graceful fallback to mock if unknown provider requested
      return this.providers.get('mock')!;
    }
    return provider;
  }
}
