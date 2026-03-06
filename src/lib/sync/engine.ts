import { APP_CONFIG } from '~/lib/constants';
import type { SourceSyncLimits } from '~/lib/constants';
import { AppError } from '~/lib/errors';
import { logger } from '~/lib/logger';
import { providerRegistry } from '~/lib/sources';
import type {
  CollectionType,
  ContentSource,
  SyncCursor,
  SyncMode,
  SyncResult,
} from '~/lib/sources/types';
import { EMPTY_CURSOR } from '~/lib/sources/types';
import {
  getFullSyncCooldownRemaining,
  saveSyncState,
  upsertBatch,
} from './persistence';
import { reconcileInactive } from './reconcile';

export interface SyncEngineOptions {
  mode: SyncMode;
  checkQuota?: boolean;
}

function getSourceLimits(source: ContentSource): SourceSyncLimits {
  return APP_CONFIG.sourceLimits[source];
}

function getSyncLimits(
  mode: SyncMode,
  source: ContentSource
): {
  initialLimit: number;
  maxDepth: number;
} {
  const limits = getSourceLimits(source);
  switch (mode) {
    case 'quick':
      return {
        initialLimit: limits.quickSyncLimit,
        maxDepth: limits.maxDepth,
      };
    case 'extended':
      return {
        initialLimit: limits.extendedSyncLimit,
        maxDepth: limits.maxDepth,
      };
    case 'full':
      return {
        initialLimit: limits.maxDepth,
        maxDepth: limits.maxDepth,
      };
  }
}

/**
 * Generic progressive sync loop.
 *
 * Resolves the provider from the registry, fetches pages in a loop,
 * upserts items, and applies reconciliation when the end of the
 * collection is reached.
 *
 * Enforces per-source limits (max depth, cooldown for full syncs).
 */
export async function runSync(
  userId: string,
  source: ContentSource,
  collection: CollectionType,
  options: SyncEngineOptions
): Promise<SyncResult> {
  const provider = providerRegistry.resolve(source, collection);
  const { initialLimit, maxDepth } = getSyncLimits(options.mode, source);
  const batchSize = APP_CONFIG.sync.batchSize;
  const consecutiveThreshold =
    APP_CONFIG.sync.consecutiveExistingBatchesThreshold;
  const checkQuota = options.checkQuota ?? true;
  const syncStartedAt = new Date();

  // Enforce full-sync cooldown per source/collection
  if (options.mode === 'full') {
    const sourceLimits = getSourceLimits(source);
    const cooldownRemaining = await getFullSyncCooldownRemaining(
      userId,
      source,
      collection,
      sourceLimits.fullSyncCooldownMs
    );
    if (cooldownRemaining !== null) {
      const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
      throw new AppError({
        code: 'TOO_MANY_REQUESTS',
        message: `Full sync for ${source}/${collection} is on cooldown. Please wait ${cooldownSeconds} seconds.`,
      });
    }
  }

  let totalFetched = 0;
  let totalNew = 0;
  let totalExisting = 0;
  let consecutiveExistingBatches = 0;
  let reachedEnd = false;
  let cursor: SyncCursor = EMPTY_CURSOR;

  logger.info('Starting sync', {
    userId,
    source,
    collection,
    mode: options.mode,
    initialLimit,
    maxDepth,
    consecutiveThreshold,
  });

  try {
    while (totalFetched < maxDepth) {
      const page = await provider.fetchPage(
        userId,
        collection,
        batchSize,
        cursor
      );

      if (page.items.length === 0) {
        reachedEnd = true;
        break;
      }

      const insertedCount = await upsertBatch({
        userId,
        source,
        collection,
        items: page.items,
        syncStartedAt,
        checkQuota,
      });

      totalNew += insertedCount;
      totalExisting += page.items.length - insertedCount;
      consecutiveExistingBatches =
        insertedCount === 0 ? consecutiveExistingBatches + 1 : 0;

      totalFetched += page.items.length;
      cursor = page.nextCursor;

      if (cursor.token === null) {
        reachedEnd = true;
        break;
      }

      if (
        totalFetched >= initialLimit &&
        consecutiveExistingBatches >= consecutiveThreshold
      ) {
        logger.debug(
          'Stopping sync: consecutive existing batches threshold reached',
          {
            userId,
            source,
            collection,
            totalFetched,
            consecutiveExistingBatches,
            threshold: consecutiveThreshold,
          }
        );
        break;
      }
    }

    let inactiveCount = 0;
    if (reachedEnd) {
      inactiveCount = await reconcileInactive(
        userId,
        source,
        collection,
        totalFetched === 0 ? undefined : syncStartedAt
      );
    }

    // Persist sync state on success (mark full sync timestamp for cooldown)
    await saveSyncState(
      userId,
      source,
      collection,
      {
        token: cursor.token,
        reachedEnd,
      },
      null,
      { markFullSync: options.mode === 'full' }
    );

    const durationMs = Date.now() - syncStartedAt.getTime();

    logger.info('Sync completed', {
      userId,
      source,
      collection,
      mode: options.mode,
      status: 'success',
      synced: totalFetched,
      new: totalNew,
      existing: totalExisting,
      inactive: inactiveCount,
      reachedEnd,
      durationMs,
    });

    return {
      source,
      collection,
      mode: options.mode,
      synced: totalFetched,
      new: totalNew,
      existing: totalExisting,
      inactive: inactiveCount,
      reachedEnd,
    };
  } catch (error) {
    const durationMs = Date.now() - syncStartedAt.getTime();

    logger.error('Sync failed', {
      userId,
      source,
      collection,
      mode: options.mode,
      status: 'error',
      errorCode:
        error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });

    // Persist error state so it's visible in sync status
    await saveSyncState(
      userId,
      source,
      collection,
      { token: cursor.token, reachedEnd: false },
      error instanceof Error ? error.message : String(error)
    ).catch((saveErr) => {
      logger.warn('Failed to persist sync error state', {
        userId,
        source,
        collection,
        saveErr:
          saveErr instanceof Error ? saveErr.message : String(saveErr),
      });
    });

    throw error;
  }
}
