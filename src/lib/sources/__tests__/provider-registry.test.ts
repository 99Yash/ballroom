import { beforeEach, describe, expect, it } from 'vitest';
import type { SourceProvider } from '../types';
import { isValidSourceCollection } from '../types';

// Inline ProviderRegistry to test logic without importing the singleton
// (which auto-registers real providers and has side effects)
class ProviderRegistry {
  private providers = new Map<string, SourceProvider>();

  register(provider: SourceProvider): void {
    if (this.providers.has(provider.source)) {
      throw new Error(
        `Provider already registered for source: ${provider.source}`
      );
    }
    this.providers.set(provider.source, provider);
  }

  get(source: string): SourceProvider {
    const provider = this.providers.get(source);
    if (!provider) {
      throw new Error(`No provider registered for source: ${source}`);
    }
    return provider;
  }

  has(source: string): boolean {
    return this.providers.has(source);
  }

  resolve(source: string, collection: string): SourceProvider {
    if (!isValidSourceCollection(source as any, collection as any)) {
      throw new Error(
        `Unsupported source/collection combination: ${source}/${collection}`
      );
    }
    const provider = this.get(source);
    if (!provider.supportedCollections.includes(collection as any)) {
      throw new Error(
        `Provider ${source} does not support collection: ${collection}`
      );
    }
    return provider;
  }

  sources(): string[] {
    return Array.from(this.providers.keys());
  }
}

function makeFakeProvider(
  source: 'youtube' | 'x',
  collections: readonly string[] = ['likes']
): SourceProvider {
  return {
    source,
    supportedCollections: collections as any,
    fetchPage: async () => ({ items: [], nextCursor: { token: null, reachedEnd: true } }),
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and retrieves a provider', () => {
    const provider = makeFakeProvider('youtube');
    registry.register(provider);
    expect(registry.get('youtube')).toBe(provider);
  });

  it('has() returns false for unregistered sources', () => {
    expect(registry.has('youtube')).toBe(false);
  });

  it('has() returns true for registered sources', () => {
    registry.register(makeFakeProvider('youtube'));
    expect(registry.has('youtube')).toBe(true);
  });

  it('throws on duplicate registration', () => {
    registry.register(makeFakeProvider('youtube'));
    expect(() => registry.register(makeFakeProvider('youtube'))).toThrow(
      'Provider already registered for source: youtube'
    );
  });

  it('throws when getting unregistered source', () => {
    expect(() => registry.get('x')).toThrow(
      'No provider registered for source: x'
    );
  });

  it('lists registered sources', () => {
    registry.register(makeFakeProvider('youtube'));
    registry.register(makeFakeProvider('x', ['likes', 'bookmarks']));
    expect(registry.sources()).toEqual(['youtube', 'x']);
  });

  describe('resolve', () => {
    it('resolves valid source+collection', () => {
      const provider = makeFakeProvider('x', ['likes', 'bookmarks']);
      registry.register(provider);
      expect(registry.resolve('x', 'bookmarks')).toBe(provider);
    });

    it('rejects invalid source/collection combo (youtube/bookmarks)', () => {
      registry.register(makeFakeProvider('youtube'));
      expect(() => registry.resolve('youtube', 'bookmarks')).toThrow(
        'Unsupported source/collection combination: youtube/bookmarks'
      );
    });

    it('rejects when provider does not support the collection', () => {
      // Register x provider that only supports likes (not bookmarks)
      const provider = makeFakeProvider('x', ['likes']);
      registry.register(provider);
      expect(() => registry.resolve('x', 'bookmarks')).toThrow(
        'Provider x does not support collection: bookmarks'
      );
    });
  });
});
