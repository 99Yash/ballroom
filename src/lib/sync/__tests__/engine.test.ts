import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedContentItem, SourceProvider, SyncPageResult } from '~/lib/sources/types';

// Mock dependencies before importing engine
vi.mock('~/lib/sources', () => ({
  providerRegistry: {
    resolve: vi.fn(),
  },
}));

vi.mock('../persistence', () => ({
  upsertBatch: vi.fn(),
  saveSyncState: vi.fn(),
  getFullSyncCooldownRemaining: vi.fn(),
}));

vi.mock('../reconcile', () => ({
  reconcileInactive: vi.fn(),
}));

vi.mock('~/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('~/lib/constants', () => ({
  APP_CONFIG: {
    sync: {
      batchSize: 10,
      consecutiveExistingBatchesThreshold: 2,
    },
    sourceLimits: {
      youtube: {
        quickSyncLimit: 50,
        extendedSyncLimit: 500,
        maxDepth: 10_000,
        fullSyncCooldownMs: 5 * 60 * 1000,
      },
      x: {
        quickSyncLimit: 50,
        extendedSyncLimit: 200,
        maxDepth: 2_000,
        fullSyncCooldownMs: 15 * 60 * 1000,
      },
    },
  },
}));

import { providerRegistry } from '~/lib/sources';
import { runSync } from '../engine';
import { getFullSyncCooldownRemaining, saveSyncState, upsertBatch } from '../persistence';
import { reconcileInactive } from '../reconcile';

function makeItem(id: string): NormalizedContentItem {
  return {
    externalId: id,
    title: `Item ${id}`,
    description: null,
    thumbnailUrl: null,
    authorName: null,
    authorId: null,
    publishedAt: null,
  };
}

function makeFakeProvider(pages: SyncPageResult[]): SourceProvider {
  let callIndex = 0;
  return {
    source: 'youtube',
    supportedCollections: ['likes'],
    fetchPage: vi.fn(async (): Promise<SyncPageResult> => {
      return pages[callIndex++] ?? { items: [], nextCursor: { token: null, reachedEnd: true } };
    }),
  };
}

function makePages(count: number, pageSize: number = 10): SyncPageResult[] {
  return Array.from({ length: count }, (_, i) => ({
    items: Array.from({ length: pageSize }, (_, j) => makeItem(`${i}-${j}`)),
    nextCursor: { token: `page${i + 1}`, reachedEnd: false },
  }));
}

describe('runSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFullSyncCooldownRemaining).mockResolvedValue(null);
    vi.mocked(upsertBatch).mockResolvedValue(0);
    vi.mocked(saveSyncState).mockResolvedValue(undefined);
    vi.mocked(reconcileInactive).mockResolvedValue(0);
  });

  it('fetches pages and returns correct counts for all-new items', async () => {
    const provider = makeFakeProvider([
      { items: [makeItem('1'), makeItem('2')], nextCursor: { token: 'p2', reachedEnd: false } },
      { items: [makeItem('3')], nextCursor: { token: null, reachedEnd: true } },
    ]);
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);
    vi.mocked(upsertBatch).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'quick' });

    expect(result.synced).toBe(3);
    expect(result.new).toBe(3);
    expect(result.existing).toBe(0);
    expect(result.reachedEnd).toBe(true);
    expect(result.source).toBe('youtube');
    expect(result.collection).toBe('likes');
    expect(result.mode).toBe('quick');
  });

  it('stops on empty page and marks reachedEnd', async () => {
    const provider = makeFakeProvider([
      { items: [], nextCursor: { token: null, reachedEnd: true } },
    ]);
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'quick' });

    expect(result.synced).toBe(0);
    expect(result.reachedEnd).toBe(true);
  });

  it('calls reconcileInactive when reachedEnd is true', async () => {
    const provider = makeFakeProvider([
      { items: [makeItem('1')], nextCursor: { token: null, reachedEnd: true } },
    ]);
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);
    vi.mocked(upsertBatch).mockResolvedValue(1);
    vi.mocked(reconcileInactive).mockResolvedValue(5);

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'full' });

    expect(reconcileInactive).toHaveBeenCalledWith(
      'user1',
      'youtube',
      'likes',
      expect.any(Date)
    );
    expect(result.inactive).toBe(5);
  });

  it('does not reconcile when reachedEnd is false', async () => {
    const provider = makeFakeProvider(makePages(6));
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);
    vi.mocked(upsertBatch).mockResolvedValue(0);

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'quick' });

    expect(reconcileInactive).not.toHaveBeenCalled();
    expect(result.reachedEnd).toBe(false);
  });

  it('stops at initialLimit when all batches are existing', async () => {
    // Quick mode: initialLimit=50, batchSize=10, threshold=2
    // All existing → consecutive grows each page.
    // At page 5: totalFetched=50 >= initialLimit, consecutive=5 >= threshold → BREAK
    const provider = makeFakeProvider(makePages(8));
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);
    vi.mocked(upsertBatch).mockResolvedValue(0);

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'quick' });

    expect(result.synced).toBe(50);
    expect(result.existing).toBe(50);
    expect(result.reachedEnd).toBe(false);
  });

  it('enforces full-sync cooldown', async () => {
    vi.mocked(providerRegistry.resolve).mockReturnValue(makeFakeProvider([]));
    vi.mocked(getFullSyncCooldownRemaining).mockResolvedValue(60_000);

    await expect(
      runSync('user1', 'youtube', 'likes', { mode: 'full' })
    ).rejects.toThrow(/cooldown/i);
  });

  it('does not check cooldown for quick/extended modes', async () => {
    const provider = makeFakeProvider([
      { items: [], nextCursor: { token: null, reachedEnd: true } },
    ]);
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);

    await runSync('user1', 'youtube', 'likes', { mode: 'quick' });
    await runSync('user1', 'youtube', 'likes', { mode: 'extended' });

    expect(getFullSyncCooldownRemaining).not.toHaveBeenCalled();
  });

  it('saves sync state on success with markFullSync for full mode', async () => {
    const provider = makeFakeProvider([
      { items: [], nextCursor: { token: null, reachedEnd: true } },
    ]);
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);

    await runSync('user1', 'youtube', 'likes', { mode: 'full' });

    expect(saveSyncState).toHaveBeenCalledWith(
      'user1',
      'youtube',
      'likes',
      { token: null, reachedEnd: true },
      null,
      { markFullSync: true }
    );
  });

  it('saves error state when sync fails', async () => {
    const provider: SourceProvider = {
      source: 'youtube',
      supportedCollections: ['likes'],
      fetchPage: vi.fn(async () => {
        throw new Error('API down');
      }),
    };
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);

    await expect(
      runSync('user1', 'youtube', 'likes', { mode: 'quick' })
    ).rejects.toThrow('API down');

    expect(saveSyncState).toHaveBeenCalledWith(
      'user1',
      'youtube',
      'likes',
      { token: null, reachedEnd: false },
      'API down'
    );
  });

  it('resets consecutive existing counter when new items appear', async () => {
    // Quick mode: initialLimit=50, batchSize=10, threshold=2
    // Pages 1-5: all new → consecutive stays 0, totalFetched=50
    //   After page 5: totalFetched=50 >= 50 BUT consecutive=0 < 2 → continue
    // Page 6: all existing → consecutive=1. 60 >= 50 but 1 < 2 → continue
    // Page 7: has 5 new → consecutive resets to 0. 70 >= 50 but 0 < 2 → continue
    // Page 8: all existing → consecutive=1. 80 >= 50 but 1 < 2 → continue
    // Page 9: all existing → consecutive=2. 90 >= 50 AND 2 >= 2 → BREAK
    const provider = makeFakeProvider(makePages(10));
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);

    vi.mocked(upsertBatch)
      .mockResolvedValueOnce(10) // page 1: all new
      .mockResolvedValueOnce(10) // page 2: all new
      .mockResolvedValueOnce(10) // page 3: all new
      .mockResolvedValueOnce(10) // page 4: all new
      .mockResolvedValueOnce(10) // page 5: all new (totalFetched=50, consecutive=0)
      .mockResolvedValueOnce(0)  // page 6: all existing (consecutive=1)
      .mockResolvedValueOnce(5)  // page 7: 5 new (consecutive resets to 0)
      .mockResolvedValueOnce(0)  // page 8: all existing (consecutive=1)
      .mockResolvedValueOnce(0); // page 9: all existing (consecutive=2 → break)

    const result = await runSync('user1', 'youtube', 'likes', { mode: 'quick' });

    expect(result.synced).toBe(90);
    expect(result.new).toBe(55);
    expect(result.existing).toBe(35);
  });

  it('uses per-source limits (x has tighter extendedSyncLimit)', async () => {
    // X extended: initialLimit=200, maxDepth=2000
    // All existing → breaks at totalFetched=200 (consecutive already >= 2 by page 2)
    const provider = makeFakeProvider(makePages(25));
    (provider as any).source = 'x';
    vi.mocked(providerRegistry.resolve).mockReturnValue(provider);
    vi.mocked(upsertBatch).mockResolvedValue(0);

    const result = await runSync('user1', 'x', 'likes', { mode: 'extended' });

    expect(result.synced).toBe(200);
  });
});
