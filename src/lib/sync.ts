import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { APP_CONFIG, VIDEO_SYNC_STATUS } from './constants';
import { logger } from './logger';
import {
  checkAndIncrementQuotaWithinTx,
  incrementQuotaWithinTx,
} from './quota';
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

export async function progressiveSync(
  userId: string,
  options: ProgressiveSyncOptions = {}
): Promise<SyncResult> {
  const opts = { ...defaultOptions, ...options };
  const batchSize = APP_CONFIG.sync.batchSize;
  const consecutiveThreshold =
    APP_CONFIG.sync.consecutiveExistingBatchesThreshold;
  const syncStartedAt = new Date();

  let totalFetched = 0;
  let totalNew = 0;
  let totalExisting = 0;
  let pageToken: string | undefined;
  let reachedEnd = false;
  let consecutiveExistingBatches = 0;

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

    const insertedCount = await syncBatchToDatabase({
      userId,
      fetchedVideos,
      shouldCheckQuota: opts.checkQuota,
      syncStartedAt,
    });

    totalNew += insertedCount;
    totalExisting += fetchedVideos.length - insertedCount;
    consecutiveExistingBatches =
      insertedCount === 0 ? consecutiveExistingBatches + 1 : 0;

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
  if (reachedEnd) {
    unlikedCount = await markVideosAsUnliked(
      userId,
      totalFetched === 0 ? undefined : syncStartedAt
    );
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

async function syncBatchToDatabase({
  userId,
  fetchedVideos,
  shouldCheckQuota,
  syncStartedAt,
}: {
  userId: string;
  fetchedVideos: YouTubeVideo[];
  shouldCheckQuota: boolean;
  syncStartedAt: Date;
}): Promise<number> {
  if (fetchedVideos.length === 0) return 0;
  const youtubeIds = fetchedVideos.map((v) => v.youtubeId);

  return db.transaction(async (tx) => {
    const insertResult = await tx
      .insert(videos)
      .values(
        fetchedVideos.map((v) => ({
          userId,
          youtubeId: v.youtubeId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          channelName: v.channelName,
          channelId: v.channelId,
          publishedAt: v.publishedAt,
          syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
          lastSeenAt: syncStartedAt,
        }))
      )
      .onConflictDoNothing({
        target: [videos.userId, videos.youtubeId],
      });

    const insertedCount = insertResult?.rowCount ?? 0;

    await tx
      .update(videos)
      .set({
        lastSeenAt: sql`COALESCE(GREATEST(${videos.lastSeenAt}, ${syncStartedAt}), ${syncStartedAt})`,
        syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
      })
      .where(and(eq(videos.userId, userId), inArray(videos.youtubeId, youtubeIds)));

    if (insertedCount > 0) {
      if (shouldCheckQuota) {
        await checkAndIncrementQuotaWithinTx(tx, userId, 'sync', insertedCount);
      } else {
        await incrementQuotaWithinTx(tx, userId, 'sync', insertedCount);
      }
    }

    return insertedCount;
  });
}

async function markVideosAsUnliked(
  userId: string,
  syncStartedAt?: Date
): Promise<number> {
  const baseCondition = and(
    eq(videos.userId, userId),
    eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE)
  );

  const condition = syncStartedAt
    ? and(
        baseCondition,
        or(isNull(videos.lastSeenAt), lt(videos.lastSeenAt, syncStartedAt))
      )
    : baseCondition;

  const updated = await db
    .update(videos)
    .set({ syncStatus: VIDEO_SYNC_STATUS.UNLIKED })
    .where(condition)
    .returning({ id: videos.id });

  if (updated.length > 0) {
    logger.info(
      syncStartedAt
        ? 'Marked videos as unliked'
        : 'Marked all videos as unliked (no liked videos found)',
      { userId, count: updated.length }
    );
  }

  return updated.length;
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
