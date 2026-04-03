import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import { logger } from '~/lib/logger';
import {
  addVideoToPlaylist,
  createPlaylist,
  createYouTubeClient,
} from '~/lib/youtube';

export interface PlaylistSyncResult {
  synced: number;
  playlistsCreated: number;
  failed: number;
  remaining: number;
}

/**
 * Sync categorized YouTube videos to their category's YouTube playlist.
 *
 * - Finds YouTube videos that have a category but haven't been added to a playlist yet.
 * - Lazily creates playlists for categories that don't have one.
 * - Adds each video to its category's playlist and records the playlistItemId.
 */
export async function syncToPlaylists(
  userId: string,
  /** Max videos to add per call. Keeps YouTube API quota usage in check (50 units per insert). */
  limit: number = 10
): Promise<PlaylistSyncResult> {
  const pendingFilter = and(
    eq(videos.userId, userId),
    eq(videos.source, 'youtube'),
    eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE),
    isNotNull(videos.categoryId),
    isNull(videos.youtubePlaylistItemId)
  );

  // Get total count and limited batch in parallel
  const [countResult, batch] = await Promise.all([
    db
      .select({ total: count() })
      .from(videos)
      .where(pendingFilter),
    db
      .select({
        id: videos.id,
        externalId: videos.externalId,
        categoryId: videos.categoryId,
      })
      .from(videos)
      .where(pendingFilter)
      .orderBy(videos.createdAt)
      .limit(limit),
  ]);

  const totalPending = countResult[0]?.total ?? 0;

  if (batch.length === 0) {
    return { synced: 0, playlistsCreated: 0, failed: 0, remaining: 0 };
  }

  // Create YouTube client once for the entire sync run
  const yt = await createYouTubeClient(userId);

  // Load only categories referenced by this batch
  const categoryIds = [...new Set(batch.map((v) => v.categoryId!))];
  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      youtubePlaylistId: categories.youtubePlaylistId,
    })
    .from(categories)
    .where(
      and(eq(categories.userId, userId), inArray(categories.id, categoryIds))
    );

  const categoryMap = new Map(userCategories.map((c) => [c.id, c]));

  let synced = 0;
  let playlistsCreated = 0;
  let failed = 0;

  // Ensure playlists exist for all relevant categories (lazy creation)
  for (const catId of categoryIds) {
    const cat = categoryMap.get(catId);
    if (!cat) continue;

    if (!cat.youtubePlaylistId) {
      try {
        const playlistId = await createPlaylist(userId, cat.name, undefined, yt);
        const updated = await db
          .update(categories)
          .set({ youtubePlaylistId: playlistId })
          .where(
            and(
              eq(categories.id, catId),
              eq(categories.userId, userId),
              isNull(categories.youtubePlaylistId)
            )
          )
          .returning({ id: categories.id });

        if (updated.length > 0) {
          cat.youtubePlaylistId = playlistId;
          playlistsCreated++;
        } else {
          // Another request already created a playlist — re-read it
          const existing = await db
            .select({ youtubePlaylistId: categories.youtubePlaylistId })
            .from(categories)
            .where(
              and(eq(categories.id, catId), eq(categories.userId, userId))
            )
            .limit(1);
          cat.youtubePlaylistId = existing[0]?.youtubePlaylistId ?? null;
        }
      } catch (error) {
        logger.error('Failed to create playlist for category', error, {
          userId,
          categoryId: catId,
          categoryName: cat.name,
        });
        // Skip videos in this category — will retry on next poll
        continue;
      }
    }
  }

  // Add videos to their playlists
  for (const video of batch) {
    const cat = categoryMap.get(video.categoryId!);
    if (!cat?.youtubePlaylistId) continue;

    try {
      const itemId = await addVideoToPlaylist(
        userId,
        cat.youtubePlaylistId,
        video.externalId,
        yt
      );

      await db
        .update(videos)
        .set({ youtubePlaylistItemId: itemId })
        .where(eq(videos.id, video.id));

      synced++;
    } catch (error) {
      logger.warn('Failed to add video to playlist', {
        userId,
        videoId: video.id,
        playlistId: cat.youtubePlaylistId,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  const remaining = totalPending - synced - failed;

  logger.info('Playlist sync completed', {
    userId,
    synced,
    playlistsCreated,
    failed,
    batch: batch.length,
    remaining,
  });

  return { synced, playlistsCreated, failed, remaining };
}
