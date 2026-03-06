import { and, eq } from 'drizzle-orm';
import { db } from '~/db';
import { account } from '~/db/schemas';
import { env } from '~/lib/env';
import { AUTH_ERROR_TYPES, AppError, AuthenticationError } from '~/lib/errors';
import { logger } from '~/lib/logger';

// ---------------------------------------------------------------------------
// Types – X API v2 response shapes
// ---------------------------------------------------------------------------

export interface XTweet {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorProfileImageUrl: string | null;
  createdAt: Date | null;
  conversationId: string | null;
  lang: string | null;
}

interface XApiTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  lang?: string;
}

interface XApiUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}

interface XApiResponse {
  data?: XApiTweet[];
  includes?: { users?: XApiUser[] };
  meta?: {
    result_count: number;
    next_token?: string;
    previous_token?: string;
  };
  errors?: Array<{ message: string; type: string }>;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

async function getXCredentials(userId: string) {
  const userAccount = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'twitter')))
    .limit(1);

  if (!userAccount.length) {
    throw new AuthenticationError({
      message: 'No X account linked. Please sign in with X.',
      authErrorType: AUTH_ERROR_TYPES.NO_ACCOUNT,
    });
  }

  const acc = userAccount[0];

  if (!acc.accessToken) {
    throw new AuthenticationError({
      message: 'No access token available. Please re-authenticate with X.',
      authErrorType: AUTH_ERROR_TYPES.NO_ACCESS_TOKEN,
    });
  }

  return acc;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshAccessToken(
  accountId: string,
  refreshToken: string
): Promise<string> {
  const clientId = env.X_CLIENT_ID;
  const clientSecret = env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'X OAuth credentials not configured.',
    });
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Failed to refresh X access token', new Error(body), {
      accountId,
      status: response.status,
    });
    throw new AuthenticationError({
      message: 'Failed to refresh X access token. Please re-authenticate.',
      authErrorType: AUTH_ERROR_TYPES.TOKEN_REFRESH_FAILED,
    });
  }

  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  await db
    .update(account)
    .set({
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(tokens.expires_in
        ? {
            accessTokenExpiresAt: new Date(
              Date.now() + tokens.expires_in * 1000
            ),
          }
        : {}),
    })
    .where(eq(account.id, accountId));

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Core fetch helper with auto-refresh
// ---------------------------------------------------------------------------

const X_API_BASE = 'https://api.x.com/2';

async function xApiFetch(
  userId: string,
  path: string
): Promise<XApiResponse> {
  const acc = await getXCredentials(userId);
  let token = acc.accessToken!;

  // Try refresh if token is expired
  const isExpired =
    acc.accessTokenExpiresAt && acc.accessTokenExpiresAt.getTime() < Date.now();
  if (isExpired && acc.refreshToken) {
    token = await refreshAccessToken(acc.id, acc.refreshToken);
  }

  let response = await fetch(`${X_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once with a refreshed token on 401
  if (response.status === 401 && acc.refreshToken) {
    token = await refreshAccessToken(acc.id, acc.refreshToken);
    response = await fetch(`${X_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (response.status === 401) {
    throw new AuthenticationError({
      message: 'X API authentication failed. Please re-authenticate with X.',
      authErrorType: AUTH_ERROR_TYPES.TOKEN_EXPIRED,
    });
  }

  if (response.status === 403) {
    throw new AuthenticationError({
      message:
        'X API access forbidden. Your app may lack required scopes — please re-authenticate.',
      authErrorType: AUTH_ERROR_TYPES.TOKEN_EXPIRED,
    });
  }

  if (response.status === 429) {
    throw new AppError({
      code: 'TOO_MANY_REQUESTS',
      message: 'X API rate limit exceeded. Please wait and try again.',
    });
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error('X API request failed', new Error(body), {
      userId,
      path,
      status: response.status,
    });
    throw new AppError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'X API request failed. Please try again later.',
    });
  }

  return (await response.json()) as XApiResponse;
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

function buildUserMap(users?: XApiUser[]): Map<string, XApiUser> {
  const map = new Map<string, XApiUser>();
  if (users) {
    for (const u of users) {
      map.set(u.id, u);
    }
  }
  return map;
}

function transformTweet(
  tweet: XApiTweet,
  userMap: Map<string, XApiUser>
): XTweet {
  const author = tweet.author_id ? userMap.get(tweet.author_id) : undefined;
  return {
    id: tweet.id,
    text: tweet.text,
    authorId: tweet.author_id ?? '',
    authorName: author?.name ?? '',
    authorUsername: author?.username ?? '',
    authorProfileImageUrl: author?.profile_image_url ?? null,
    createdAt: tweet.created_at ? new Date(tweet.created_at) : null,
    conversationId: tweet.conversation_id ?? null,
    lang: tweet.lang ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TWEET_FIELDS = 'created_at,author_id,conversation_id,lang';
const USER_FIELDS = 'name,username,profile_image_url';
const EXPANSIONS = 'author_id';

export async function fetchXCollection(
  userId: string,
  collection: 'bookmarks' | 'likes',
  maxResults: number = 100,
  paginationToken?: string
): Promise<{
  tweets: XTweet[];
  nextToken: string | undefined;
}> {
  const acc = await getXCredentials(userId);
  const xUserId = acc.accountId;

  const endpoint =
    collection === 'bookmarks'
      ? `/users/${xUserId}/bookmarks`
      : `/users/${xUserId}/liked_tweets`;

  const params = new URLSearchParams({
    'tweet.fields': TWEET_FIELDS,
    'user.fields': USER_FIELDS,
    expansions: EXPANSIONS,
    max_results: String(Math.min(maxResults, 100)),
  });
  if (paginationToken) {
    params.set('pagination_token', paginationToken);
  }

  const data = await xApiFetch(userId, `${endpoint}?${params.toString()}`);

  if (!data.data) {
    // Empty collection — not an error
    return { tweets: [], nextToken: undefined };
  }

  const userMap = buildUserMap(data.includes?.users);
  const tweets = data.data.map((t) => transformTweet(t, userMap));

  return {
    tweets,
    nextToken: data.meta?.next_token,
  };
}
