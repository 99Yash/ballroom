import { fetchLikedVideos } from '~/lib/youtube';
import { normalizeYouTubeVideo } from './normalize';
import type {
  CollectionType,
  SourceProvider,
  SyncCursor,
  SyncPageResult,
} from './types';

export const youtubeProvider: SourceProvider = {
  source: 'youtube',
  supportedCollections: ['likes'],

  async fetchPage(
    userId: string,
    _collection: CollectionType,
    pageSize: number,
    cursor: SyncCursor
  ): Promise<SyncPageResult> {
    const { videos, nextPageToken } = await fetchLikedVideos(
      userId,
      pageSize,
      cursor.token ?? undefined
    );

    return {
      items: videos.map(normalizeYouTubeVideo),
      nextCursor: {
        token: nextPageToken ?? null,
        reachedEnd: !nextPageToken,
      },
    };
  },
};
