import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '~/db';
import { videos } from '~/db/schemas';
import { APP_CONFIG, VIDEO_SYNC_STATUS } from './constants';
import { logger } from './logger';
import { checkQuota, incrementQuota } from './quota';
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

      await insertNewVideos(userId, newVideos);
      totalNew += newVideos.length;

      if (opts.checkQuota) {
        await incrementQuota(userId, 'sync', newVideos.length);
      }

      consecutiveExistingBatches = 0;
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

async function insertNewVideos(
  userId: string,
  newVideos: YouTubeVideo[]
): Promise<void> {
  if (newVideos.length === 0) return;

  const now = new Date();

  await db.insert(videos).values(
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
}

async function updateLastSeenAt(
  userId: string,
  youtubeIds: string[]
): Promise<void> {
  if (youtubeIds.length === 0) return;

  await db
    .update(videos)
    .set({
      lastSeenAt: new Date(),
      syncStatus: VIDEO_SYNC_STATUS.ACTIVE,
    })
    .where(
      and(eq(videos.userId, userId), inArray(videos.youtubeId, youtubeIds))
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
