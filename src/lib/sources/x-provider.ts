import { fetchXCollection, type XTweet } from '~/lib/x';
import type {
  CollectionType,
  NormalizedContentItem,
  SourceProvider,
  SyncCursor,
  SyncPageResult,
} from './types';

function normalizeXTweet(tweet: XTweet): NormalizedContentItem {
  // Use first 200 chars of text as title (tweets have no separate title)
  const title =
    tweet.text.length > 200 ? `${tweet.text.slice(0, 197)}...` : tweet.text;

  return {
    externalId: tweet.id,
    title,
    description: tweet.text,
    thumbnailUrl: tweet.authorProfileImageUrl,
    authorName: tweet.authorName || `@${tweet.authorUsername}`,
    authorId: tweet.authorId,
    publishedAt: tweet.createdAt,
    providerMetadata: {
      conversationId: tweet.conversationId,
      lang: tweet.lang,
      username: tweet.authorUsername,
    },
  };
}

export const xProvider: SourceProvider = {
  source: 'x',
  supportedCollections: ['likes', 'bookmarks'],

  async fetchPage(
    userId: string,
    collection: CollectionType,
    pageSize: number,
    cursor: SyncCursor
  ): Promise<SyncPageResult> {
    const xCollection = collection as 'likes' | 'bookmarks';

    const { tweets, nextToken } = await fetchXCollection(
      userId,
      xCollection,
      pageSize,
      cursor.token ?? undefined
    );

    return {
      items: tweets.map(normalizeXTweet),
      nextCursor: {
        token: nextToken ?? null,
        reachedEnd: !nextToken,
      },
    };
  },
};
