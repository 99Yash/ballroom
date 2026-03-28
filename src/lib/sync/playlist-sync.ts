import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '~/db';
import { categories, videos } from '~/db/schemas';
import { VIDEO_SYNC_STATUS } from '~/lib/constants';
import { logger } from '~/lib/logger';
import { addVideoToPlaylist, createPlaylist } from '~/lib/youtube';

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
  // Find YouTube videos that are categorized but not yet in a playlist
  const videosToSync = await db
    .select({
      id: videos.id,
      externalId: videos.externalId,
      categoryId: videos.categoryId,
    })
    .from(videos)
    .where(
      and(
        eq(videos.userId, userId),
        eq(videos.source, 'youtube'),
        eq(videos.syncStatus, VIDEO_SYNC_STATUS.ACTIVE),
        isNotNull(videos.categoryId),
        isNull(videos.youtubePlaylistItemId)
      )
    );

  if (videosToSync.length === 0) {
    return { synced: 0, playlistsCreated: 0, failed: 0, remaining: 0 };
  }

  const totalPending = videosToSync.length;
  // Cap to limit to avoid blowing YouTube API quota
  const batch = videosToSync.slice(0, limit);

  // Load user categories that have videos to sync
  const categoryIds = [...new Set(batch.map((v) => v.categoryId!))];
  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      youtubePlaylistId: categories.youtubePlaylistId,
    })
    .from(categories)
    .where(eq(categories.userId, userId));

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
        const playlistId = await createPlaylist(userId, cat.name);
        await db
          .update(categories)
          .set({ youtubePlaylistId: playlistId })
          .where(eq(categories.id, catId));
        cat.youtubePlaylistId = playlistId;
        playlistsCreated++;
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
        video.externalId
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
