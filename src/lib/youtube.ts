import { youtube, youtube_v3 } from '@googleapis/youtube';
import { and, eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '~/db';
import { account } from '~/db/schemas';
import { env } from '~/lib/env';
import { AUTH_ERROR_TYPES, AuthenticationError } from '~/lib/errors';
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

/**
 * Create an authenticated YouTube client for a user
 */
async function createYouTubeClient(userId: string) {
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
    try {
      if (tokens.access_token) {
        await db
          .update(account)
          .set({
            accessToken: tokens.access_token,
            accessTokenExpiresAt: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : undefined,
          })
          .where(eq(account.id, acc.id));
      }
    } catch (error) {
      // Production consideration: Token refresh persistence failures are logged but not retried
      // to avoid interrupting the OAuth flow. If persistence fails, the new token is lost and
      // the user will need to re-authenticate on the next request. For production, consider:
      // 1. Implementing retry logic with exponential backoff for transient DB failures
      // 2. Setting up alerting/monitoring for persistent failures (e.g., Sentry, PagerDuty)
      // 3. Using a queue/background job to retry failed token updates asynchronously
      logger.error('Failed to persist refreshed token', error, {
        userId,
        accountId: acc.id,
      });
    }
  });

  return youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Transform YouTube API video item to our YouTubeVideo type
 */
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
 * Fetch liked videos from YouTube
 * Uses the videos.list API with myRating='like' parameter (modern approach)
 */
export async function fetchLikedVideos(
  userId: string,
  maxResults: number = 50,
  pageToken?: string
) {
  const yt = await createYouTubeClient(userId);

  const response = await yt.videos.list({
    myRating: 'like',
    part: ['snippet'],
    maxResults: Math.min(maxResults, 50),
    pageToken,
  });

  const items = response.data.items || [];
  const videos = items
    .map(transformVideoItem)
    .filter((v): v is YouTubeVideo => v !== null);

  return {
    videos,
    nextPageToken: response.data.nextPageToken || undefined,
    totalResults: response.data.pageInfo?.totalResults || 0,
  };
}
