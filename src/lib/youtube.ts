import { youtube, youtube_v3 } from '@googleapis/youtube';
import { and, eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '~/db';
import { account } from '~/db/schemas';
import { env } from '~/lib/env';
import { AUTH_ERROR_TYPES, AppError, AuthenticationError } from '~/lib/errors';
import { logger } from '~/lib/logger';

export interface YouTubeVideo {
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  channelId: string;
  publishedAt: Date;
}

export async function createYouTubeClient(userId: string) {
  const userAccount = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'google')))
    .limit(1);

  if (!userAccount.length) {
    throw new AuthenticationError({
      message: 'No Google account linked. Please sign in with Google.',
      authErrorType: AUTH_ERROR_TYPES.NO_ACCOUNT,
    });
  }

  const acc = userAccount[0];

  if (!acc.accessToken) {
    throw new AuthenticationError({
      message: 'No access token available. Please re-authenticate with Google.',
      authErrorType: AUTH_ERROR_TYPES.NO_ACCESS_TOKEN,
    });
  }

  if (!acc.refreshToken) {
    throw new AuthenticationError({
      message:
        'No refresh token available. Please re-authenticate with Google.',
      authErrorType: AUTH_ERROR_TYPES.NO_REFRESH_TOKEN,
    });
  }

  const oauth2Client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: acc.accessToken,
    refresh_token: acc.refreshToken,
    expiry_date: acc.accessTokenExpiresAt?.getTime(),
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (!tokens.access_token) {
      return;
    }

    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await db
          .update(account)
          .set({
            accessToken: tokens.access_token,
            accessTokenExpiresAt: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : undefined,
          })
          .where(eq(account.id, acc.id));

        if (attempt > 0) {
          logger.info('Successfully persisted refreshed token after retry', {
            userId,
            accountId: acc.id,
            attempt: attempt + 1,
          });
        }
        return;
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries - 1) {
          break;
        }

        const delayMs = 100 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        logger.warn('Failed to persist refreshed token, retrying', {
          userId,
          accountId: acc.id,
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.error(
      'Failed to persist refreshed token after all retries',
      lastError,
      {
        userId,
        accountId: acc.id,
        maxRetries,
        recommendation:
          'User may need to re-authenticate if token expires. Consider setting up monitoring for persistent failures.',
      }
    );
  });

  return youtube({ version: 'v3', auth: oauth2Client });
}

function transformVideoItem(item: youtube_v3.Schema$Video) {
  const snippet = item.snippet;
  if (!snippet || !item.id) {
    return null;
  }

  return {
    youtubeId: item.id,
    title: snippet.title || 'Untitled',
    description: snippet.description || '',
    thumbnailUrl:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      '',
    channelName: snippet.channelTitle || '',
    channelId: snippet.channelId || '',
    publishedAt: snippet.publishedAt
      ? new Date(snippet.publishedAt)
      : new Date(),
  };
}

/**
 * Fetch liked videos from YouTube using the videos.list API with myRating='like'
 *
 * @throws {AuthenticationError} If authentication fails or tokens are invalid
 * @throws {AppError} If API call fails due to rate limits, network errors, or invalid responses
 */
export async function fetchLikedVideos(
  userId: string,
  maxResults: number = 50,
  pageToken?: string
) {
  const yt = await createYouTubeClient(userId);

  try {
    const response = await yt.videos.list({
      myRating: 'like',
      part: ['snippet'],
      maxResults: Math.min(maxResults, 50),
      pageToken,
    });

    if (!response.data) {
      logger.error('YouTube API returned empty response', { userId });
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'YouTube API returned an invalid response',
      });
    }

    const items = response.data.items || [];
    const videos = items
      .map((item) => {
        const video = transformVideoItem(item);
        if (!video) {
          logger.warn('Failed to transform YouTube video item', {
            userId,
            videoId: item.id,
            hasSnippet: !!item.snippet,
          });
        }
        return video;
      })
      .filter((v): v is YouTubeVideo => v !== null);

    return {
      videos,
      nextPageToken: response.data.nextPageToken || undefined,
      totalResults: response.data.pageInfo?.totalResults || 0,
    };
  } catch (error) {
    return handleYouTubeApiError(error, userId, 'fetch liked videos');
  }
}

function handleYouTubeApiError(
  error: unknown,
  userId: string,
  operation: string
): never {
  if (error instanceof AuthenticationError || error instanceof AppError) {
    throw error;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const apiError = error as { code?: number; message?: string };

    if (apiError.code === 429) {
      throw new AppError({
        code: 'TOO_MANY_REQUESTS',
        message: `YouTube API rate limit exceeded during ${operation}.`,
        cause: error,
      });
    }

    if (apiError.code === 401) {
      throw new AuthenticationError({
        message: 'YouTube API authentication failed. Please re-authenticate.',
        authErrorType: AUTH_ERROR_TYPES.TOKEN_EXPIRED,
        cause: error,
      });
    }

    if (apiError.code === 403) {
      if (apiError.message?.toLowerCase().includes('quota')) {
        throw new AppError({
          code: 'TOO_MANY_REQUESTS',
          message: 'YouTube API quota exceeded. Please try again later.',
          cause: error,
        });
      }
      throw new AuthenticationError({
        message:
          'YouTube API access forbidden. You may need to re-authenticate with updated permissions.',
        authErrorType: AUTH_ERROR_TYPES.TOKEN_EXPIRED,
        cause: error,
      });
    }
  }

  logger.error(`Unexpected error during ${operation}`, error, { userId });
  throw new AppError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${operation}. Please try again later.`,
    cause: error,
  });
}

/**
 * Create a YouTube playlist for a category.
 * Returns the playlist ID.
 */
export async function createPlaylist(
  userId: string,
  title: string,
  description?: string,
  existingClient?: Awaited<ReturnType<typeof createYouTubeClient>>
): Promise<string> {
  const yt = existingClient ?? (await createYouTubeClient(userId));

  try {
    const response = await yt.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: description || `Auto-managed playlist for "${title}"`,
        },
        status: {
          privacyStatus: 'private',
        },
      },
    });

    const playlistId = response.data.id;
    if (!playlistId) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'YouTube API returned empty playlist ID',
      });
    }

    logger.info('Created YouTube playlist', { userId, playlistId, title });
    return playlistId;
  } catch (error) {
    return handleYouTubeApiError(error, userId, 'create playlist');
  }
}

/**
 * Add a video to a YouTube playlist.
 * Returns the playlist item ID (used for dedup and future removal).
 */
export async function addVideoToPlaylist(
  userId: string,
  playlistId: string,
  videoId: string,
  existingClient?: Awaited<ReturnType<typeof createYouTubeClient>>
): Promise<string> {
  const yt = existingClient ?? (await createYouTubeClient(userId));

  try {
    const response = await yt.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId,
          },
        },
      },
    });

    const itemId = response.data.id;
    if (!itemId) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'YouTube API returned empty playlist item ID',
      });
    }

    logger.debug('Added video to YouTube playlist', {
      userId,
      playlistId,
      videoId,
      itemId,
    });
    return itemId;
  } catch (error) {
    return handleYouTubeApiError(error, userId, 'add video to playlist');
  }
}
