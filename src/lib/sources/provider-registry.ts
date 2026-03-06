import type { CollectionType, ContentSource, SourceProvider } from './types';
import { isValidSourceCollection } from './types';

/**
 * Registry for source provider adapters.
 *
 * Providers register themselves at startup. The sync engine and API layer
 * look up providers by source key to dispatch work.
 */
class ProviderRegistry {
  private providers = new Map<ContentSource, SourceProvider>();

  register(provider: SourceProvider): void {
    if (this.providers.has(provider.source)) {
      throw new Error(
        `Provider already registered for source: ${provider.source}`
      );
    }
    this.providers.set(provider.source, provider);
  }

  get(source: ContentSource): SourceProvider {
    const provider = this.providers.get(source);
    if (!provider) {
      throw new Error(`No provider registered for source: ${source}`);
    }
    return provider;
  }

  has(source: ContentSource): boolean {
    return this.providers.has(source);
  }

  /**
   * Resolve a provider for a given source+collection, validating that
   * the combination is supported by both the app and the provider.
   */
  resolve(source: ContentSource, collection: CollectionType): SourceProvider {
    if (!isValidSourceCollection(source, collection)) {
      throw new Error(
        `Unsupported source/collection combination: ${source}/${collection}`
      );
    }

    const provider = this.get(source);

    if (!provider.supportedCollections.includes(collection)) {
      throw new Error(
        `Provider ${source} does not support collection: ${collection}`
      );
    }

    return provider;
  }

  /** List all registered source keys. */
  sources(): ContentSource[] {
    return Array.from(this.providers.keys());
  }
}

/** Singleton provider registry. */
export const providerRegistry = new ProviderRegistry();
