import { and, eq, inArray, isNull, lt, notInArray, or } from 'drizzle-orm';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { APP_CONFIG, VIDEO_SYNC_STATUS } from './constants';
import { logger } from './logger';
import {
  checkAndIncrementQuotaWithinTx,
  incrementQuotaWithinTx,
} from './quota';
import { fetchLikedVideos, type YouTubeVideo } from './youtube';

const FAILURE_TRACKER_MAX_SIZE = 1000;

const lastSeenAtFailureCounts = new Map<string, number>();

function trackFailure(userId: string): number {
  if (
    lastSeenAtFailureCounts.size >= FAILURE_TRACKER_MAX_SIZE &&
    !lastSeenAtFailureCounts.has(userId)
  ) {
    const oldestKey = lastSeenAtFailureCounts.keys().next().value;
    if (oldestKey) {
      lastSeenAtFailureCounts.delete(oldestKey);
    }
  }

  const count = (lastSeenAtFailureCounts.get(userId) ?? 0) + 1;
  lastSeenAtFailureCounts.set(userId, count);
  return count;
}

function clearFailure(userId: string): void {
  lastSeenAtFailureCounts.delete(userId);
}

/**
 * Retries a function with exponential backoff.
 * @param fn - Function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 100)
 * @returns Result of the function or throws the last error
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 100
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

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
 *   if the configured number of consecutive batches (default: 2, configurable via
 *   `APP_CONFIG.sync.consecutiveExistingBatchesThreshold`) contain only videos that
 *   already exist in the database, the sync stops. This indicates we've likely reached
 *   the point where all newer videos are already synced.
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
 * - **Important**: Quota is consumed atomically with video insertion. If videos are
 *   successfully inserted but the sync fails later (e.g., during `updateLastSeenAt`),
 *   the quota remains consumed. This is intentional - quota tracks successful video
 *   insertions, not sync completion status.
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
 *   but quota is still incremented for tracking purposes (useful for admin/internal
 *   operations that should not be limited but still tracked).
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
 * @throws {AppError with code 'QUOTA_EXCEEDED'} If quota checking is enabled and the user has
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
 * // Note: Uses APP_CONFIG.sync.progressiveMaxDepth (10,000) for both limits
 * const result = await progressiveSync(userId, {
 *   initialLimit: APP_CONFIG.sync.progressiveMaxDepth,
 *   maxDepth: APP_CONFIG.sync.progressiveMaxDepth,
 *   checkQuota: false
 * });
 */
export async function progressiveSync(
  userId: string,
  options: ProgressiveSyncOptions = {}
): Promise<SyncResult> {
  const opts = { ...defaultOptions, ...options };
  const batchSize = APP_CONFIG.sync.batchSize;
  const consecutiveThreshold =
    APP_CONFIG.sync.consecutiveExistingBatchesThreshold;

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
    consecutiveThreshold,
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
      try {
        await insertNewVideosAndIncrementQuota(
          userId,
          newVideos,
          opts.checkQuota
        );
        totalNew += newVideos.length;
        consecutiveExistingBatches = 0;
      } catch (error) {
        logger.error('Failed to insert videos', {
          userId,
          videoCount: newVideos.length,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    } else {
      consecutiveExistingBatches++;
    }

    try {
      await retryWithBackoff(
        () => updateLastSeenAt(userId, youtubeIds),
        3,
        100
      );
      clearFailure(userId);
    } catch (error) {
      const failureCount = trackFailure(userId);

      logger.error('Failed to update lastSeenAt after video sync batch', {
        userId,
        youtubeIdCount: youtubeIds.length,
        consecutiveFailures: failureCount,
        error: error instanceof Error ? error.message : String(error),
      });

      if (failureCount >= 3) {
        logger.warn(
          'Persistent lastSeenAt update failures detected - may affect unliked video detection',
          {
            userId,
            consecutiveFailures: failureCount,
          }
        );
      }
    }

    totalFetched += fetchedVideos.length;
    pageToken = nextPageToken;

    if (!pageToken) {
      reachedEnd = true;
      break;
    }

    if (
      totalFetched >= opts.initialLimit &&
      consecutiveExistingBatches >= consecutiveThreshold
    ) {
      logger.debug(
        'Stopping progressive sync: multiple consecutive existing batches',
        {
          userId,
          totalFetched,
          consecutiveExistingBatches,
          threshold: consecutiveThreshold,
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

/**
 * Inserts new videos and optionally increments quota within a single transaction.
 * Video insertion and quota increment happen atomically - if either fails, the transaction rolls back.
 * Once committed, quota remains consumed even if subsequent sync operations fail.
 *
 * @param userId - The user ID to insert videos for
 * @param newVideos - Array of YouTube videos to insert
 * @param shouldCheckQuota - If true, checks quota limits and increments quota.
 *   If false, quota limits are not checked but quota is still incremented for tracking.
 */
async function insertNewVideosAndIncrementQuota(
  userId: string,
  newVideos: YouTubeVideo[],
  shouldCheckQuota: boolean
): Promise<void> {
  if (newVideos.length === 0) return;

  const now = new Date();

  await db.transaction(async (tx) => {
    const insertResult = await tx
      .insert(videos)
      .values(
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
      )
      .onConflictDoNothing({
        target: [videos.userId, videos.youtubeId],
      });

    const actuallyInserted = insertResult.rowCount ?? 0;

    if (actuallyInserted > 0) {
      if (shouldCheckQuota) {
        await checkAndIncrementQuotaWithinTx(
          tx,
          userId,
          'sync',
          actuallyInserted
        );
      } else {
        await incrementQuotaWithinTx(tx, userId, 'sync', actuallyInserted);
      }
    }
  });
}

async function updateLastSeenAt(
  userId: string,
  youtubeIds: string[]
): Promise<void> {
  if (youtubeIds.length === 0) return;

  const now = new Date();
  const threshold = new Date(
    now.getTime() - APP_CONFIG.sync.lastSeenAtUpdateThresholdMs
  );

  await db
    .update(videos)
    .set({
      lastSeenAt: now,
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
