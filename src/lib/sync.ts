import { and, eq, inArray, notInArray, or, lt, isNull, sql } from 'drizzle-orm';
import { db } from '~/db';
import { user, videos } from '~/db/schemas';
import { APP_CONFIG, VIDEO_SYNC_STATUS } from './constants';
import { AppError } from './errors';
import { logger } from './logger';
import { checkQuota } from './quota';
import { fetchLikedVideos, type YouTubeVideo } from './youtube';

export interface ProgressiveSyncOptions {
  initialLimit?: number;
  maxDepth?: number;
  checkQuota?: boolean;
}

export interface SyncResult {
  synced: number;
  new: number;
  existing: number;
  unliked: number;
  reachedEnd: boolean;
}

const defaultOptions: Required<ProgressiveSyncOptions> = {
  initialLimit: APP_CONFIG.sync.quickSyncLimit,
  maxDepth: APP_CONFIG.sync.progressiveMaxDepth,
  checkQuota: true,
};

/**
 * Performs a progressive synchronization of YouTube liked videos for a user.
 *
 * This function implements an intelligent sync algorithm that fetches videos in batches
 * from the YouTube API and progressively syncs them to the database. It includes
 * early stopping logic to optimize performance when no new videos are found, quota
 * checking to enforce usage limits, and automatic marking of unliked videos.
 *
 * ## Algorithm Behavior
 *
 * The function fetches videos in batches (default: 50 per batch) and processes them
 * progressively:
 *
 * 1. **Batch Processing**: Fetches videos from YouTube API in configurable batch sizes
 * 2. **Deduplication**: Checks each batch against existing videos in the database
 * 3. **Quota Management**: Validates and increments quota usage for new videos
 * 4. **Early Stopping**: Stops early when multiple consecutive batches contain only
 *    existing videos (optimization to avoid unnecessary API calls)
 * 5. **Unliked Detection**: Marks videos as unliked if they're no longer in the
 *    user's liked videos list (only when sync reaches the end)
 *
 * ## Early Stopping Conditions
 *
 * The sync stops early (before reaching `maxDepth`) when:
 * - **Consecutive existing batches**: After fetching at least `initialLimit` videos,
 *   if 2 or more consecutive batches contain only videos that already exist in the
 *   database, the sync stops. This indicates we've likely reached the point where
 *   all newer videos are already synced.
 * - **No more pages**: When YouTube API returns no `nextPageToken`, indicating
 *   all liked videos have been fetched.
 * - **Empty batch**: When a batch returns zero videos.
 * - **Max depth reached**: When `totalFetched >= maxDepth` (hard limit).
 *
 * ## Quota Checking
 *
 * If `checkQuota` is enabled (default: true):
 * - Validates quota before inserting new videos (throws if quota exceeded)
 * - Automatically increments quota usage in the same transaction as video insertion
 * - Quota is checked per batch, so partial batches may be inserted before quota
 *   exhaustion is detected
 *
 * ## Unliked Video Marking
 *
 * Videos are marked as unliked only when:
 * - The sync reaches the end (either naturally or via early stopping)
 * - At least one video was fetched during the sync
 *
 * This ensures we have a complete snapshot of currently liked videos before
 * determining which previously synced videos are no longer liked.
 *
 * @param userId - The unique identifier of the user to sync videos for
 * @param options - Configuration options for the progressive sync
 * @param options.initialLimit - Minimum number of videos to fetch before early
 *   stopping is allowed. Default: `APP_CONFIG.sync.quickSyncLimit` (50).
 *   Early stopping only occurs after this many videos have been processed.
 * @param options.maxDepth - Maximum number of videos to fetch across all batches.
 *   Default: `APP_CONFIG.sync.progressiveMaxDepth` (10,000). Acts as a hard limit
 *   to prevent unbounded syncs. The sync will stop when this limit is reached.
 * @param options.checkQuota - Whether to check and enforce quota limits before
 *   inserting new videos. Default: `true`. When `false`, quota checks are skipped
 *   but quota is still incremented if videos are inserted.
 *
 * @returns A promise that resolves to a `SyncResult` object containing:
 *   - `synced`: Total number of videos fetched from YouTube (new + existing)
 *   - `new`: Number of videos that were newly inserted into the database
 *   - `existing`: Number of videos that were already in the database
 *   - `unliked`: Number of videos marked as unliked (no longer in liked list)
 *   - `reachedEnd`: Whether the sync reached the end of the liked videos list
 *     (true if no more pages available, false if stopped early)
 *
 * @throws {AuthenticationError} If the user has no Google account linked or
 *   authentication tokens are missing/invalid
 * @throws {QuotaExceededError} If quota checking is enabled and the user has
 *   exceeded their sync quota limit
 * @throws {Error} If video insertion fails after quota validation
 *
 * @example
 * // Quick sync with default settings (50 videos, early stopping enabled)
 * const result = await progressiveSync(userId);
 * console.log(`Synced ${result.synced} videos, ${result.new} new`);
 *
 * @example
 * // Extended sync with custom limits
 * const result = await progressiveSync(userId, {
 *   initialLimit: 500,
 *   maxDepth: 5000,
 *   checkQuota: true
 * });
 *
 * @example
 * // Full sync without quota checking (for admin/internal use)
 * const result = await progressiveSync(userId, {
 *   initialLimit: 10000,
 *   maxDepth: 10000,
 *   checkQuota: false
 * });
 */
export async function progressiveSync(
  userId: string,
  options: ProgressiveSyncOptions = {}
): Promise<SyncResult> {
  const opts = { ...defaultOptions, ...options };
  const batchSize = APP_CONFIG.sync.batchSize;

  let totalFetched = 0;
  let totalNew = 0;
  let totalExisting = 0;
  let pageToken: string | undefined;
  let reachedEnd = false;
  let consecutiveExistingBatches = 0;
  const allFetchedYoutubeIds: string[] = [];

  logger.info('Starting progressive sync', {
    userId,
    initialLimit: opts.initialLimit,
    maxDepth: opts.maxDepth,
  });

  while (totalFetched < opts.maxDepth) {
    const { videos: fetchedVideos, nextPageToken } = await fetchLikedVideos(
      userId,
      batchSize,
      pageToken
    );

    if (fetchedVideos.length === 0) {
      reachedEnd = true;
      break;
    }

    const youtubeIds = fetchedVideos.map((v) => v.youtubeId);
    allFetchedYoutubeIds.push(...youtubeIds);

    const existingVideos = await db
      .select({ youtubeId: videos.youtubeId })
      .from(videos)
      .where(
        and(eq(videos.userId, userId), inArray(videos.youtubeId, youtubeIds))
      );

    const existingIds = new Set(existingVideos.map((v) => v.youtubeId));
    const newVideos = fetchedVideos.filter(
      (v) => !existingIds.has(v.youtubeId)
    );

    const batchExisting = fetchedVideos.length - newVideos.length;
    totalExisting += batchExisting;

    if (newVideos.length > 0) {
      if (opts.checkQuota) {
        await checkQuota(userId, 'sync', newVideos.length);
      }

      try {
        await insertNewVideosAndIncrementQuota(
          userId,
          newVideos,
          opts.checkQuota
        );
        totalNew += newVideos.length;
        consecutiveExistingBatches = 0;
      } catch (error) {
        logger.error('Failed to insert videos after quota check', {
          userId,
          videoCount: newVideos.length,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    } else {
      consecutiveExistingBatches++;
    }

    await updateLastSeenAt(userId, youtubeIds);

    totalFetched += fetchedVideos.length;
    pageToken = nextPageToken;

    if (!pageToken) {
      reachedEnd = true;
      break;
    }

    if (totalFetched >= opts.initialLimit && consecutiveExistingBatches >= 2) {
      logger.debug(
        'Stopping progressive sync: multiple consecutive existing batches',
        {
          userId,
          totalFetched,
          consecutiveExistingBatches,
        }
      );
      break;
    }
  }

  let unlikedCount = 0;
  if (reachedEnd && allFetchedYoutubeIds.length > 0) {
    unlikedCount = await markUnlikedVideos(userId, allFetchedYoutubeIds);
  }

  logger.info('Progressive sync completed', {
    userId,
    synced: totalFetched,
    new: totalNew,
    existing: totalExisting,
    unliked: unlikedCount,
    reachedEnd,
  });

  return {
    synced: totalFetched,
    new: totalNew,
    existing: totalExisting,
    unliked: unlikedCount,
    reachedEnd,
  };
}

async function insertNewVideosAndIncrementQuota(
  userId: string,
  newVideos: YouTubeVideo[],
  shouldIncrementQuota: boolean
): Promise<void> {
  if (newVideos.length === 0) return;

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(videos).values(
      newVideos.map((v) => ({
        userId,
        youtubeId: v.youtubeId,
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        channelName: v.channelName,
        channelId: v.channelId,
        publishedAt: v.publishedAt,
        syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
        lastSeenAt: now,
      }))
    );

    if (shouldIncrementQuota) {
      await incrementQuotaInTransaction(tx, userId, 'sync', newVideos.length);
    }
  });
}

async function incrementQuotaInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  quotaType: 'sync' | 'categorize',
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  const column =
    quotaType === 'sync' ? user.syncQuotaUsed : user.categorizeQuotaUsed;
  const fieldName =
    quotaType === 'sync' ? 'syncQuotaUsed' : 'categorizeQuotaUsed';

  const result = await tx
    .update(user)
    .set({
      [fieldName]: sql`${column} + ${amount}`,
    })
    .where(eq(user.id, userId));

  const rowsAffected = result.rowCount ?? 0;
  if (rowsAffected === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `User not found: ${userId}`,
    });
  }

  logger.debug('Quota incremented in transaction', {
    userId,
    quotaType,
    amount,
  });
}

async function updateLastSeenAt(
  userId: string,
  youtubeIds: string[]
): Promise<void> {
  if (youtubeIds.length === 0) return;

  const threshold = new Date(
    Date.now() - APP_CONFIG.sync.lastSeenAtUpdateThresholdMs
  );

  await db
    .update(videos)
    .set({
      lastSeenAt: new Date(),
      syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
    })
    .where(
      and(
        eq(videos.userId, userId),
        inArray(videos.youtubeId, youtubeIds),
        or(
          isNull(videos.lastSeenAt),
          lt(videos.lastSeenAt, threshold),
          eq(videos.syncStatus, VIDEO_SYNC_STATUS.UNLIKED)
        )
      )
    );
}

async function markUnlikedVideos(
  userId: string,
  currentLikedYoutubeIds: string[]
): Promise<number> {
  if (currentLikedYoutubeIds.length === 0) return 0;

  const result = await db
    .update(videos)
    .set({ syncStatus: VIDEO_SYNC_STATUS.UNLIKED })
    .where(
      and(
        eq(videos.userId, userId),
        eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE),
        notInArray(videos.youtubeId, currentLikedYoutubeIds)
      )
    )
    .returning({ id: videos.id });

  if (result.length > 0) {
    logger.info('Marked videos as unliked', { userId, count: result.length });
  }

  return result.length;
}

export async function quickSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit'> = {}
): Promise<SyncResult> {
  return progressiveSync(userId, {
    ...options,
    initialLimit: APP_CONFIG.sync.quickSyncLimit,
  });
}

export async function extendedSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit'> = {}
): Promise<SyncResult> {
  return progressiveSync(userId, {
    ...options,
    initialLimit: APP_CONFIG.sync.extendedSyncLimit,
  });
}

export async function fullSync(
  userId: string,
  options: Omit<ProgressiveSyncOptions, 'initialLimit' | 'maxDepth'> = {}
): Promise<SyncResult> {
  return progressiveSync(userId, {
    ...options,
    initialLimit: APP_CONFIG.sync.progressiveMaxDepth,
    maxDepth: APP_CONFIG.sync.progressiveMaxDepth,
  });
}
