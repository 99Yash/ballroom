import { NextResponse } from 'next/server';
import { categorizeUserVideos } from '~/lib/ai/categorize';
import { handleApiError } from '~/lib/api-utils';
import { requireSession } from '~/lib/auth/session';
import { logger } from '~/lib/logger';
import { runSync } from '~/lib/sync/engine';
import { syncToPlaylists } from '~/lib/sync/playlist-sync';

const activeSyncUsers = new Set<string>();

export async function POST() {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const userId = session.user.id;

    if (activeSyncUsers.has(userId)) {
      return NextResponse.json(
        { error: 'Sync already in progress' },
        { status: 429 }
      );
    }

    activeSyncUsers.add(userId);

    try {
      // Step 1: Quick sync YouTube likes
      const syncResult = await runSync(userId, 'youtube', 'likes', {
        mode: 'quick',
        checkQuota: true,
      });

      let categorizeResult = null;
      let playlistResult = null;

      // Step 2: If new videos found, auto-categorize
      if (syncResult.new > 0) {
        try {
          categorizeResult = await categorizeUserVideos(userId);
        } catch (error) {
          logger.warn(
            'Smart sync: categorization failed, skipping playlists',
            {
              userId,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Step 3: Always attempt playlist sync — handles both newly categorized
      // and existing videos that haven't been pushed to playlists yet
      try {
        playlistResult = await syncToPlaylists(userId);
      } catch (error) {
        logger.warn('Smart sync: playlist sync failed', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const response = {
        sync: {
          new: syncResult.new,
          existing: syncResult.existing,
        },
        categorized: categorizeResult?.categorized ?? 0,
        playlists: playlistResult
          ? {
              synced: playlistResult.synced,
              created: playlistResult.playlistsCreated,
            }
          : null,
        hasNewContent: syncResult.new > 0,
      };

      logger.api('POST', '/api/smart-sync', {
        userId,
        duration: Date.now() - startTime,
        status: 200,
        newVideos: syncResult.new,
        categorized: categorizeResult?.categorized ?? 0,
        playlistsSynced: playlistResult?.synced ?? 0,
      });

      return NextResponse.json(response);
    } finally {
      activeSyncUsers.delete(userId);
    }
  } catch (error) {
    return handleApiError(error, 'POST', '/api/smart-sync', startTime);
  }
}
