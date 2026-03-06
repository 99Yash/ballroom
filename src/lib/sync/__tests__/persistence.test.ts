import { beforeEach, describe, expect, it, vi } from 'vitest';

// Track calls for assertions
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock('~/db', () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    onConflictDoNothing: vi.fn().mockResolvedValue({ rowCount: 0 }),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      select: (...args: unknown[]) => {
        mockDbSelect(...args);
        return selectChain;
      },
      insert: (...args: unknown[]) => {
        mockDbInsert(...args);
        return insertChain;
      },
      update: () => updateChain,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        mockDbTransaction();
        const txInsertChain = {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockResolvedValue({ rowCount: 0 }),
        };
        const txUpdateChain = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        const tx = {
          insert: () => txInsertChain,
          update: () => txUpdateChain,
        };
        return fn(tx);
      },
    },
  };
});

vi.mock('~/db/schemas', () => ({
  syncState: {
    userId: 'userId',
    source: 'source',
    collection: 'collection',
    cursor: 'cursor',
    reachedEnd: 'reachedEnd',
    lastFullSyncAt: 'lastFullSyncAt',
  },
  videos: {
    userId: 'userId',
    source: 'source',
    collection: 'collection',
    externalId: 'externalId',
    syncStatus: 'syncStatus',
    lastSeenAt: 'lastSeenAt',
  },
}));

vi.mock('~/lib/constants', () => ({
  VIDEO_SYNC_STATUS: { ACTIVE: 'active', UNLIKED: 'unliked' },
}));

vi.mock('~/lib/quota', () => ({
  checkAndIncrementQuotaWithinTx: vi.fn(),
  incrementQuotaWithinTx: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ type: 'and', args }),
  eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
  inArray: (a: unknown, b: unknown) => ({ type: 'inArray', a, b }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  }),
}));

import { getFullSyncCooldownRemaining, loadSyncState, saveSyncState, upsertBatch } from '../persistence';
import { checkAndIncrementQuotaWithinTx, incrementQuotaWithinTx } from '~/lib/quota';

describe('loadSyncState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns EMPTY_CURSOR when no state exists', async () => {
    const cursor = await loadSyncState('user1', 'youtube', 'likes');
    expect(cursor).toEqual({ token: null, reachedEnd: false });
  });
});

describe('saveSyncState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls insert with upsert on conflict', async () => {
    await saveSyncState('user1', 'youtube', 'likes', {
      token: 'abc',
      reachedEnd: false,
    });
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it('does not throw on success', async () => {
    await expect(
      saveSyncState('user1', 'x', 'bookmarks', {
        token: null,
        reachedEnd: true,
      })
    ).resolves.toBeUndefined();
  });
});

describe('getFullSyncCooldownRemaining', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no state exists (never synced)', async () => {
    const result = await getFullSyncCooldownRemaining(
      'user1', 'youtube', 'likes', 300_000
    );
    expect(result).toBeNull();
  });
});

describe('upsertBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 0 for empty items array', async () => {
    const count = await upsertBatch({
      userId: 'user1',
      source: 'youtube',
      collection: 'likes',
      items: [],
      syncStartedAt: new Date(),
      checkQuota: true,
    });
    expect(count).toBe(0);
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('runs in a transaction for non-empty items', async () => {
    const count = await upsertBatch({
      userId: 'user1',
      source: 'youtube',
      collection: 'likes',
      items: [
        {
          externalId: 'vid1',
          title: 'Test',
          description: null,
          thumbnailUrl: null,
          authorName: null,
          authorId: null,
          publishedAt: null,
        },
      ],
      syncStartedAt: new Date(),
      checkQuota: false,
    });
    expect(mockDbTransaction).toHaveBeenCalled();
    expect(count).toBe(0); // mock returns rowCount=0
  });
});
