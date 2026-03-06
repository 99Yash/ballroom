import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
let returningResult: { id: string }[] = [];

vi.mock('~/db', () => ({
  db: {
    update: () => ({
      set: (...args: unknown[]) => {
        mockSet(...args);
        return {
          where: (...args: unknown[]) => {
            mockWhere(...args);
            return {
              returning: (...args: unknown[]) => {
                mockReturning(...args);
                return returningResult;
              },
            };
          },
        };
      },
    }),
  },
}));

vi.mock('~/db/schemas', () => ({
  videos: {
    userId: 'userId',
    source: 'source',
    collection: 'collection',
    syncStatus: 'syncStatus',
    lastSeenAt: 'lastSeenAt',
    id: 'id',
  },
}));

vi.mock('~/lib/constants', () => ({
  VIDEO_SYNC_STATUS: {
    ACTIVE: 'active',
    UNLIKED: 'unliked',
  },
}));

vi.mock('~/lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ type: 'and', args }),
  eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
  or: (...args: unknown[]) => ({ type: 'or', args }),
  isNull: (a: unknown) => ({ type: 'isNull', a }),
  lt: (a: unknown, b: unknown) => ({ type: 'lt', a, b }),
}));

import { reconcileInactive } from '../reconcile';

describe('reconcileInactive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    returningResult = [];
  });

  it('returns 0 when no items are marked inactive', async () => {
    returningResult = [];
    const count = await reconcileInactive('user1', 'youtube', 'likes', new Date());
    expect(count).toBe(0);
  });

  it('returns count of items marked inactive', async () => {
    returningResult = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const count = await reconcileInactive('user1', 'youtube', 'likes', new Date());
    expect(count).toBe(3);
  });

  it('sets syncStatus to UNLIKED', async () => {
    returningResult = [];
    await reconcileInactive('user1', 'youtube', 'likes', new Date());
    expect(mockSet).toHaveBeenCalledWith({ syncStatus: 'unliked' });
  });

  it('applies broader condition when syncStartedAt is undefined', async () => {
    returningResult = [{ id: '1' }];
    const count = await reconcileInactive('user1', 'x', 'bookmarks', undefined);
    expect(count).toBe(1);
    expect(mockWhere).toHaveBeenCalled();
  });
});
