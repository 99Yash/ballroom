import { youtube, youtube_v3 } from '@googleapis/youtube';
import { and, eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '~/db';
import { account } from '~/db/schemas';

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
async function createYouTubeClient(
  userId: string
): Promise<youtube_v3.Youtube> {
  const userAccount = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'google')))
    .limit(1);

  if (!userAccount.length) {
    throw new Error('No Google account linked');
  }

  const acc = userAccount[0];

  if (!acc.accessToken) {
    throw new Error('No access token available');
  }

  if (!acc.refreshToken) {
    throw new Error('No refresh token available. Please re-authenticate.');
  }

  // Create OAuth2 client with credentials
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: acc.accessToken,
    refresh_token: acc.refreshToken,
    expiry_date: acc.accessTokenExpiresAt?.getTime(),
  });

  // Set up automatic token refresh and persistence
  oauth2Client.on('tokens', async (tokens) => {
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
  });

  return youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Transform YouTube API playlist item to our YouTubeVideo type
 */
function transformPlaylistItem(
  item: youtube_v3.Schema$PlaylistItem
): YouTubeVideo | null {
  const snippet = item.snippet;
  if (!snippet || !snippet.resourceId?.videoId) {
    return null;
  }

  return {
    youtubeId: snippet.resourceId.videoId,
    title: snippet.title || 'Untitled',
    description: snippet.description || '',
    thumbnailUrl:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      '',
    channelName: snippet.videoOwnerChannelTitle || snippet.channelTitle || '',
    channelId: snippet.videoOwnerChannelId || '',
    publishedAt: snippet.publishedAt
      ? new Date(snippet.publishedAt)
      : new Date(),
  };
}

/**
 * Fetch liked videos from YouTube
 * Uses the special "LL" playlist which contains all liked videos
 */
export async function fetchLikedVideos(
  userId: string,
  maxResults: number = 50,
  pageToken?: string
): Promise<{
  videos: YouTubeVideo[];
  nextPageToken?: string;
  totalResults: number;
}> {
  const yt = await createYouTubeClient(userId);

  const response = await yt.playlistItems.list({
    playlistId: 'LL',
    part: ['snippet'],
    maxResults: Math.min(maxResults, 50),
    pageToken,
  });

  const items = response.data.items || [];
  const videos = items
    .map(transformPlaylistItem)
    .filter((v): v is YouTubeVideo => v !== null);

  return {
    videos,
    nextPageToken: response.data.nextPageToken || undefined,
    totalResults: response.data.pageInfo?.totalResults || 0,
  };
}

/**
 * Fetch all liked videos (handles pagination)
 */
export async function fetchAllLikedVideos(
  userId: string,
  limit?: number
): Promise<YouTubeVideo[]> {
  const allVideos: YouTubeVideo[] = [];
  let pageToken: string | undefined;

  do {
    const { videos, nextPageToken } = await fetchLikedVideos(
      userId,
      50,
      pageToken
    );
    allVideos.push(...videos);
    pageToken = nextPageToken;

    // If we have a limit and we've reached it, stop
    if (limit && allVideos.length >= limit) {
      return allVideos.slice(0, limit);
    }
  } while (pageToken);

  return allVideos;
}
