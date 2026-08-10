import { Injectable } from '@nestjs/common';
import { ModelProvider } from './model-provider.interface';
import { MockModelProvider } from './mock-model-provider';

/**
 * Maps ModelProfile.provider -> ModelProvider implementation. Only 'mock'
 * is registered this pass (explicit product decision) — adding a real
 * Claude/OpenAI adapter later is exactly `this.providers.set('anthropic', ...)`,
 * nothing else in the gateway pipeline changes.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly providers = new Map<string, ModelProvider>();

  constructor(mockProvider: MockModelProvider) {
    this.providers.set('mock', mockProvider);
  }

  get(providerKey: string): ModelProvider {
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(`No ModelProvider registered for key '${providerKey}'`);
    }
    return provider;
  }
}
